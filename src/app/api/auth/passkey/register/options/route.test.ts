import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req() {
  return new NextRequest('http://localhost:3000/api/auth/passkey/register/options', { method: 'POST' });
}

describe('POST /api/auth/passkey/register/options', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it('returns registration options and stores a challenge for the current user', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.challenge).toBeDefined();
    expect(body.data.user.name).toBe(user.username);

    const stored = await prisma.webAuthnChallenge.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.challenge).toBe(body.data.challenge);
  });

  it('excludes already-registered credentials from the options', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    await prisma.authenticator.create({
      data: { userId: user.id, credentialId: 'existing-cred', publicKey: 'pk' },
    });

    const res = await POST(req());
    const body = await res.json();
    expect(body.data.excludeCredentials.map((c: { id: string }) => c.id)).toContain('existing-cred');
  });
});
