import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req() {
  return new NextRequest('http://localhost:3000/api/auth/2fa/1', { method: 'DELETE' });
}

function params(userId: string) {
  return { params: Promise.resolve({ userId }) };
}

describe('DELETE /api/auth/2fa/[userId]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await DELETE(req(), params('1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-admin caller', async () => {
    await loginAsNewUser('EMPLOYEE');
    const target = await createTestUser('EMPLOYEE');
    const res = await DELETE(req(), params(String(target.id)));
    expect(res.status).toBe(403);
  });

  it('returns 400 for a non-numeric userId', async () => {
    await loginAsNewUser('ADMIN');
    const res = await DELETE(req(), params('not-a-number'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the target user does not exist', async () => {
    await loginAsNewUser('ADMIN');
    const res = await DELETE(req(), params('999999'));
    expect(res.status).toBe(404);
  });

  it('resets 2FA for the target user as an admin', async () => {
    await loginAsNewUser('SUPER_ADMIN');
    const target = await createTestUser('EMPLOYEE');
    await prisma.user.update({ where: { id: target.id }, data: { twoFactorEnabled: true, twoFactorSecret: 'x' } });
    await prisma.twoFactorBackupCode.create({ data: { userId: target.id, codeHash: 'h' } });

    const res = await DELETE(req(), params(String(target.id)));
    expect(res.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.twoFactorEnabled).toBe(false);
    expect(updated.twoFactorSecret).toBeNull();

    const codes = await prisma.twoFactorBackupCode.findMany({ where: { userId: target.id } });
    expect(codes).toHaveLength(0);
  });
});
