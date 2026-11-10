import { describe, it, expect } from 'vitest';
import { POST } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { createTestUser } from '@tests/helpers/auth';
import { createPendingChallenge } from '@/lib/twofactor';
import { decrypt } from '@/lib/crypto';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

describe('POST /api/auth/2fa/setup', () => {
  it('returns 400 CHALLENGE_INVALID with no pending challenge', async () => {
    const res = await POST();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('CHALLENGE_INVALID');
  });

  it('returns 409 ALREADY_ENABLED when the user already has 2FA on', async () => {
    const user = await createTestUser('EMPLOYEE');
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
    await createPendingChallenge(user.id);

    const res = await POST();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('ALREADY_ENABLED');
  });

  it('generates a secret + QR code and stores the encrypted secret on the challenge', async () => {
    const user = await createTestUser('EMPLOYEE');
    await createPendingChallenge(user.id);

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.data.secret).toBe('string');
    expect(body.data.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    const challenge = await prisma.twoFactorChallenge.findFirstOrThrow({ where: { userId: user.id } });
    expect(challenge.pendingSecret).toBeTruthy();
    expect(decrypt(challenge.pendingSecret!)).toBe(body.data.secret);
  });
});
