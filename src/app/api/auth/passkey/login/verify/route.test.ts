import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { POST } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { createTestUser } from '@tests/helpers/auth';
import { storeChallenge } from '@/lib/webauthn';
import { mockCookieStore } from '@tests/helpers/mock-cookies';
import { prisma } from '@/lib/prisma';

vi.mock('@simplewebauthn/server', () => ({
  verifyAuthenticationResponse: vi.fn(),
}));

setupTestDatabase();

function req(body: unknown) {
  return new NextRequest('http://localhost:3000/api/auth/passkey/login/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/passkey/login/verify', () => {
  it('returns 400 when the response payload is missing', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 CHALLENGE_INVALID when there is no stored challenge', async () => {
    const res = await POST(req({ response: { id: 'cred-1' } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('CHALLENGE_INVALID');
  });

  it('returns 404 PASSKEY_NOT_FOUND when the credential id is unknown', async () => {
    const user = await createTestUser('EMPLOYEE');
    await storeChallenge('challenge-abc', user.id);

    const res = await POST(req({ response: { id: 'unknown-cred' } }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('PASSKEY_NOT_FOUND');
  });

  it('returns 401 when webauthn verification fails', async () => {
    const user = await createTestUser('EMPLOYEE');
    await storeChallenge('challenge-abc', user.id);
    await prisma.authenticator.create({
      data: { userId: user.id, credentialId: 'cred-1', publicKey: Buffer.from('pk').toString('base64url') },
    });
    vi.mocked(verifyAuthenticationResponse).mockResolvedValueOnce({ verified: false } as never);

    const res = await POST(req({ response: { id: 'cred-1' } }));
    expect(res.status).toBe(401);

    const failedAttempt = await prisma.loginAttempt.findFirstOrThrow({ where: { userId: user.id } });
    expect(failedAttempt.success).toBe(false);
  });

  it('starts a session and bumps the counter when verification succeeds', async () => {
    const user = await createTestUser('EMPLOYEE');
    await storeChallenge('challenge-abc', user.id);
    const authenticator = await prisma.authenticator.create({
      data: {
        userId: user.id,
        credentialId: 'cred-1',
        publicKey: Buffer.from('pk').toString('base64url'),
        counter: 5,
      },
    });
    vi.mocked(verifyAuthenticationResponse).mockResolvedValueOnce({
      verified: true,
      authenticationInfo: { newCounter: 6 },
    } as never);

    const res = await POST(req({ response: { id: 'cred-1' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user.id).toBe(user.id);

    const updated = await prisma.authenticator.findUniqueOrThrow({ where: { id: authenticator.id } });
    expect(updated.counter).toBe(6);
    expect(updated.lastUsedAt).not.toBeNull();
    expect(mockCookieStore.get('session_token')).toBeDefined();
  });

  it('returns 403 when the passkey owner account is disabled', async () => {
    const user = await createTestUser('EMPLOYEE', { isActive: false });
    await storeChallenge('challenge-abc', user.id);
    await prisma.authenticator.create({
      data: { userId: user.id, credentialId: 'cred-1', publicKey: Buffer.from('pk').toString('base64url') },
    });

    const res = await POST(req({ response: { id: 'cred-1' } }));
    expect(res.status).toBe(403);
  });
});
