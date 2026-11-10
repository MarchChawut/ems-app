import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { PUT, DELETE } from './[id]/route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';
import { PERMISSIONS } from '@/lib/permissions';

setupTestDatabase();

function req(url: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

const validBody = (userIds: number[]) => ({
  userIds,
  title: 'ประชุมคณะกรรมการ',
  category: 'MEETING',
  location: 'ห้องประชุมใหญ่',
  startDate: '2026-11-10',
  endDate: '2026-11-11',
});

describe('GET /api/roster', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/roster'));
    expect(res.status).toBe(401);
  });

  it('any authenticated user (even EMPLOYEE) sees all active people with their assignments and stats', async () => {
    const employee = await loginAsNewUser('EMPLOYEE');
    const other = await createTestUser('EMPLOYEE');
    await createTestUser('EMPLOYEE', { isActive: false });
    await prisma.rosterAssignment.create({
      data: {
        userId: other.id,
        createdById: employee.id,
        title: 'เวรรักษาการณ์',
        category: 'DUTY',
        startDate: new Date('2026-11-10'),
        endDate: new Date('2026-11-12'),
      },
    });

    const res = await GET(req('/api/roster?from=2026-11-01&to=2026-11-30'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.people).toHaveLength(2); // inactive user excluded
    const row = body.data.people.find((p: { id: number }) => p.id === other.id);
    expect(row.stats).toMatchObject({ count: 1, days: 3 });
    expect(body.data.summary).toMatchObject({ totalAssignments: 1, totalDays: 3, peopleInvolved: 1, totalPeople: 2 });
  });

  it('clips days to the selected range', async () => {
    const admin = await loginAsNewUser('ADMIN');
    await prisma.rosterAssignment.create({
      data: {
        userId: admin.id,
        createdById: admin.id,
        title: 'ข้ามเดือน',
        category: 'OTHER',
        startDate: new Date('2026-10-30'),
        endDate: new Date('2026-11-02'),
      },
    });
    const res = await GET(req('/api/roster?from=2026-11-01&to=2026-11-30'));
    const body = await res.json();
    expect(body.data.summary.totalDays).toBe(2);
  });

  it('returns 400 when the requested range exceeds 400 days', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req('/api/roster?from=2020-01-01&to=2026-12-31'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('RANGE_TOO_LARGE');
  });

  it('returns 400 for an invalid range', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req('/api/roster?from=2026-11-30&to=2026-11-01'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/roster', () => {
  it('returns 403 for EMPLOYEE and for MANAGER by default', async () => {
    const target = await createTestUser('EMPLOYEE');
    await loginAsNewUser('EMPLOYEE');
    expect((await POST(req('/api/roster', { method: 'POST', body: validBody([target.id]) }))).status).toBe(403);
    await loginAsNewUser('MANAGER');
    expect((await POST(req('/api/roster', { method: 'POST', body: validBody([target.id]) }))).status).toBe(403);
  });

  it('ADMIN can assign one job to several people (one row per person)', async () => {
    const a = await createTestUser('EMPLOYEE');
    const b = await createTestUser('EMPLOYEE');
    await loginAsNewUser('ADMIN');
    const res = await POST(req('/api/roster', { method: 'POST', body: validBody([a.id, b.id, a.id]) }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toHaveLength(2); // duplicate id collapsed
    expect(await prisma.rosterAssignment.count()).toBe(2);
  });

  it('a MANAGER granted roster.manage can create', async () => {
    const target = await createTestUser('EMPLOYEE');
    const manager = await loginAsNewUser('MANAGER');
    await prisma.userPermission.create({
      data: { userId: manager.id, permissionKey: PERMISSIONS.ROSTER_MANAGE, granted: true },
    });
    const res = await POST(req('/api/roster', { method: 'POST', body: validBody([target.id]) }));
    expect(res.status).toBe(201);
  });

  it('returns 400 for invalid input and for unknown/inactive users', async () => {
    const inactive = await createTestUser('EMPLOYEE', { isActive: false });
    await loginAsNewUser('ADMIN');
    expect((await POST(req('/api/roster', { method: 'POST', body: { ...validBody([1]), title: '' } }))).status).toBe(400);
    expect(
      (await POST(req('/api/roster', { method: 'POST', body: { ...validBody([1]), endDate: '2026-11-01' } }))).status
    ).toBe(400);
    expect((await POST(req('/api/roster', { method: 'POST', body: validBody([inactive.id]) }))).status).toBe(400);
  });
});

describe('PUT/DELETE /api/roster/[id]', () => {
  async function seedRow() {
    const target = await createTestUser('EMPLOYEE');
    const admin = await loginAsNewUser('ADMIN');
    const row = await prisma.rosterAssignment.create({
      data: {
        userId: target.id,
        createdById: admin.id,
        title: 'เดิม',
        category: 'OTHER',
        startDate: new Date('2026-11-10'),
        endDate: new Date('2026-11-10'),
      },
    });
    return { target, row };
  }

  it('ADMIN can edit a row', async () => {
    const { row } = await seedRow();
    const { userIds: _ignored, ...rest } = validBody([row.userId]);
    const res = await PUT(req(`/api/roster/${row.id}`, { method: 'PUT', body: rest }), ctx(row.id));
    expect(res.status).toBe(200);
    expect((await prisma.rosterAssignment.findUnique({ where: { id: row.id } }))?.title).toBe('ประชุมคณะกรรมการ');
  });

  it('ADMIN can delete a row; unknown id gives 404; EMPLOYEE gets 403', async () => {
    const { row } = await seedRow();
    expect((await DELETE(req(`/api/roster/${row.id}`, { method: 'DELETE' }), ctx(row.id))).status).toBe(200);
    expect((await DELETE(req(`/api/roster/${row.id}`, { method: 'DELETE' }), ctx(row.id))).status).toBe(404);
    await loginAsNewUser('EMPLOYEE');
    expect((await DELETE(req(`/api/roster/${row.id}`, { method: 'DELETE' }), ctx(row.id))).status).toBe(403);
  });
});
