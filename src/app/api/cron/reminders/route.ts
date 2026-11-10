/**
 * ==================================================
 * API Route: /api/cron/reminders
 * ==================================================
 * Endpoint ให้ตัวจับเวลาภายนอก (Synology Task Scheduler / host cron) เรียกเข้ามา
 * เป็นระยะ (แนะนำทุก 1 นาที) เพื่อส่งแจ้งเตือนเข้ากลุ่ม LINE สำหรับงานที่ถึงเวลา
 * reminderAt แล้วแต่ยังไม่เคยส่ง (reminderSentAt เป็น null)
 *
 * ตัวอย่างการเรียกจาก Task Scheduler:
 *   curl -H "x-cron-secret: $CRON_SECRET" https://<domain>/api/cron/reminders
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import os from 'os';
import { prisma } from '@/lib/prisma';
import { sendLineGroupMessage } from '@/lib/line';
import { logger } from '@/lib/logger';
import { acquireLock, releaseLock } from '@/lib/cron-lock';
import { getFeatureSettings } from '@/lib/feature-settings-server';
import { isFeatureOn, isOptionOn } from '@/lib/features';

const JOB_NAME = 'reminders';

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get('x-cron-secret');

  if (!secret || !provided) return false;

  const secretBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);
  if (secretBuffer.length !== providedBuffer.length) return false;

  return crypto.timingSafeEqual(secretBuffer, providedBuffer);
}

function buildReminderMessage(
  task: {
    title: string;
    description: string | null;
    reminderAt: Date | null;
    assignee: { name: string } | null;
  },
  label = '🔔 แจ้งเตือนงาน',
): string {
  const lines = [`${label}: ${task.title}`];

  if (task.description) {
    lines.push(task.description);
  }

  if (task.assignee) {
    lines.push(`ผู้รับผิดชอบ: ${task.assignee.name}`);
  }

  if (task.reminderAt) {
    const formatted = task.reminderAt.toLocaleString('th-TH', {
      year: '2-digit',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    lines.push(`กำหนด: ${formatted}`);
  }

  return lines.join('\n');
}

/** ผลลัพธ์การประมวลผลแจ้งเตือน 1 รอบ (1 ประเภท) */
interface ReminderPassResult {
  checked: number;
  sent: number;
  failed: number;
}

/** ประมวลผลแจ้งเตือนแบบเจาะจงเวลา (Task.reminderAt / reminderSentAt) - พฤติกรรมเดิม */
async function processExactReminders(now: Date): Promise<ReminderPassResult> {
  const dueTasks = await prisma.task.findMany({
    where: {
      reminderAt: { lte: now },
      reminderSentAt: null,
      archivedAt: null,
      ownerId: null, // งานส่วนตัวไม่ส่งเข้ากลุ่ม LINE (จะเปิดเผยงานส่วนตัวให้ทั้งกลุ่ม)
    },
    include: {
      assignee: { select: { name: true } },
    },
  });

  let sent = 0;
  let failed = 0;

  for (const task of dueTasks) {
    // claim แถวนี้แบบ atomic ก่อนส่ง กันส่งซ้ำหาก Task Scheduler เรียกซ้อนกัน
    const claim = await prisma.task.updateMany({
      where: { id: task.id, reminderSentAt: null },
      data: { reminderSentAt: now },
    });

    if (claim.count === 0) {
      // แถวนี้ถูก request อื่น claim ไปแล้ว ข้าม
      continue;
    }

    const message = buildReminderMessage(task);
    const ok = await sendLineGroupMessage(message);

    if (ok) {
      sent++;
    } else {
      failed++;
      logger.error('ส่งแจ้งเตือนงานเข้ากลุ่ม LINE ไม่สำเร็จ (เจาะจงเวลา)', { taskId: task.id });
    }
  }

  return { checked: dueTasks.length, sent, failed };
}

