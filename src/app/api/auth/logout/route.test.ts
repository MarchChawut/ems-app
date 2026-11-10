import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createSessionForUser } from '@tests/helpers/auth';
import { mockCookieStore } from '@tests/helpers/mock-cookies';
import { prisma } from '@/lib/prisma';
import { hashSessionToken } from '@/lib/security';

setupTestDatabase();

function req() {
  return new NextRequest('http://localhost:3000/api/auth/logout', { method: 'POST' });
}

describe('POST /api/auth/logout', () => {
  it('succeeds even when there is no session cookie', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('invalidates the session and clears the cookie when logged in', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const token = mockCookieStore.get('session_token')?.value;
    expect(token).toBeTruthy();

    const res = await POST(req());
    expect(res.status).toBe(200);

    const session = await prisma.session.findUnique({ where: { token: hashSessionToken(token!) } });
    expect(session?.isValid).toBe(false);
    expect(mockCookieStore.get('session_token')).toBeUndefined();
    void user;
  });

  it('only invalidates the session matching the cookie token, not other sessions', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const otherToken = await createSessionForUser(user.id);

    await POST(req());

    const otherSession = await prisma.session.findUnique({ where: { token: hashSessionToken(otherToken) } });
    expect(otherSession?.isValid).toBe(true);
  });
});
