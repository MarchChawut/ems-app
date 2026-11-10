import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

describe('GET /api/dashboard/leave-stats', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/dashboard/leave-stats'));
    expect(res.status).toBe(401);
  });

  it('scopes leaves to the requested fiscal year and labels it in Buddhist Era', async () => {
    const user = await loginAsNewUser('MANAGER');
    // fiscal year 2025 = 2025-10-01 .. 2026-09-30
    await prisma.leave.create({
      data: { userId: user.id, type: 'SICK', status: 'APPROVED', startDate: new Date('2026-01-15'), endDate: new Date('2026-01-15'), reason: 'x', totalDays: 1 },
    });
    // outside the fiscal year
    await prisma.leave.create({
      data: { userId: user.id, type: 'SICK', status: 'APPROVED', startDate: new Date('2025-06-01'), endDate: new Date('2025-06-01'), reason: 'x', totalDays: 1 },
    });

    const res = await GET(req('/api/dashboard/leave-stats?fiscalYear=2025'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.fiscalYear).toBe('2568 - 2569');
    expect(body.data.leaves).toHaveLength(1);
  });

  it('filters by leave type', async () => {
    const user = await loginAsNewUser('MANAGER');
    await prisma.leave.create({
      data: { userId: user.id, type: 'SICK', status: 'APPROVED', startDate: new Date('2026-01-15'), endDate: new Date('2026-01-15'), reason: 'x', totalDays: 1 },
    });
    await prisma.leave.create({
      data: { userId: user.id, type: 'PERSONAL', status: 'APPROVED', startDate: new Date('2026-01-16'), endDate: new Date('2026-01-16'), reason: 'x', totalDays: 1 },
    });

    const res = await GET(req('/api/dashboard/leave-stats?fiscalYear=2025&type=SICK'));
    const body = await res.json();
    expect(body.data.leaves).toHaveLength(1);
    expect(body.data.leaves[0].type).toBe('SICK');
  });

  it('excludes rejected leaves', async () => {
    const user = await loginAsNewUser('MANAGER');
    await prisma.leave.create({
      data: { userId: user.id, type: 'SICK', status: 'REJECTED', startDate: new Date('2026-01-15'), endDate: new Date('2026-01-15'), reason: 'x', totalDays: 1 },
    });

    const res = await GET(req('/api/dashboard/leave-stats?fiscalYear=2025'));
    const body = await res.json();
    expect(body.data.leaves).toHaveLength(0);
  });

  it('builds a per-user per-type summary', async () => {
    const user = await loginAsNewUser('MANAGER');
    await prisma.leave.create({
      data: { userId: user.id, type: 'SICK', status: 'APPROVED', startDate: new Date('2026-01-15'), endDate: new Date('2026-01-16'), reason: 'x', totalDays: 2 },
    });

    const res = await GET(req('/api/dashboard/leave-stats?fiscalYear=2025'));
    const body = await res.json();
    const summary = body.data.userSummaries.find((s: { userId: number }) => s.userId === user.id);
    expect(summary.byType.SICK).toEqual({ count: 1, days: 2 });
    expect(summary.totalDays).toBe(2);
  });
});
