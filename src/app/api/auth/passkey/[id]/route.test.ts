import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req() {
  return new NextRequest('http://localhost:3000/api/auth/passkey/1', { method: 'DELETE' });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('DELETE /api/auth/passkey/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await DELETE(req(), params('1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a non-numeric id', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await DELETE(req(), params('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the passkey does not exist', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await DELETE(req(), params('999999'));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the passkey belongs to another user", async () => {
    await loginAsNewUser('EMPLOYEE');
    const other = await prisma.user.create({
      data: {
        username: 'passkeyowner',
        email: 'passkeyowner@example.test',
        password: 'x',
        name: 'Owner',
        role: 'EMPLOYEE',
      },
    });
    const passkey = await prisma.authenticator.create({
      data: { userId: other.id, credentialId: 'cred-x', publicKey: 'pk' },
    });

    const res = await DELETE(req(), params(String(passkey.id)));
    expect(res.status).toBe(404);
  });

  it('deletes the passkey when owned by the current user', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const passkey = await prisma.authenticator.create({
      data: { userId: user.id, credentialId: 'cred-mine', publicKey: 'pk' },
    });

    const res = await DELETE(req(), params(String(passkey.id)));
    expect(res.status).toBe(200);

    const remaining = await prisma.authenticator.findUnique({ where: { id: passkey.id } });
    expect(remaining).toBeNull();
  });
});
