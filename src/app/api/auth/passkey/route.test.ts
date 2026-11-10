import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req() {
  return new NextRequest('http://localhost:3000/api/auth/passkey');
}

describe('GET /api/auth/passkey', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('returns an empty list when no passkeys are registered', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req());
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('lists only the current user\'s registered passkeys', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const other = await prisma.user.create({
      data: {
        username: 'otherpasskeyuser',
        email: 'otherpasskeyuser@example.test',
        password: 'x',
        name: 'Other',
        role: 'EMPLOYEE',
      },
    });
    await prisma.authenticator.create({
      data: { userId: user.id, credentialId: 'cred-mine', publicKey: 'pk', name: 'My laptop' },
    });
    await prisma.authenticator.create({
      data: { userId: other.id, credentialId: 'cred-other', publicKey: 'pk2', name: 'Other device' },
    });

    const res = await GET(req());
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('My laptop');
  });
});
