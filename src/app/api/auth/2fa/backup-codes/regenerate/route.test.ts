import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { generate as generateTotp, generateSecret } from 'otplib';
import { POST } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { encrypt } from '@/lib/crypto';
import { prisma } from '@/lib/prisma';
import type { UserRole } from '@/types';

setupTestDatabase();

function req(body: unknown) {
  return new NextRequest('http://localhost:3000/api/auth/2fa/backup-codes/regenerate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/2fa/backup-codes/regenerate', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await POST(req({ code: '123456' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 NOT_ENABLED when 2FA is not enabled', async () => {
    await loginAsNewUser('EMPLOYEE' as UserRole);
    const res = await POST(req({ code: '123456' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('NOT_ENABLED');
  });

  it('returns 400 INVALID_CODE for a wrong TOTP', async () => {
    const secret = generateSecret();
    const user = await loginAsNewUser('EMPLOYEE');
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true, twoFactorSecret: encrypt(secret) },
    });

    const res = await POST(req({ code: '000000' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('INVALID_CODE');
  });

  it('regenerates backup codes on a correct TOTP, replacing the old set', async () => {
    const secret = generateSecret();
    const user = await loginAsNewUser('EMPLOYEE');
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true, twoFactorSecret: encrypt(secret) },
    });
    await prisma.twoFactorBackupCode.create({ data: { userId: user.id, codeHash: 'old-hash' } });

    const code = await generateTotp({ secret });
    const res = await POST(req({ code }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.backupCodes).toHaveLength(10);

    const codes = await prisma.twoFactorBackupCode.findMany({ where: { userId: user.id } });
    expect(codes).toHaveLength(10);
    expect(codes.some((c) => c.codeHash === 'old-hash')).toBe(false);
  });
});
