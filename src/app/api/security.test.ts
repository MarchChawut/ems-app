/**
 * Security regression tests — ผลจากการตรวจ pentest/security ทั้งระบบ
 * (ครอบคลุม: การรั่วของ TOTP secret, privilege escalation, บังคับตั้งค่าครั้งแรก, สิทธิ์ EMPLOYEE ที่ API, session)
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as sessionGET } from './auth/session/route';
import { POST as loginPOST } from './auth/login/route';
import { POST as changePasswordPOST } from './auth/change-password/route';
import { GET as setupStatusGET } from './auth/setup-status/route';
import { GET as optionsGET } from './users/options/route';
import { GET as dashboardGET } from './dashboard/route';
import { GET as leaveStatsGET } from './dashboard/leave-stats/route';
import { GET as docExportGET } from './documents/export/route';
import { PATCH as userPATCH, DELETE as userDELETE } from './users/[id]/route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser, createSessionForUser } from '@tests/helpers/auth';
import { mockCookieStore } from '@tests/helpers/mock-cookies';
import { prisma } from '@/lib/prisma';
import { hashPassword, hashSessionToken } from '@/lib/security';
import { getCurrentUser } from '@/lib/auth';

setupTestDatabase();

const url = (p: string) => new URL(p, 'http://localhost:3000');
const get = (p: string) => new NextRequest(url(p));
const json = (p: string, method: string, body: unknown) =>
  new NextRequest(url(p), { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const idParams = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

describe('TOTP secret and private fields never leave the server', () => {
  it('GET /api/auth/session returns only whitelisted fields (no twoFactorSecret, phone, address, birthday)', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: 'ENCRYPTED-SECRET', twoFactorEnabled: true, phone: '081-111-1111', address: 'secret addr' },
    });
    const res = await sessionGET(get('/api/auth/session'));
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('twoFactorSecret');
    expect(text).not.toContain('ENCRYPTED-SECRET');
    expect(text).not.toContain('081-111-1111');
    expect(text).not.toContain('secret addr');
    expect(text).not.toContain('password');
  });

  it('getCurrentUser() (what is serialized into dashboard pages) excludes twoFactorSecret and personal fields', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: 'ENCRYPTED-SECRET', phone: '081-111-1111' } });
    const current = await getCurrentUser();
    const text = JSON.stringify(current);
    expect(current?.id).toBe(user.id);
    expect(text).not.toContain('ENCRYPTED-SECRET');
    expect(text).not.toContain('twoFactorSecret');
    expect(text).not.toContain('081-111-1111');
    expect(Object.keys(current!).sort()).toEqual(
      ['avatar', 'email', 'forcePasskeySetup', 'id', 'mustChangePassword', 'name', 'permissions', 'role', 'username'].sort()
    );
  });
});

describe('session tokens are stored hashed', () => {
  it('the cookie holds the raw token but the database only ever holds its SHA-256 hash', async () => {
    const user = await createTestUser('EMPLOYEE');
    const token = await createSessionForUser(user.id);
    expect(await prisma.session.findUnique({ where: { token } })).toBeNull(); // raw token is not a DB key
    expect(await prisma.session.findUnique({ where: { token: hashSessionToken(token) } })).not.toBeNull();
  });
});

describe('privilege escalation (ADMIN → SUPER_ADMIN) is blocked', () => {
  it('an ADMIN cannot make themselves or anyone else SUPER_ADMIN/ADMIN (403)', async () => {
    const admin = await loginAsNewUser('ADMIN');
    const employee = await createTestUser('EMPLOYEE');
    expect((await userPATCH(json(`/api/users/${admin.id}`, 'PATCH', { role: 'SUPER_ADMIN' }), idParams(admin.id))).status).toBe(403);
    expect((await userPATCH(json(`/api/users/${employee.id}`, 'PATCH', { role: 'SUPER_ADMIN' }), idParams(employee.id))).status).toBe(403);
    expect((await userPATCH(json(`/api/users/${employee.id}`, 'PATCH', { role: 'ADMIN' }), idParams(employee.id))).status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: employee.id } })).role).toBe('EMPLOYEE');
  });

  it('an ADMIN can still manage ordinary roles', async () => {
    await loginAsNewUser('ADMIN');
    const employee = await createTestUser('EMPLOYEE');
    expect((await userPATCH(json(`/api/users/${employee.id}`, 'PATCH', { role: 'MANAGER' }), idParams(employee.id))).status).toBe(200);
  });

  it('an ADMIN cannot edit, disable or delete a SUPER_ADMIN (or another ADMIN)', async () => {
    await loginAsNewUser('ADMIN');
    const superAdmin = await createTestUser('SUPER_ADMIN');
    const otherAdmin = await createTestUser('ADMIN');
    for (const target of [superAdmin, otherAdmin]) {
      expect((await userPATCH(json(`/api/users/${target.id}`, 'PATCH', { isActive: false }), idParams(target.id))).status).toBe(403);
      expect((await userDELETE(new NextRequest(url(`/api/users/${target.id}`), { method: 'DELETE' }), idParams(target.id))).status).toBe(403);
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: superAdmin.id } })).isActive).toBe(true);
  });

  it('a SUPER_ADMIN can promote to ADMIN, but nobody can change their own role', async () => {
    const superAdmin = await loginAsNewUser('SUPER_ADMIN');
    const employee = await createTestUser('EMPLOYEE');
    expect((await userPATCH(json(`/api/users/${employee.id}`, 'PATCH', { role: 'ADMIN' }), idParams(employee.id))).status).toBe(200);
    expect((await userPATCH(json(`/api/users/${superAdmin.id}`, 'PATCH', { role: 'EMPLOYEE' }), idParams(superAdmin.id))).status).toBe(403);
  });
});

describe('EMPLOYEE cannot read organisation-wide data through the API', () => {
  it('dashboard, leave stats and document export return 403 for EMPLOYEE (and work for MANAGER)', async () => {
    await loginAsNewUser('EMPLOYEE');
    expect((await dashboardGET(get('/api/dashboard'))).status).toBe(403);
    expect((await leaveStatsGET(get('/api/dashboard/leave-stats'))).status).toBe(403);
    expect((await docExportGET(get('/api/documents/export'))).status).toBe(403);

    await loginAsNewUser('MANAGER');
    expect((await dashboardGET(get('/api/dashboard'))).status).toBe(200);
  });
});

describe('forced first-login setup (mustChangePassword / forcePasskeySetup)', () => {
  async function setupUser(flags: { mustChangePassword?: boolean; forcePasskeySetup?: boolean }) {
    const user = await loginAsNewUser('EMPLOYEE');
    await prisma.user.update({
      where: { id: user.id },
      data: { password: await hashPassword('password123'), mustChangePassword: true, ...flags },
    });
    return user;
  }

  it('blocks every API except the setup endpoints with 403 SETUP_REQUIRED', async () => {
    await setupUser({ forcePasskeySetup: false });
    const blocked = await optionsGET(get('/api/users/options'));
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).error).toBe('SETUP_REQUIRED');

    expect((await setupStatusGET(get('/api/auth/setup-status'))).status).toBe(200);
    expect((await sessionGET(get('/api/auth/session'))).status).toBe(200);
  });

  it('rejects the unchanged default password and accepts a strong new one, then unlocks the API', async () => {
    const user = await setupUser({ forcePasskeySetup: false });

    const same = await changePasswordPOST(json('/api/auth/change-password', 'POST', { currentPassword: 'password123', newPassword: 'password123', confirmPassword: 'password123' }));
    expect(same.status).toBe(400);

    const ok = await changePasswordPOST(
      json('/api/auth/change-password', 'POST', { currentPassword: 'password123', newPassword: 'Brand-New-Pass-9', confirmPassword: 'Brand-New-Pass-9' })
    );
    expect(ok.status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.mustChangePassword).toBe(false);
    expect(after.initialPasswordExpiresAt).toBeNull();

    expect((await optionsGET(get('/api/users/options'))).status).toBe(200);
  });

  it('changing the password revokes every other session but keeps the current one', async () => {
    const user = await setupUser({ forcePasskeySetup: false });
    const otherToken = await createSessionForUser(user.id);

    const res = await changePasswordPOST(
      json('/api/auth/change-password', 'POST', { currentPassword: 'password123', newPassword: 'Brand-New-Pass-9', confirmPassword: 'Brand-New-Pass-9' })
    );
    expect(res.status).toBe(200);

    const other = await prisma.session.findUniqueOrThrow({ where: { token: hashSessionToken(otherToken) } });
    expect(other.isValid).toBe(false);
    const currentToken = mockCookieStore.get('session_token')?.value;
    const current = await prisma.session.findUniqueOrThrow({ where: { token: hashSessionToken(currentToken!) } });
    expect(current.isValid).toBe(true);
  });

  it('login is refused once the initial password has expired (even with the correct password)', async () => {
    const user = await createTestUser('EMPLOYEE');
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await hashPassword('password123'),
        mustChangePassword: true,
        initialPasswordExpiresAt: new Date(Date.now() - 1000),
      },
    });
    const res = await loginPOST(json('/api/auth/login', 'POST', { username: user.username, password: 'password123' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('INITIAL_PASSWORD_EXPIRED');
  });
});
