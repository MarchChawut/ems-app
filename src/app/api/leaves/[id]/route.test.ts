import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { sendLineGroupMessage } from '@/lib/line';
import { PUT, PATCH, DELETE } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser, createSessionForUser } from '@tests/helpers/auth';
import { setMockSessionToken } from '@tests/helpers/mock-cookies';
import { prisma } from '@/lib/prisma';

// Tests must never fire real LINE messages - mock the network boundary entirely.
vi.mock('@/lib/line', () => ({
  sendLineGroupMessage: vi.fn().mockResolvedValue(true),
  replyLineMessage: vi.fn().mockResolvedValue(undefined),
}));

setupTestDatabase();

beforeEach(() => {
  vi.mocked(sendLineGroupMessage).mockClear();
  vi.mocked(sendLineGroupMessage).mockResolvedValue(true);
});

function req(method: string, body?: unknown) {
  return new NextRequest('http://localhost:3000/api/leaves/1', {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** ล็อกอินเป็นผู้ใช้ที่มีอยู่แล้ว (ต่างจาก loginAsNewUser ที่สร้างผู้ใช้ใหม่ทุกครั้ง) - ใช้ตอนต้องทดสอบว่าเจ้าของใบลาเองพยายามอนุมัติ */
async function loginAsExistingUser(userId: number) {
  const token = await createSessionForUser(userId);
  setMockSessionToken(token);
}

async function createLeave(
  userId: number,
  overrides: Partial<{ status: 'PENDING' | 'ADMIN_REVIEWED' | 'SUPERVISOR_APPROVED' | 'APPROVED' | 'REJECTED' }> = {}
) {
  return prisma.leave.create({
    data: {
      userId,
      type: 'SICK',
      startDate: new Date('2026-07-06'),
      endDate: new Date('2026-07-06'),
      reason: 'reason',
      totalDays: 1,
      status: overrides.status ?? 'PENDING',
    },
  });
}

describe('PUT /api/leaves/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await PUT(req('PUT', {}), params('1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a non-numeric id', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await PUT(req('PUT', {}), params('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 404 for a nonexistent leave', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await PUT(
      req('PUT', { type: 'SICK', startDate: '2026-07-06', endDate: '2026-07-06', reason: 'x' }),
      params('999999')
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when a non-owner, non-manager tries to edit', async () => {
    const owner = await createTestUser('EMPLOYEE');
    await loginAsNewUser('EMPLOYEE');
    const leave = await createLeave(owner.id);

    const res = await PUT(
      req('PUT', { type: 'SICK', startDate: '2026-07-06', endDate: '2026-07-06', reason: 'x' }),
      params(String(leave.id))
    );
    expect(res.status).toBe(403);
  });

  it('lets the owner edit their own leave while still PENDING and recomputes totalDays', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const leave = await createLeave(user.id);

    const res = await PUT(
      req('PUT', { type: 'SICK', startDate: '2026-07-06', endDate: '2026-07-08', reason: 'updated' }),
      params(String(leave.id))
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totalDays).toBe(3);
    expect(body.data.reason).toBe('updated');
  });

  it('lets a manager edit any leave while still PENDING', async () => {
    const owner = await createTestUser('EMPLOYEE');
    await loginAsNewUser('MANAGER');
    const leave = await createLeave(owner.id);

    const res = await PUT(
      req('PUT', { type: 'PERSONAL', startDate: '2026-07-06', endDate: '2026-07-06', reason: 'by manager' }),
      params(String(leave.id))
    );
    expect(res.status).toBe(200);
  });

  it('blocks the owner from editing once ธุรการ has reviewed it (ADMIN_REVIEWED)', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const leave = await createLeave(user.id, { status: 'ADMIN_REVIEWED' });

    const res = await PUT(
      req('PUT', { type: 'SICK', startDate: '2026-07-06', endDate: '2026-07-06', reason: 'sneaky edit' }),
      params(String(leave.id))
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('LEAVE_ALREADY_IN_REVIEW');
  });

  it('blocks a manager from editing once past PENDING too', async () => {
    const owner = await createTestUser('EMPLOYEE');
    await loginAsNewUser('MANAGER');
    const leave = await createLeave(owner.id, { status: 'SUPERVISOR_APPROVED' });

    const res = await PUT(
      req('PUT', { type: 'PERSONAL', startDate: '2026-07-06', endDate: '2026-07-06', reason: 'by manager' }),
      params(String(leave.id))
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/leaves/[id] - ขั้นที่ 1 (PENDING): เฉพาะธุรการ (ADMIN/SUPER_ADMIN)', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await PATCH(req('PATCH', { status: 'APPROVED' }), params('1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a plain employee', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const other = await createTestUser('EMPLOYEE');
    const leave = await createLeave(other.id);
    const res = await PATCH(req('PATCH', { status: 'APPROVED' }), params(String(leave.id)));
    expect(res.status).toBe(403);
    expect(sendLineGroupMessage).not.toHaveBeenCalled();
  });

  it('returns 403 for the assigned supervisor (no longer allowed to act at stage 1)', async () => {
    const supervisor = await loginAsNewUser('MANAGER');
    const employee = await createTestUser('EMPLOYEE', { supervisorId: supervisor.id });
    const leave = await createLeave(employee.id);
    const res = await PATCH(req('PATCH', { status: 'APPROVED' }), params(String(leave.id)));
    expect(res.status).toBe(403);
  });

  it('returns 400 for an invalid status value', async () => {
    const employee = await createTestUser('EMPLOYEE');
    await loginAsNewUser('ADMIN');
    const leave = await createLeave(employee.id);
    const res = await PATCH(req('PATCH', { status: 'MAYBE' }), params(String(leave.id)));
    expect(res.status).toBe(400);
  });

  it('returns 400 ALREADY_PROCESSED for a non-pending leave', async () => {
    const employee = await createTestUser('EMPLOYEE');
    await loginAsNewUser('ADMIN');
    const leave = await createLeave(employee.id, { status: 'APPROVED' });
    const res = await PATCH(req('PATCH', { status: 'REJECTED' }), params(String(leave.id)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('ALREADY_PROCESSED');
  });

  it('ADMIN approves -> ADMIN_REVIEWED, sends LINE notification', async () => {
    const employee = await createTestUser('EMPLOYEE');
    const admin = await loginAsNewUser('ADMIN');
    const leave = await createLeave(employee.id);

    const res = await PATCH(req('PATCH', { status: 'APPROVED' }), params(String(leave.id)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('ADMIN_REVIEWED');
    expect(body.data.adminReviewedBy).toBe(admin.id);
    expect(body.data.adminReviewedAt).toBeDefined();
    expect(body.data.supervisorApprovedBy).toBeNull();
    expect(sendLineGroupMessage).toHaveBeenCalledTimes(1);
  });

  it('SUPER_ADMIN rejects at stage 1 -> terminal REJECTED', async () => {
    const employee = await createTestUser('EMPLOYEE');
    const admin = await loginAsNewUser('SUPER_ADMIN');
    const leave = await createLeave(employee.id);

    const res = await PATCH(req('PATCH', { status: 'REJECTED' }), params(String(leave.id)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('REJECTED');
    expect(body.data.approvedBy).toBe(admin.id);
  });

  it('blocks self-approval: an ADMIN cannot review their own leave request', async () => {
    const admin = await createTestUser('ADMIN');
    const leave = await createLeave(admin.id);
    await loginAsExistingUser(admin.id);

    const res = await PATCH(req('PATCH', { status: 'APPROVED' }), params(String(leave.id)));
    expect(res.status).toBe(403);
    expect(sendLineGroupMessage).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/leaves/[id] - ขั้นที่ 2 (ADMIN_REVIEWED): เฉพาะหัวหน้างานที่ถูกกำหนดไว้', () => {
  it('returns 400 SUPERVISOR_NOT_ASSIGNED when the employee has no supervisorId (no fallback)', async () => {
    const employee = await createTestUser('EMPLOYEE');
    await loginAsNewUser('MANAGER');
    const leave = await createLeave(employee.id, { status: 'ADMIN_REVIEWED' });

    const res = await PATCH(req('PATCH', { status: 'APPROVED' }), params(String(leave.id)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('SUPERVISOR_NOT_ASSIGNED');
  });

  it('the assigned supervisor approves -> SUPERVISOR_APPROVED', async () => {
    const supervisor = await loginAsNewUser('MANAGER');
    const employee = await createTestUser('EMPLOYEE', { supervisorId: supervisor.id });
    const leave = await createLeave(employee.id, { status: 'ADMIN_REVIEWED' });

    const res = await PATCH(req('PATCH', { status: 'APPROVED' }), params(String(leave.id)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('SUPERVISOR_APPROVED');
    expect(body.data.supervisorApprovedBy).toBe(supervisor.id);
    expect(sendLineGroupMessage).toHaveBeenCalledTimes(1);
  });

  it('the assigned supervisor rejecting is terminal', async () => {
    const supervisor = await loginAsNewUser('MANAGER');
    const employee = await createTestUser('EMPLOYEE', { supervisorId: supervisor.id });
    const leave = await createLeave(employee.id, { status: 'ADMIN_REVIEWED' });

    const res = await PATCH(req('PATCH', { status: 'REJECTED' }), params(String(leave.id)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('REJECTED');
    expect(body.data.approvedBy).toBe(supervisor.id);
  });

  it('a different manager (not the assigned supervisor) is blocked', async () => {
    const supervisor = await createTestUser('MANAGER');
    const employee = await createTestUser('EMPLOYEE', { supervisorId: supervisor.id });
    await loginAsNewUser('MANAGER');
    const leave = await createLeave(employee.id, { status: 'ADMIN_REVIEWED' });

    const res = await PATCH(req('PATCH', { status: 'APPROVED' }), params(String(leave.id)));
    expect(res.status).toBe(403);
  });

  it('ADMIN can no longer override this stage (cross-stage override removed)', async () => {
    const supervisor = await createTestUser('MANAGER');
    const employee = await createTestUser('EMPLOYEE', { supervisorId: supervisor.id });
    await loginAsNewUser('ADMIN');
    const leave = await createLeave(employee.id, { status: 'ADMIN_REVIEWED' });

    const res = await PATCH(req('PATCH', { status: 'APPROVED' }), params(String(leave.id)));
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/leaves/[id] - ขั้นที่ 3 (SUPERVISOR_APPROVED): เฉพาะ DIRECTOR + break-glass', () => {
  it('DIRECTOR approves -> final APPROVED', async () => {
    const employee = await createTestUser('EMPLOYEE');
    const leave = await createLeave(employee.id, { status: 'SUPERVISOR_APPROVED' });
    const director = await loginAsNewUser('DIRECTOR');

    const res = await PATCH(req('PATCH', { status: 'APPROVED' }), params(String(leave.id)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('APPROVED');
    expect(body.data.approvedBy).toBe(director.id);
    expect(sendLineGroupMessage).toHaveBeenCalledTimes(1);
  });

  it('DIRECTOR rejects -> final REJECTED', async () => {
    const employee = await createTestUser('EMPLOYEE');
    const leave = await createLeave(employee.id, { status: 'SUPERVISOR_APPROVED' });
    await loginAsNewUser('DIRECTOR');

    const res = await PATCH(req('PATCH', { status: 'REJECTED' }), params(String(leave.id)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('REJECTED');
  });

  it('a non-director (including the original supervisor) is blocked at stage 3', async () => {
    const supervisor = await loginAsNewUser('MANAGER');
    const employee = await createTestUser('EMPLOYEE', { supervisorId: supervisor.id });
    const leave = await createLeave(employee.id, { status: 'SUPERVISOR_APPROVED' });

    const res = await PATCH(req('PATCH', { status: 'APPROVED' }), params(String(leave.id)));
    expect(res.status).toBe(403);
  });

  it('SUPER_ADMIN can no longer override this stage for someone else\'s leave (cross-stage override removed)', async () => {
    const employee = await createTestUser('EMPLOYEE');
    const leave = await createLeave(employee.id, { status: 'SUPERVISOR_APPROVED' });
    await loginAsNewUser('SUPER_ADMIN');

    const res = await PATCH(req('PATCH', { status: 'APPROVED' }), params(String(leave.id)));
    expect(res.status).toBe(403);
  });

  it('blocks self-approval: a DIRECTOR cannot approve their own leave at stage 3', async () => {
    const director = await createTestUser('DIRECTOR');
    const leave = await createLeave(director.id, { status: 'SUPERVISOR_APPROVED' });
    await loginAsExistingUser(director.id);

    const res = await PATCH(req('PATCH', { status: 'APPROVED' }), params(String(leave.id)));
    expect(res.status).toBe(403);
    expect(sendLineGroupMessage).not.toHaveBeenCalled();
  });

  it('break-glass: SUPER_ADMIN can approve a DIRECTOR\'s own self-filed leave when no one else can', async () => {
    const director = await createTestUser('DIRECTOR');
    const leave = await createLeave(director.id, { status: 'SUPERVISOR_APPROVED' });
    await loginAsNewUser('SUPER_ADMIN');

    const res = await PATCH(req('PATCH', { status: 'APPROVED' }), params(String(leave.id)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('APPROVED');
    expect(sendLineGroupMessage).toHaveBeenCalledTimes(1);
  });

  it('break-glass does not apply when a SUPER_ADMIN acts on someone else\'s leave owned by a non-director', async () => {
    const employee = await createTestUser('EMPLOYEE');
    const leave = await createLeave(employee.id, { status: 'SUPERVISOR_APPROVED' });
    await loginAsNewUser('SUPER_ADMIN');

    const res = await PATCH(req('PATCH', { status: 'APPROVED' }), params(String(leave.id)));
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/leaves/[id] - concurrency guard', () => {
  it('two simultaneous approvals on the same leave: only one succeeds, the other gets 409', async () => {
    const employee = await createTestUser('EMPLOYEE');
    await loginAsNewUser('ADMIN');
    const leave = await createLeave(employee.id);

    const [resA, resB] = await Promise.all([
      PATCH(req('PATCH', { status: 'APPROVED' }), params(String(leave.id))),
      PATCH(req('PATCH', { status: 'APPROVED' }), params(String(leave.id))),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(sendLineGroupMessage).toHaveBeenCalledTimes(1);
  });
});

describe('DELETE /api/leaves/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await DELETE(req('DELETE'), params('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 for a nonexistent leave', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await DELETE(req('DELETE'), params('999999'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when a non-owner, non-manager tries to delete', async () => {
    const owner = await createTestUser('EMPLOYEE');
    await loginAsNewUser('EMPLOYEE');
    const leave = await createLeave(owner.id);
    const res = await DELETE(req('DELETE'), params(String(leave.id)));
    expect(res.status).toBe(403);
  });

  it('lets the owner delete their own leave while still PENDING', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const leave = await createLeave(user.id);
    const res = await DELETE(req('DELETE'), params(String(leave.id)));
    expect(res.status).toBe(200);
    expect(await prisma.leave.findUnique({ where: { id: leave.id } })).toBeNull();
  });

  it('blocks the owner from deleting once it has moved past PENDING', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const leave = await createLeave(user.id, { status: 'ADMIN_REVIEWED' });
    const res = await DELETE(req('DELETE'), params(String(leave.id)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('LEAVE_ALREADY_IN_REVIEW');
    expect(await prisma.leave.findUnique({ where: { id: leave.id } })).not.toBeNull();
  });

  it('still lets a manager delete a leave at any status (administrative cleanup)', async () => {
    const owner = await createTestUser('EMPLOYEE');
    await loginAsNewUser('MANAGER');
    const leave = await createLeave(owner.id, { status: 'APPROVED' });
    const res = await DELETE(req('DELETE'), params(String(leave.id)));
    expect(res.status).toBe(200);
  });
});
