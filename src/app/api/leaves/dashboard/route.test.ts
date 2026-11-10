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

describe('GET /api/leaves/dashboard', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/leaves/dashboard'));
    expect(res.status).toBe(401);
  });

  it('aggregates per-user leave stats within the given year', async () => {
    await loginAsNewUser('MANAGER');
    const employee = await createTestUser('EMPLOYEE');
    await prisma.leave.create({
      data: {
        userId: employee.id,
        type: 'SICK',
        status: 'APPROVED',
        startDate: new Date('2026-03-01'),
        endDate: new Date('2026-03-02'),
        reason: 'x',
        totalDays: 2,
      },
    });
    await prisma.leave.create({
      data: {
        userId: employee.id,
        type: 'PERSONAL',
        status: 'PENDING',
        startDate: new Date('2025-03-01'),
        endDate: new Date('2025-03-01'),
        reason: 'y',
        totalDays: 1,
      },
    });

    const res = await GET(req('/api/leaves/dashboard?year=2026'));
    expect(res.status).toBe(200);
    const body = await res.json();
    const entry = body.data.users.find((u: { user: { id: number } }) => u.user.id === employee.id);
    expect(entry.stats.totalLeaves).toBe(1);
    expect(entry.stats.sickDays).toBe(2);
    expect(entry.stats.approved).toBe(1);
    expect(body.data.summary.year).toBe(2026);
  });

  it('filters to a single user via userId', async () => {
    await loginAsNewUser('MANAGER');
    const employee = await createTestUser('EMPLOYEE');
    const res = await GET(req(`/api/leaves/dashboard?userId=${employee.id}`));
    const body = await res.json();
    expect(body.data.users).toHaveLength(1);
    expect(body.data.users[0].user.id).toBe(employee.id);
  });

  it('a regular employee cannot pass userId to view another user\'s stats — always sees only their own', async () => {
    const me = await loginAsNewUser('EMPLOYEE');
    const other = await createTestUser('EMPLOYEE');

    const res = await GET(req(`/api/leaves/dashboard?userId=${other.id}`));
    const body = await res.json();
    expect(body.data.users).toHaveLength(1);
    expect(body.data.users[0].user.id).toBe(me.id);
  });
});
