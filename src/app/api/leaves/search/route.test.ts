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

describe('GET /api/leaves/search', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/leaves/search'));
    expect(res.status).toBe(401);
  });

  it('searches by employee name', async () => {
    await loginAsNewUser('MANAGER');
    const employee = await createTestUser('EMPLOYEE', { name: 'สมชาย ใจดี' });
    await prisma.leave.create({
      data: { userId: employee.id, type: 'SICK', startDate: new Date('2026-07-06'), endDate: new Date('2026-07-06'), reason: 'x', totalDays: 1 },
    });

    const res = await GET(req('/api/leaves/search?name=สมชาย'));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.count).toBe(1);
  });

  it('finds leaves covering a specific date', async () => {
    await loginAsNewUser('MANAGER');
    const employee = await createTestUser('EMPLOYEE');
    await prisma.leave.create({
      data: { userId: employee.id, type: 'SICK', startDate: new Date('2026-07-06'), endDate: new Date('2026-07-08'), reason: 'x', totalDays: 3 },
    });

    const hit = await GET(req('/api/leaves/search?date=2026-07-07'));
    expect((await hit.json()).data).toHaveLength(1);

    const miss = await GET(req('/api/leaves/search?date=2026-07-09'));
    expect((await miss.json()).data).toHaveLength(0);
  });

  it('filters by formCategory', async () => {
    await loginAsNewUser('MANAGER');
    const employee = await createTestUser('EMPLOYEE');
    await prisma.leave.create({
      data: { userId: employee.id, type: 'SICK', startDate: new Date('2026-07-06'), endDate: new Date('2026-07-06'), reason: 'x', totalDays: 1, formCategory: 'KBK' },
    });
    await prisma.leave.create({
      data: { userId: employee.id, type: 'SICK', startDate: new Date('2026-07-06'), endDate: new Date('2026-07-06'), reason: 'y', totalDays: 1, formCategory: 'STATS' },
    });

    const res = await GET(req('/api/leaves/search?formCategory=KBK'));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].formCategory).toBe('KBK');
  });

  it('filters by tab', async () => {
    await loginAsNewUser('MANAGER');
    const employee = await createTestUser('EMPLOYEE');
    await prisma.leave.create({
      data: { userId: employee.id, type: 'SICK', startDate: new Date('2026-07-06'), endDate: new Date('2026-07-06'), reason: 'x', totalDays: 1, formCategory: 'KBK' },
    });
    await prisma.leave.create({
      data: { userId: employee.id, type: 'SICK', startDate: new Date('2026-07-06'), endDate: new Date('2026-07-06'), reason: 'y', totalDays: 0.5, formCategory: 'STATS', hours: 2 },
    });
    await prisma.leave.create({
      data: { userId: employee.id, type: 'LATE_ARRIVAL', startDate: new Date('2026-07-06'), endDate: new Date('2026-07-06'), reason: 'z', totalDays: 0.5, formCategory: 'KBK', hours: 2 },
    });

    const kbk = await GET(req('/api/leaves/search?tab=KBK'));
    expect((await kbk.json()).data).toHaveLength(1);

    const lateArrival = await GET(req('/api/leaves/search?tab=LATE_ARRIVAL'));
    const lateArrivalBody = await lateArrival.json();
    expect(lateArrivalBody.data).toHaveLength(1);
    expect(lateArrivalBody.data[0].type).toBe('LATE_ARRIVAL');
  });

  it('tab combined with a specific date does not drop the date condition (AND-merge regression)', async () => {
    await loginAsNewUser('MANAGER');
    const employee = await createTestUser('EMPLOYEE');
    await prisma.leave.create({
      data: { userId: employee.id, type: 'SICK', startDate: new Date('2026-07-06'), endDate: new Date('2026-07-08'), reason: 'x', totalDays: 3, formCategory: 'KBK' },
    });

    const hit = await GET(req('/api/leaves/search?tab=KBK&date=2026-07-07'));
    expect((await hit.json()).data).toHaveLength(1);

    const miss = await GET(req('/api/leaves/search?tab=KBK&date=2026-07-09'));
    expect((await miss.json()).data).toHaveLength(0);

    const wrongTab = await GET(req('/api/leaves/search?tab=STATS&date=2026-07-07'));
    expect((await wrongTab.json()).data).toHaveLength(0);
  });

  it('tab combined with a date range does not drop the range condition (AND-merge regression)', async () => {
    await loginAsNewUser('MANAGER');
    const employee = await createTestUser('EMPLOYEE');
    await prisma.leave.create({
      data: { userId: employee.id, type: 'SICK', startDate: new Date('2026-07-06'), endDate: new Date('2026-07-06'), reason: 'x', totalDays: 1, formCategory: 'STATS', hours: 2 },
    });

    const hit = await GET(req('/api/leaves/search?tab=STATS&startDate=2026-07-05&endDate=2026-07-10'));
    expect((await hit.json()).data).toHaveLength(1);

    const miss = await GET(req('/api/leaves/search?tab=STATS&startDate=2026-08-01&endDate=2026-08-10'));
    expect((await miss.json()).data).toHaveLength(0);
  });

  it('a regular employee only sees their own leave requests, even when searching by another name', async () => {
    const me = await loginAsNewUser('EMPLOYEE');
    const other = await createTestUser('EMPLOYEE', { name: 'สมชาย ใจดี' });
    await prisma.leave.create({
      data: { userId: me.id, type: 'SICK', startDate: new Date('2026-07-06'), endDate: new Date('2026-07-06'), reason: 'me', totalDays: 1 },
    });
    await prisma.leave.create({
      data: { userId: other.id, type: 'SICK', startDate: new Date('2026-07-06'), endDate: new Date('2026-07-06'), reason: 'other', totalDays: 1 },
    });

    const res = await GET(req('/api/leaves/search?name=สมชาย'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);

    const own = await GET(req('/api/leaves/search'));
    const ownBody = await own.json();
    expect(ownBody.data).toHaveLength(1);
    expect(ownBody.data[0].userId).toBe(me.id);
  });
});
