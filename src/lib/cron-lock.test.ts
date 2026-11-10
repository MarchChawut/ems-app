import { describe, it, expect } from 'vitest';
import { acquireLock, releaseLock } from './cron-lock';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

const JOB = 'test-job';

describe('acquireLock / releaseLock', () => {
  it('acquires the lock when nothing holds it yet', async () => {
    const ok = await acquireLock(JOB, 'holder-a');
    expect(ok).toBe(true);
  });

  it('refuses a second acquire while the first holder still holds it', async () => {
    const first = await acquireLock(JOB, 'holder-a');
    const second = await acquireLock(JOB, 'holder-b');

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('allows acquiring again after releaseLock', async () => {
    await acquireLock(JOB, 'holder-a');
    await releaseLock(JOB);

    const reacquired = await acquireLock(JOB, 'holder-b');
    expect(reacquired).toBe(true);
  });

  it('self-heals a stale lock left by a crashed holder', async () => {
    await acquireLock(JOB, 'holder-a');

    // จำลอง process ที่ตายกลางคันโดยไม่ได้ releaseLock — ทำ lockedAt เก่าเกิน stale threshold (5 นาที) เอง
    const staleTime = new Date(Date.now() - 6 * 60 * 1000);
    await prisma.cronLock.update({ where: { name: JOB }, data: { lockedAt: staleTime } });

    const reacquired = await acquireLock(JOB, 'holder-b');
    expect(reacquired).toBe(true);
  });

  it('does not steal a lock that is still fresh', async () => {
    await acquireLock(JOB, 'holder-a');

    const freshTime = new Date(Date.now() - 1 * 60 * 1000); // 1 นาที ยังไม่ stale
    await prisma.cronLock.update({ where: { name: JOB }, data: { lockedAt: freshTime } });

    const stolen = await acquireLock(JOB, 'holder-b');
    expect(stolen).toBe(false);
  });
});
