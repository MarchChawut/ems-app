import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser, createSessionForUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';
import { hashSessionToken } from '@/lib/security';
import { verifyPassword } from '@/lib/security';

setupTestDatabase();

function req(body?: unknown) {
  return new NextRequest('http://localhost:3000/api/users/1/reset-password', {
    method: 'POST',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

const VALID_BODY = { password: 'NewPassword1', confirmPassword: 'NewPassword1' };

describe('POST /api/users/[id]/reset-password', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await POST(req(VALID_BODY), params('1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for roles below ADMIN (MANAGER, HR, EMPLOYEE)', async () => {
    const target = await createTestUser('EMPLOYEE');
    for (const role of ['MANAGER', 'HR', 'EMPLOYEE'] as const) {
      await loginAsNewUser(role);
      const res = await POST(req(VALID_BODY), params(String(target.id)));
      expect(res.status).toBe(403);
    }
  });

  it('an ADMIN can reset an ordinary user, who is then forced to change the password (and register a passkey) with an expiry', async () => {
    await loginAsNewUser('ADMIN');
    const target = await createTestUser('EMPLOYEE');
    const res = await POST(req(VALID_BODY), params(String(target.id)));
    expect(res.status).toBe(200);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.mustChangePassword).toBe(true);
    expect(updated.initialPasswordExpiresAt).not.toBeNull();
    expect(updated.initialPasswordExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('an ADMIN cannot reset the password of another ADMIN or a SUPER_ADMIN (403); a SUPER_ADMIN can', async () => {
    const otherAdmin = await createTestUser('ADMIN');
    const superTarget = await createTestUser('SUPER_ADMIN');
    await loginAsNewUser('ADMIN');
    expect((await POST(req(VALID_BODY), params(String(otherAdmin.id)))).status).toBe(403);
    expect((await POST(req(VALID_BODY), params(String(superTarget.id)))).status).toBe(403);

    await loginAsNewUser('SUPER_ADMIN');
    expect((await POST(req(VALID_BODY), params(String(otherAdmin.id)))).status).toBe(200);
  });

  it('returns 400 CANNOT_RESET_OWN_PASSWORD when targeting self', async () => {
    const superAdmin = await loginAsNewUser('SUPER_ADMIN');
    const res = await POST(req(VALID_BODY), params(String(superAdmin.id)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('CANNOT_RESET_OWN_PASSWORD');
  });

  it('returns 404 for a nonexistent user', async () => {
    await loginAsNewUser('SUPER_ADMIN');
    const res = await POST(req(VALID_BODY), params('999999'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when password and confirmPassword do not match', async () => {
    await loginAsNewUser('SUPER_ADMIN');
    const target = await createTestUser('EMPLOYEE');
    const res = await POST(
      req({ password: 'NewPassword1', confirmPassword: 'Mismatch1' }),
      params(String(target.id))
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when the password fails complexity rules', async () => {
    await loginAsNewUser('SUPER_ADMIN');
    const target = await createTestUser('EMPLOYEE');
    const res = await POST(
      req({ password: 'weakpass', confirmPassword: 'weakpass' }),
      params(String(target.id))
    );
    expect(res.status).toBe(400);
  });

  it('resets the password, invalidates existing sessions, and leaves other sessions alone', async () => {
    await loginAsNewUser('SUPER_ADMIN');
    const target = await createTestUser('EMPLOYEE');
    const targetToken = await createSessionForUser(target.id);
    const other = await createTestUser('EMPLOYEE');
    const otherToken = await createSessionForUser(other.id);

    const res = await POST(req(VALID_BODY), params(String(target.id)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data?.password).toBeUndefined();

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(await verifyPassword('NewPassword1', updated.password)).toBe(true);

    const targetSession = await prisma.session.findUniqueOrThrow({ where: { token: hashSessionToken(targetToken) } });
    expect(targetSession.isValid).toBe(false);

    const otherSession = await prisma.session.findUniqueOrThrow({ where: { token: hashSessionToken(otherToken) } });
    expect(otherSession.isValid).toBe(true);
  });
});
