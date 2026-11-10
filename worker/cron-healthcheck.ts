/**
 * ==================================================
 * Cron Health Check (run-once, triggered by systemd timer)
 * ==================================================
 * ตรวจสอบว่า cron แจ้งเตือน (reminders) ไม่ได้รันมานานเกิน 5 นาทีหรือไม่
 * (ดู CronExecutionLog แถวล่าสุดของ job "reminders") ถ้าเกิน จะส่งข้อความเตือน
 * เข้ากลุ่ม LINE เดียวกับที่ใช้แจ้งเตือนงานปกติ (มี cooldown กันสแปม)
 *
 * รันด้วยมือ:   npm run worker:cron-healthcheck
 * ตั้งเวลาโดย systemd timer ทุก 5 นาที (ดู systemd/ems-cron-healthcheck.timer)
 *
 * ต่างจาก worker/reminder-worker.ts ตรงที่ต้องใช้ .env เต็มไฟล์ (DATABASE_URL +
 * LINE token) ไม่ใช่แค่ worker/.env.worker เพราะต้อง query DB และยิง LINE เอง
 */

import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../src/lib/prisma';
import { sendLineGroupMessage } from '../src/lib/line';
import { logger } from '../src/lib/logger';

// โหลด .env เต็มไฟล์ (dotenv อาจไม่ได้ติดตั้ง) - เหมือน scripts/backup.ts
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const JOB_NAME = 'reminders';
const STALE_MS = 5 * 60 * 1000; // แจ้งเตือนถ้า cron ไม่รันมาเกิน 5 นาที
const COOLDOWN_MS = 30 * 60 * 1000; // ห้ามแจ้งซ้ำถี่กว่านี้ กันสแปม
const STATE_FILE = path.resolve(__dirname, '../logs/cron-alert-state.json');

// เก็บ state เป็นไฟล์ (ไม่ใช้ DB column) เพราะ health check ต้องทำงานได้แม้ DB มีปัญหา
// - ถ้าผูก cooldown กับ DB แล้ว DB access ล้มเหลว จะกันสแปมไม่ได้เลย
function readLastAlertAt(): number {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as { lastAlertAt?: number };
    return typeof parsed.lastAlertAt === 'number' ? parsed.lastAlertAt : 0;
  } catch {
    return 0;
  }
}

function writeLastAlertAt(ts: number): void {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({ lastAlertAt: ts }), 'utf8');
  } catch (error) {
    logger.warn('cron healthcheck: เขียน state file ไม่สำเร็จ (ไม่กระทบการแจ้งเตือนรอบนี้)', { error });
  }
}

async function main(): Promise<void> {
  const latest = await prisma.cronExecutionLog.findFirst({
    where: { jobName: JOB_NAME },
    orderBy: { startedAt: 'desc' },
  });

  const now = Date.now();
  const lastRunAt = latest ? latest.startedAt.getTime() : 0;
  const staleFor = now - lastRunAt;

  if (staleFor <= STALE_MS) {
    logger.debug('cron healthcheck: ปกติ', { lastRunAt: latest?.startedAt ?? null });
    process.exit(0);
  }

  const lastAlertAt = readLastAlertAt();
  if (now - lastAlertAt < COOLDOWN_MS) {
    logger.debug('cron healthcheck: stale แต่ยังอยู่ใน cooldown ไม่แจ้งซ้ำ', { staleForMs: staleFor });
    process.exit(0);
  }

  // ไม่เคยมีแถว CronExecutionLog เลย (เช่น deploy ใหม่ ยังไม่ถึงรอบแรกของ reminder cron)
  // ไม่ใช้ staleFor คำนวณจาก epoch 0 ตรงๆ เพราะจะได้ตัวเลขนาทีที่ไร้สาระ (หลักล้าน)
  const message = latest
    ? `⚠️ ระบบแจ้งเตือนงาน (cron) ไม่ได้ทำงานมา ${Math.floor(staleFor / 60000)} นาทีแล้ว กรุณาตรวจสอบเซิร์ฟเวอร์`
    : '⚠️ ยังไม่พบประวัติการรันของระบบแจ้งเตือนงาน (cron) เลย กรุณาตรวจสอบเซิร์ฟเวอร์';

  const ok = await sendLineGroupMessage(message);
  if (ok) writeLastAlertAt(now);
  logger.warn('cron healthcheck: แจ้งเตือน LINE ว่า cron หยุดทำงาน', {
    minutesStale: latest ? Math.floor(staleFor / 60000) : null,
    alertSent: ok,
  });
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  logger.error('cron healthcheck ล้มเหลว', { error });
  process.exit(1);
});
