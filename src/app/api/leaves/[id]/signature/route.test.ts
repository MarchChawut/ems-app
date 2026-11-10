import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const patch = (id: number, body: unknown) =>
  PATCH(
    new NextRequest(`http://localhost:3000/api/leaves/${id}/signature`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    ctx(id)
  );

const PLACEMENT = { x: 1, y: -2, width: 30 };

async function leaveOf(userId: number) {
  return prisma.leave.create({
    data: {
      userId,
      type: 'SICK',
      startDate: new Date('2026-11-10'),
      endDate: new Date('2026-11-10'),
      reason: 'ทดสอบ',
      totalDays: 1,
    },
  });
}

describe('PATCH /api/leaves/[id]/signature (owner places, managers may only hide)', () => {
  it('returns 401 when unauthenticated', async () => {
    const owner = await createTestUser('EMPLOYEE');
    const leave = await leaveOf(owner.id);
    expect((await patch(leave.id, { placement: PLACEMENT })).status).toBe(401);
  });

  it('the owner can place and then hide their signature', async () => {
    const owner = await loginAsNewUser('EMPLOYEE');
    const leave = await leaveOf(owner.id);
    expect((await patch(leave.id, { placement: PLACEMENT })).status).toBe(200);
    expect((await prisma.leave.findUnique({ where: { id: leave.id } }))?.signaturePlacement).toEqual(PLACEMENT);
    expect((await patch(leave.id, { placement: null })).status).toBe(200);
    expect((await prisma.leave.findUnique({ where: { id: leave.id } }))?.signaturePlacement).toBeNull();
  });

  it('an ADMIN / MANAGER cannot place or move someone else\'s signature (403) but can hide it', async () => {
    const owner = await createTestUser('EMPLOYEE');
    const leave = await leaveOf(owner.id);
    await prisma.leave.update({ where: { id: leave.id }, data: { signaturePlacement: PLACEMENT } });

    for (const role of ['ADMIN', 'SUPER_ADMIN', 'MANAGER'] as const) {
      await loginAsNewUser(role);
      expect((await patch(leave.id, { placement: { x: 5, y: 5, width: 40 } })).status).toBe(403);
    }
    expect((await prisma.leave.findUnique({ where: { id: leave.id } }))?.signaturePlacement).toEqual(PLACEMENT);

    await loginAsNewUser('ADMIN');
    expect((await patch(leave.id, { placement: null })).status).toBe(200);
    expect((await prisma.leave.findUnique({ where: { id: leave.id } }))?.signaturePlacement).toBeNull();
  });

  it('another EMPLOYEE can neither place nor hide (403)', async () => {
    const owner = await createTestUser('EMPLOYEE');
    const leave = await leaveOf(owner.id);
    await loginAsNewUser('EMPLOYEE');
    expect((await patch(leave.id, { placement: PLACEMENT })).status).toBe(403);
    expect((await patch(leave.id, { placement: null })).status).toBe(403);
  });

  it('returns 400 for an invalid placement and 404 for an unknown leave', async () => {
    const owner = await loginAsNewUser('EMPLOYEE');
    const leave = await leaveOf(owner.id);
    expect((await patch(leave.id, { placement: { x: 999, y: 0, width: 30 } })).status).toBe(400);
    expect((await patch(leave.id, {})).status).toBe(400);
    expect((await patch(999999, { placement: PLACEMENT })).status).toBe(404);
  });
});
