import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req() {
  return new NextRequest('http://localhost:3000/api/auth/2fa');
}

describe('GET /api/auth/2fa', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('reports disabled with no backup codes for a fresh user', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req());
    const body = await res.json();
    expect(body.data).toEqual({ enabled: false, backupCodesRemaining: 0 });
  });

  it('reports enabled and counts only unused backup codes', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
    await prisma.twoFactorBackupCode.createMany({
      data: [
        { userId: user.id, codeHash: 'a' },
        { userId: user.id, codeHash: 'b' },
        { userId: user.id, codeHash: 'c', usedAt: new Date() },
      ],
    });

    const res = await GET(req());
    const body = await res.json();
    expect(body.data).toEqual({ enabled: true, backupCodesRemaining: 2 });
  });
});
