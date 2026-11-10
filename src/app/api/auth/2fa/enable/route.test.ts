import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { generate as generateTotp, generateSecret } from 'otplib';
import { POST } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { createTestUser } from '@tests/helpers/auth';
import { createPendingChallenge } from '@/lib/twofactor';
import { encrypt } from '@/lib/crypto';
import { mockCookieStore } from '@tests/helpers/mock-cookies';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(body: unknown) {
  return new NextRequest('http://localhost:3000/api/auth/2fa/enable', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/2fa/enable', () => {
  it('returns 400 CHALLENGE_INVALID with no pending challenge', async () => {
    const res = await POST(req({ code: '123456' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('CHALLENGE_INVALID');
  });

  it('returns 400 CHALLENGE_INVALID when the challenge has no pendingSecret yet', async () => {
    const user = await createTestUser('EMPLOYEE');
    await createPendingChallenge(user.id);
    const res = await POST(req({ code: '123456' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 INVALID_CODE for a wrong TOTP and bumps the attempt counter', async () => {
    const user = await createTestUser('EMPLOYEE');
    const secret = generateSecret();
    await createPendingChallenge(user.id, encrypt(secret));

    const res = await POST(req({ code: '000000' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('INVALID_CODE');

    const challenge = await prisma.twoFactorChallenge.findFirstOrThrow({ where: { userId: user.id } });
    expect(challenge.attempts).toBe(1);
  });

  it('returns 429 once attempts reach the max and deletes the challenge', async () => {
    const user = await createTestUser('EMPLOYEE');
    const secret = generateSecret();
    await createPendingChallenge(user.id, encrypt(secret));
    const challenge = await prisma.twoFactorChallenge.findFirstOrThrow({ where: { userId: user.id } });
    await prisma.twoFactorChallenge.update({ where: { id: challenge.id }, data: { attempts: 5 } });

    const res = await POST(req({ code: '000000' }));
    expect(res.status).toBe(429);

    const remaining = await prisma.twoFactorChallenge.findUnique({ where: { id: challenge.id } });
    expect(remaining).toBeNull();
  });

  it('on a correct code, enables 2FA, issues backup codes, and starts a session', async () => {
    const user = await createTestUser('EMPLOYEE');
    const secret = generateSecret();
    await createPendingChallenge(user.id, encrypt(secret));
    const code = await generateTotp({ secret });

    const res = await POST(req({ code }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user.twoFactorEnabled).toBe(true);
    expect(body.data.backupCodes).toHaveLength(10);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.twoFactorEnabled).toBe(true);
    expect(updated.twoFactorSecret).toBeTruthy();

    const backupCodes = await prisma.twoFactorBackupCode.findMany({ where: { userId: user.id } });
    expect(backupCodes).toHaveLength(10);

    expect(mockCookieStore.get('session_token')).toBeDefined();
    const challengeLeft = await prisma.twoFactorChallenge.findMany({ where: { userId: user.id } });
    expect(challengeLeft).toHaveLength(0);
  });
});
