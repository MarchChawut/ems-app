import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser, createSessionForUser } from '@tests/helpers/auth';
import { setMockSessionToken } from '@tests/helpers/mock-cookies';
import { prisma } from '@/lib/prisma';
import { hashSessionToken } from '@/lib/security';

setupTestDatabase();

function req() {
  return new NextRequest('http://localhost:3000/api/auth/session');
}

describe('GET /api/auth/session', () => {
  it('returns 401 NO_SESSION with no cookie', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('NO_SESSION');
  });

  it('returns 401 INVALID_SESSION for an unknown token', async () => {
    setMockSessionToken('not-a-real-token');
    const res = await GET(req());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('INVALID_SESSION');
  });

  it('returns 401 SESSION_EXPIRED for a past-expiry session', async () => {
    const user = await createTestUser('EMPLOYEE');
    const token = await createSessionForUser(user.id);
    await prisma.session.updateMany({ where: { token: hashSessionToken(token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    setMockSessionToken(token);

    const res = await GET(req());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('SESSION_EXPIRED');

    const session = await prisma.session.findUnique({ where: { token: hashSessionToken(token) } });
    expect(session?.isValid).toBe(false);
  });

  it('returns 403 ACCOUNT_DISABLED when the user is inactive', async () => {
    const user = await createTestUser('EMPLOYEE', { isActive: false });
    const token = await createSessionForUser(user.id);
    setMockSessionToken(token);

    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it('returns the user (without password) and expiresAt for a valid session', async () => {
    const user = await loginAsNewUser('MANAGER');

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user.id).toBe(user.id);
    expect(body.data.user.password).toBeUndefined();
    expect(body.data.expiresAt).toBeDefined();
  });
});
