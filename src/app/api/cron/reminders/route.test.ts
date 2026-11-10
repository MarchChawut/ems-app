import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { sendLineGroupMessage } from '@/lib/line';
import { GET } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { createTestUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';
import { clearFeatureCache } from '@/lib/feature-settings-server';

// Tests must never fire real LINE messages — mock the network boundary entirely.
vi.mock('@/lib/line', () => ({
  sendLineGroupMessage: vi.fn().mockResolvedValue(true),
  replyLineMessage: vi.fn().mockResolvedValue(undefined),
}));

setupTestDatabase();

function req(secret?: string) {
  return new NextRequest('http://localhost:3000/api/cron/reminders', {
    headers: secret !== undefined ? { 'x-cron-secret': secret } : undefined,
  });
}

describe('GET /api/cron/reminders', () => {
  beforeEach(() => {
    vi.mocked(sendLineGroupMessage).mockClear();
    vi.mocked(sendLineGroupMessage).mockResolvedValue(true);
  });

  it('returns 401 without the correct x-cron-secret header', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('returns 401 with a wrong secret', async () => {
    const res = await GET(req('wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('sends exact-time reminders that are due and unsent, and claims them (no double-send)', async () => {
    const user = await createTestUser('EMPLOYEE');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    const task = await prisma.task.create({
      data: {
        title: 'Due task', priority: 'LOW', columnId: column.id, assigneeId: user.id,
        reminderAt: new Date(Date.now() - 1000),
      },
    });

    const res = await GET(req('test-cron-secret-not-real'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.breakdown.exact.sent).toBe(1);
    expect(vi.mocked(sendLineGroupMessage)).toHaveBeenCalledOnce();

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.reminderSentAt).not.toBeNull();
  });

  it('does not re-send a reminder that was already sent', async () => {
    const user = await createTestUser('EMPLOYEE');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    await prisma.task.create({
      data: {
        title: 'Already sent', priority: 'LOW', columnId: column.id, assigneeId: user.id,
        reminderAt: new Date(Date.now() - 1000),
        reminderSentAt: new Date(),
      },
    });

    const res = await GET(req('test-cron-secret-not-real'));
    const body = await res.json();
    expect(body.breakdown.exact.checked).toBe(0);
  });

  it('does not send reminders for archived tasks', async () => {
    const user = await createTestUser('EMPLOYEE');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    await prisma.task.create({
      data: {
        title: 'Archived', priority: 'LOW', columnId: column.id, assigneeId: user.id,
        reminderAt: new Date(Date.now() - 1000),
        archivedAt: new Date(),
      },
    });

    const res = await GET(req('test-cron-secret-not-real'));
    const body = await res.json();
    expect(body.breakdown.exact.checked).toBe(0);
  });

  it('does not send reminders that are not yet due', async () => {
    const user = await createTestUser('EMPLOYEE');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    await prisma.task.create({
      data: {
        title: 'Future', priority: 'LOW', columnId: column.id, assigneeId: user.id,
        reminderAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const res = await GET(req('test-cron-secret-not-real'));
    const body = await res.json();
    expect(body.breakdown.exact.checked).toBe(0);
  });

  it('processes the day-before and on-day reminder passes independently', async () => {
    const user = await createTestUser('EMPLOYEE');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    await prisma.task.create({
      data: {
        title: 'Day-before due', priority: 'LOW', columnId: column.id, assigneeId: user.id,
        reminderDayBeforeAt: new Date(Date.now() - 1000),
      },
    });
    await prisma.task.create({
      data: {
        title: 'On-day due', priority: 'LOW', columnId: column.id, assigneeId: user.id,
        reminderOnDayAt: new Date(Date.now() - 1000),
      },
    });

    const res = await GET(req('test-cron-secret-not-real'));
    const body = await res.json();
    expect(body.breakdown.dayBefore.sent).toBe(1);
    expect(body.breakdown.onDay.sent).toBe(1);
    expect(body.sent).toBe(2);
  });

  it('counts a failed LINE send without blocking other reminders', async () => {
    vi.mocked(sendLineGroupMessage).mockResolvedValueOnce(false);
    const user = await createTestUser('EMPLOYEE');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    await prisma.task.create({
      data: {
        title: 'Fails to send', priority: 'LOW', columnId: column.id, assigneeId: user.id,
        reminderAt: new Date(Date.now() - 1000),
      },
    });

    const res = await GET(req('test-cron-secret-not-real'));
    const body = await res.json();
    expect(body.breakdown.exact.failed).toBe(1);
    expect(body.breakdown.exact.sent).toBe(0);
  });

  it('records a CronExecutionLog row with status success and the correct counts', async () => {
    const user = await createTestUser('EMPLOYEE');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    await prisma.task.create({
      data: {
        title: 'Logged run', priority: 'LOW', columnId: column.id, assigneeId: user.id,
        reminderAt: new Date(Date.now() - 1000),
      },
    });

    const res = await GET(req('test-cron-secret-not-real'));
    expect(res.status).toBe(200);

    const logs = await prisma.cronExecutionLog.findMany({ where: { jobName: 'reminders' } });
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('success');
    expect(logs[0].checked).toBe(1);
    expect(logs[0].sent).toBe(1);
    expect(logs[0].failed).toBe(0);
    expect(logs[0].finishedAt).not.toBeNull();

    // lock ต้องถูกปล่อยหลังรันเสร็จ - รันซ้ำต้องทำงานได้ปกติอีกครั้ง ไม่ถูก skip
    const res2 = await GET(req('test-cron-secret-not-real'));
    const body2 = await res2.json();
    expect(body2.skipped).toBeFalsy();
  });

  it('skips the run and does not create a log row when the lock is already held', async () => {
    await prisma.cronLock.upsert({
      where: { name: 'reminders' },
      create: { name: 'reminders', lockedAt: new Date(), lockedBy: 'other-process' },
      update: { lockedAt: new Date(), lockedBy: 'other-process' },
    });

    const res = await GET(req('test-cron-secret-not-real'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(true);

    const logs = await prisma.cronExecutionLog.findMany({ where: { jobName: 'reminders' } });
    expect(logs).toHaveLength(0);
    expect(vi.mocked(sendLineGroupMessage)).not.toHaveBeenCalled();
  });

  it('records status error with a message and still releases the lock when a pass throws', async () => {
    vi.mocked(sendLineGroupMessage).mockRejectedValueOnce(new Error('LINE API unreachable'));
    const user = await createTestUser('EMPLOYEE');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    await prisma.task.create({
      data: {
        title: 'Throws during send', priority: 'LOW', columnId: column.id, assigneeId: user.id,
        reminderAt: new Date(Date.now() - 1000),
      },
    });

    const res = await GET(req('test-cron-secret-not-real'));
    expect(res.status).toBe(500);

    const logs = await prisma.cronExecutionLog.findMany({ where: { jobName: 'reminders' } });
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('error');
    expect(logs[0].error).toContain('LINE API unreachable');
    expect(logs[0].finishedAt).not.toBeNull();

    // lock ต้องถูกปล่อยแม้ตอน error (finally) - รันซ้ำต้องไม่ถูก skip
    const res2 = await GET(req('test-cron-secret-not-real'));
    const body2 = await res2.json();
    expect(body2.skipped).toBeFalsy();
  });

  it('self-heals a stale lock left by a crashed previous run', async () => {
    const stale = new Date(Date.now() - 6 * 60 * 1000); // เกิน 5 นาที stale threshold
    await prisma.cronLock.upsert({
      where: { name: 'reminders' },
      create: { name: 'reminders', lockedAt: stale, lockedBy: 'crashed-process' },
      update: { lockedAt: stale, lockedBy: 'crashed-process' },
    });

    const res = await GET(req('test-cron-secret-not-real'));
    const body = await res.json();
    expect(body.skipped).toBeFalsy();

    const logs = await prisma.cronExecutionLog.findMany({ where: { jobName: 'reminders' } });
    expect(logs).toHaveLength(1);
  });

  describe('feature switches', () => {
    async function dueTask() {
      const user = await createTestUser('EMPLOYEE');
      const column = await prisma.kanbanColumn.findFirstOrThrow();
      await prisma.task.create({
        data: { title: 'Due task', priority: 'LOW', columnId: column.id, assigneeId: user.id, reminderAt: new Date(Date.now() - 1000) },
      });
    }

    it('skips the whole run (200, nothing sent) when the tasks feature is disabled', async () => {
      await dueTask();
      await prisma.featureSetting.create({ data: { featureKey: 'tasks', enabled: false } });
      clearFeatureCache();
      const res = await GET(req('test-cron-secret-not-real'));
      expect(res.status).toBe(200);
      expect((await res.json()).skipped).toBe(true);
      expect(vi.mocked(sendLineGroupMessage)).not.toHaveBeenCalled();
    });

    it('skips when the "task reminders" option of the LINE feature is turned off', async () => {
      await dueTask();
      await prisma.featureSetting.create({ data: { featureKey: 'notifications', enabled: true, options: { taskReminders: false } } });
      clearFeatureCache();
      const res = await GET(req('test-cron-secret-not-real'));
      expect((await res.json()).skipped).toBe(true);
      expect(vi.mocked(sendLineGroupMessage)).not.toHaveBeenCalled();
    });

    it('still requires the secret even when everything is disabled (401 before any feature logic)', async () => {
      await prisma.featureSetting.create({ data: { featureKey: 'tasks', enabled: false } });
      clearFeatureCache();
      expect((await GET(req('wrong'))).status).toBe(401);
    });
  });
});
