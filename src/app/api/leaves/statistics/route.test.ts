import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

describe('GET /api/leaves/statistics', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/leaves/statistics'));
    expect(res.status).toBe(401);
  });

  it('defaults to the current user and the given fiscal year', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    await prisma.leave.create({
      data: {
        userId: user.id,
        type: 'SICK',
        status: 'APPROVED',
        startDate: new Date('2026-01-05'),
        endDate: new Date('2026-01-06'),
        reason: 'x',
        totalDays: 2,
      },
    });

    // fiscal year 2025 spans 2025-10-01..2026-09-30, which includes 2026-01-05
    const res = await GET(req('/api/leaves/statistics?year=2025'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.userId).toBe(user.id);
    expect(body.data.statistics.SICK).toEqual({ count: 1, days: 2 });
    expect(body.data.totalLeaves).toBe(1);
  });

  it('excludes rejected leaves from the statistics', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    await prisma.leave.create({
      data: {
        userId: user.id,
        type: 'SICK',
        status: 'REJECTED',
        startDate: new Date('2026-01-05'),
        endDate: new Date('2026-01-05'),
        reason: 'x',
        totalDays: 1,
      },
    });

    const res = await GET(req('/api/leaves/statistics?year=2025'));
    const body = await res.json();
    expect(body.data.statistics.SICK).toEqual({ count: 0, days: 0 });
  });

  it("a manager can view another user's statistics via userId", async () => {
    await loginAsNewUser('MANAGER');
    const res = await GET(req('/api/leaves/statistics?userId=999&year=2025'));
    const body = await res.json();
    expect(body.data.userId).toBe(999);
  });

  it('a regular employee cannot pass userId to view another user\'s statistics', async () => {
    const me = await loginAsNewUser('EMPLOYEE');
    const other = await createTestUser('EMPLOYEE');
    const res = await GET(req(`/api/leaves/statistics?userId=${other.id}&year=2025`));
    const body = await res.json();
    expect(body.data.userId).toBe(me.id);
  });
});
