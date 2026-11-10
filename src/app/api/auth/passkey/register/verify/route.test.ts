import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { POST } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { storeChallenge } from '@/lib/webauthn';
import { prisma } from '@/lib/prisma';

vi.mock('@simplewebauthn/server', () => ({
  verifyRegistrationResponse: vi.fn(),
}));

setupTestDatabase();

function req(body: unknown) {
  return new NextRequest('http://localhost:3000/api/auth/passkey/register/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/passkey/register/verify', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await POST(req({ response: {} }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when the response payload is missing', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 CHALLENGE_INVALID when there is no stored challenge', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(req({ response: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('CHALLENGE_INVALID');
  });

  it("returns 400 CHALLENGE_INVALID when the stored challenge belongs to a different user", async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const other = await prisma.user.create({
      data: { username: 'other_reg', email: 'other_reg@example.test', password: 'x', name: 'Other', role: 'EMPLOYEE' },
    });
    await storeChallenge('challenge-xyz', other.id);
    void user;

    const res = await POST(req({ response: {} }));
    expect(res.status).toBe(400);
  });

  it('returns 400 VERIFICATION_FAILED when webauthn verification fails', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    await storeChallenge('challenge-xyz', user.id);
    vi.mocked(verifyRegistrationResponse).mockResolvedValueOnce({ verified: false } as never);

    const res = await POST(req({ response: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VERIFICATION_FAILED');
  });

  it('returns 409 ALREADY_REGISTERED when the credential id is already stored', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    await storeChallenge('challenge-xyz', user.id);
    await prisma.authenticator.create({
      data: { userId: user.id, credentialId: 'dup-cred', publicKey: 'pk' },
    });
    vi.mocked(verifyRegistrationResponse).mockResolvedValueOnce({
      verified: true,
      registrationInfo: {
        credential: { id: 'dup-cred', publicKey: new Uint8Array([1, 2, 3]), counter: 0 },
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
      },
    } as never);

    const res = await POST(req({ response: {}, name: 'My device' }));
    expect(res.status).toBe(409);
  });

  it('registers a new passkey on successful verification', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    await storeChallenge('challenge-xyz', user.id);
    vi.mocked(verifyRegistrationResponse).mockResolvedValueOnce({
      verified: true,
      registrationInfo: {
        credential: { id: 'new-cred', publicKey: new Uint8Array([1, 2, 3]), counter: 0 },
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
      },
    } as never);

    const res = await POST(req({ response: {}, name: 'My laptop' }));
    expect(res.status).toBe(200);

    const stored = await prisma.authenticator.findUniqueOrThrow({ where: { credentialId: 'new-cred' } });
    expect(stored.userId).toBe(user.id);
    expect(stored.name).toBe('My laptop');
  });
});
