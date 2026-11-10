import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { generate as generateTotp, generateSecret } from 'otplib';
import { POST } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { createTestUser } from '@tests/helpers/auth';
import { createPendingChallenge, generateBackupCodes } from '@/lib/twofactor';
import { encrypt } from '@/lib/crypto';
import { mockCookieStore } from '@tests/helpers/mock-cookies';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(body: unknown, headers?: Record<string, string>) {
  return new NextRequest('http://localhost:3000/api/auth/2fa/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function createUserWith2FA(secret: string) {
  return createTestUser('EMPLOYEE').then((user) =>
    prisma.user
      .update({ where: { id: user.id }, data: { twoFactorEnabled: true, twoFactorSecret: encrypt(secret) } })
      .then(() => user)
  );
}

describe('POST /api/auth/2fa/verify', () => {
  it('returns 429 when the client IP is rate limited', async () => {
    const ip = '10.1.1.1';
    for (let i = 0; i < 5; i++) {
      await prisma.loginAttempt.create({ data: { username: 'x', ipAddress: ip, success: false } });
    }
    const res = await POST(req({ code: '123456' }, { 'x-forwarded-for': ip }));
    expect(res.status).toBe(429);
  });

  it('returns 400 CHALLENGE_INVALID with no pending challenge', async () => {
    const res = await POST(req({ code: '123456' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('CHALLENGE_INVALID');
  });

  it('returns 429 and clears the challenge once attempts reach the max', async () => {
    const secret = generateSecret();
    const user = await createUserWith2FA(secret);
    await createPendingChallenge(user.id);
    const challenge = await prisma.twoFactorChallenge.findFirstOrThrow({ where: { userId: user.id } });
    await prisma.twoFactorChallenge.update({ where: { id: challenge.id }, data: { attempts: 5 } });

    const res = await POST(req({ code: '000000' }));
    expect(res.status).toBe(429);
  });

  it('returns 401 INVALID_CODE for a wrong TOTP with no matching backup code', async () => {
    const secret = generateSecret();
    const user = await createUserWith2FA(secret);
    await createPendingChallenge(user.id);

    const res = await POST(req({ code: '000000' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('INVALID_CODE');

    const challenge = await prisma.twoFactorChallenge.findFirstOrThrow({ where: { userId: user.id } });
    expect(challenge.attempts).toBe(1);

    const attempt = await prisma.loginAttempt.findFirstOrThrow({ where: { userId: user.id } });
    expect(attempt.success).toBe(false);
  });

  it('on a correct TOTP code, finishes the challenge and starts a session', async () => {
    const secret = generateSecret();
    const user = await createUserWith2FA(secret);
    await createPendingChallenge(user.id);
    const code = await generateTotp({ secret });

    const res = await POST(req({ code }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user.id).toBe(user.id);
    expect(body.data.user.twoFactorSecret).toBeUndefined();

    expect(mockCookieStore.get('session_token')).toBeDefined();
    const remaining = await prisma.twoFactorChallenge.findMany({ where: { userId: user.id } });
    expect(remaining).toHaveLength(0);
  });

  it('accepts a valid unused backup code when the TOTP is wrong, and marks it used', async () => {
    const secret = generateSecret();
    const user = await createUserWith2FA(secret);
    await createPendingChallenge(user.id);

    const { plain, hashes } = await generateBackupCodes(1);
    await prisma.twoFactorBackupCode.create({ data: { userId: user.id, codeHash: hashes[0] } });

    const res = await POST(req({ code: plain[0] }));
    expect(res.status).toBe(200);

    const backupCode = await prisma.twoFactorBackupCode.findFirstOrThrow({ where: { userId: user.id } });
    expect(backupCode.usedAt).not.toBeNull();
  });

  it('returns 400 USER_INVALID when the challenge user does not actually have 2FA enabled', async () => {
    const user = await createTestUser('EMPLOYEE');
    await createPendingChallenge(user.id);

    const res = await POST(req({ code: '123456' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('USER_INVALID');
  });
});
