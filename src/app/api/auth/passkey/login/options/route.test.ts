import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { createTestUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(body: unknown) {
  return new NextRequest('http://localhost:3000/api/auth/passkey/login/options', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/passkey/login/options', () => {
  it('returns 400 for an invalid username', async () => {
    const res = await POST(req({ username: 'ab' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 NO_PASSKEY when the user has no registered passkeys', async () => {
    const user = await createTestUser('EMPLOYEE');
    const res = await POST(req({ username: user.username }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('NO_PASSKEY');
  });

  it('returns 404 NO_PASSKEY for a nonexistent username', async () => {
    const res = await POST(req({ username: 'nonexistent_user' }));
    expect(res.status).toBe(404);
  });

  it('returns authentication options and stores a challenge when passkeys exist', async () => {
    const user = await createTestUser('EMPLOYEE');
    await prisma.authenticator.create({
      data: { userId: user.id, credentialId: 'cred-1', publicKey: 'pk' },
    });

    const res = await POST(req({ username: user.username }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.challenge).toBeDefined();

    const stored = await prisma.webAuthnChallenge.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.challenge).toBe(body.data.challenge);
  });
});