/** ประมวลผลแจ้งเตือนล่วงหน้า 1 วัน เวลา 19:00 (Task.reminderDayBeforeAt / reminderDayBeforeSentAt) */
async function processDayBeforeReminders(now: Date): Promise<ReminderPassResult> {
  const dueTasks = await prisma.task.findMany({
    where: {
      reminderDayBeforeAt: { lte: now },
      reminderDayBeforeSentAt: null,
      archivedAt: null,
      ownerId: null, // งานส่วนตัวไม่ส่งเข้ากลุ่ม LINE (จะเปิดเผยงานส่วนตัวให้ทั้งกลุ่ม)
    },
    include: {
      assignee: { select: { name: true } },
    },
  });

  let sent = 0;
  let failed = 0;

  for (const task of dueTasks) {
    const claim = await prisma.task.updateMany({
      where: { id: task.id, reminderDayBeforeSentAt: null },
      data: { reminderDayBeforeSentAt: now },
    });

    if (claim.count === 0) continue;

    const message = buildReminderMessage(task, '🔔 แจ้งเตือนล่วงหน้า (พรุ่งนี้ถึงกำหนด)');
    const ok = await sendLineGroupMessage(message);

    if (ok) {
      sent++;
    } else {
      failed++;
      logger.error('ส่งแจ้งเตือนงานเข้ากลุ่ม LINE ไม่สำเร็จ (ล่วงหน้า 1 วัน)', { taskId: task.id });
    }
  }

  return { checked: dueTasks.length, sent, failed };
}

/** ประมวลผลแจ้งเตือนวันจริง เวลา 08:00 (Task.reminderOnDayAt / reminderOnDaySentAt) */
async function processOnDayReminders(now: Date): Promise<ReminderPassResult> {
  const dueTasks = await prisma.task.findMany({
    where: {
      reminderOnDayAt: { lte: now },
      reminderOnDaySentAt: null,
      archivedAt: null,
      ownerId: null, // งานส่วนตัวไม่ส่งเข้ากลุ่ม LINE (จะเปิดเผยงานส่วนตัวให้ทั้งกลุ่ม)
    },
    include: {
      assignee: { select: { name: true } },
    },
  });

  let sent = 0;
  let failed = 0;

  for (const task of dueTasks) {
    const claim = await prisma.task.updateMany({
      where: { id: task.id, reminderOnDaySentAt: null },
      data: { reminderOnDaySentAt: now },
    });

    if (claim.count === 0) continue;

    const message = buildReminderMessage(task, '🔔 ถึงกำหนดวันนี้');
    const ok = await sendLineGroupMessage(message);

    if (ok) {
      sent++;
    } else {
      failed++;
      logger.error('ส่งแจ้งเตือนงานเข้ากลุ่ม LINE ไม่สำเร็จ (วันจริง)', { taskId: task.id });
    }
  }

  return { checked: dueTasks.length, sent, failed };
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  // แอดมินปิดฟีเจอร์ "ติดตามงาน" หรือปิดตัวเลือก "เตือนงานตามเวลา" → ข้ามทั้งรอบ (คืน 200 เพื่อไม่ให้ worker ถือว่าล้มเหลว)
  const features = await getFeatureSettings();
  if (!isFeatureOn(features, 'tasks') || !isOptionOn(features, 'notifications', 'taskReminders')) {
    return NextResponse.json({ success: true, skipped: true, message: 'ปิดการเตือนงานอยู่ (ตั้งค่า > ฟีเจอร์ของระบบ)' });
  }

  const holder = `${os.hostname()}:${process.pid}`;
  const acquired = await acquireLock(JOB_NAME, holder);
  if (!acquired) {
    logger.warn('reminder cron: ข้าม เพราะยังมีอีก run กำลังทำงานอยู่', { holder });
    return NextResponse.json({ success: true, skipped: true, message: 'ยังมีอีก run กำลังทำงานอยู่' });
  }

  const now = new Date();
  const logEntry = await prisma.cronExecutionLog.create({
    data: { jobName: JOB_NAME, startedAt: now, status: 'running' },
  });

  try {
    const [exact, dayBefore, onDay] = await Promise.all([
      processExactReminders(now),
      processDayBeforeReminders(now),
      processOnDayReminders(now),
    ]);

    const checked = exact.checked + dayBefore.checked + onDay.checked;
    const sent = exact.sent + dayBefore.sent + onDay.sent;
    const failed = exact.failed + dayBefore.failed + onDay.failed;

    await prisma.cronExecutionLog.update({
      where: { id: logEntry.id },
      data: { finishedAt: new Date(), status: 'success', checked, sent, failed },
    });

    return NextResponse.json({ success: true, checked, sent, failed, breakdown: { exact, dayBefore, onDay } });
  } catch (error) {
    await prisma.cronExecutionLog.update({
      where: { id: logEntry.id },
      data: {
        finishedAt: new Date(),
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      },
    });
    logger.error('reminder cron run ล้มเหลว', { error });
    return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
  } finally {
    await releaseLock(JOB_NAME);
  }
}
