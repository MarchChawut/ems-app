import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { createTestUser } from '@tests/helpers/auth';
import { mockCookieStore } from '@tests/helpers/mock-cookies';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/security';
import { MAX_USERNAME_ATTEMPTS } from '@/lib/rate-limit-db';

setupTestDatabase();

function req(body: unknown, headers?: Record<string, string>) {
  return new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/login', () => {
  it('returns 400 for invalid credentials shape', async () => {
    const res = await POST(req({ username: 'ab', password: 'short' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 401 and logs a failed attempt when the user does not exist', async () => {
    const res = await POST(req({ username: 'nobody_here', password: 'password123' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('INVALID_CREDENTIALS');

    const attempts = await prisma.loginAttempt.findMany({ where: { username: 'nobody_here' } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].success).toBe(false);
  });

  it('does not reveal a disabled account: same 401 INVALID_CREDENTIALS as a wrong password (reason only in loginAttempt)', async () => {
    const user = await createTestUser('EMPLOYEE', { isActive: false });
    const res = await POST(req({ username: user.username, password: 'Test1234!' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('INVALID_CREDENTIALS');
    expect(mockCookieStore.get('2fa_pending')).toBeUndefined();

    const attempts = await prisma.loginAttempt.findMany({ where: { username: user.username } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].reason).toBe('บัญชีถูกปิดใช้งาน');
  });

  it('unknown username, wrong password and disabled account return identical response bodies (no enumeration)', async () => {
    const disabled = await createTestUser('EMPLOYEE', { isActive: false });
    const active = await createTestUser('EMPLOYEE');
    const bodies = [
      await (await POST(req({ username: 'nobody_here', password: 'Whatever123' }))).json(),
      await (await POST(req({ username: active.username, password: 'WrongPassword1' }))).json(),
      await (await POST(req({ username: disabled.username, password: 'Test1234!' }))).json(),
    ];
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });

  it('returns 401 for a wrong password', async () => {
    const user = await createTestUser('EMPLOYEE');
    const res = await POST(req({ username: user.username, password: 'WrongPassword1' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('INVALID_CREDENTIALS');
  });

  it('on correct credentials without 2FA enabled, requires ENROLL and sets a pending-challenge cookie', async () => {
    const user = await createTestUser('EMPLOYEE');
    const res = await POST(req({ username: user.username, password: 'Test1234!' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.requires2FA).toBe(true);
    expect(body.data.mode).toBe('ENROLL');

    expect(mockCookieStore.get('2fa_pending')).toBeDefined();
    const challenges = await prisma.twoFactorChallenge.findMany({ where: { userId: user.id } });
    expect(challenges).toHaveLength(1);
  });

  it('on correct credentials with 2FA already enabled, requires VERIFY mode', async () => {
    const user = await prisma.user.create({
      data: {
        username: 'user2fa',
        email: 'user2fa@example.test',
        password: await hashPassword('Test1234!'),
        name: '2FA User',
        role: 'EMPLOYEE',
        twoFactorEnabled: true,
        twoFactorSecret: 'irrelevant-for-this-test',
      },
    });
    const res = await POST(req({ username: user.username, password: 'Test1234!' }));
    const body = await res.json();
    expect(body.data.mode).toBe('VERIFY');
  });

  it('returns 429 once the client IP has hit the rate limit', async () => {
    const ip = '10.0.0.5';
    for (let i = 0; i < 5; i++) {
      await prisma.loginAttempt.create({
        data: { username: 'someone', ipAddress: ip, success: false, reason: 'test seed' },
      });
    }

    const res = await POST(req({ username: 'someone', password: 'password123' }, { 'x-forwarded-for': ip }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('TOO_MANY_ATTEMPTS');
  });

  it('returns 429 once a username has hit the (higher) username rate limit, even from a different/spoofed IP each time', async () => {
    // จำลองผู้โจมตีที่เปลี่ยน X-Forwarded-For ทุกครั้ง (spoof ได้ง่ายเพราะ getClientIp เชื่อ header
    // แบบไม่มีการตรวจสอบ proxy ต้นทาง) - ตัวนับระดับ IP จะไม่ติด แต่ตัวนับระดับ username ต้องติดแทน
    // ใช้ MAX_USERNAME_ATTEMPTS (สูงกว่า MAX_LOGIN_ATTEMPTS ของ IP โดยตั้งใจ - ดู rate-limit-db.ts)
    for (let i = 0; i < MAX_USERNAME_ATTEMPTS; i++) {
      await prisma.loginAttempt.create({
        data: { username: 'targeted_user', ipAddress: `10.0.1.${i}`, success: false, reason: 'test seed' },
      });
    }

    const res = await POST(
      req({ username: 'targeted_user', password: 'password123' }, { 'x-forwarded-for': '10.0.1.99' })
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('TOO_MANY_ATTEMPTS');
  });

  it('being blocked by the username rate limit does not insert a new attempt row (would self-perpetuate the lockout)', async () => {
    for (let i = 0; i < MAX_USERNAME_ATTEMPTS; i++) {
      await prisma.loginAttempt.create({
        data: { username: 'locked_user', ipAddress: `10.0.2.${i}`, success: false, reason: 'test seed' },
      });
    }

    const res = await POST(
      req({ username: 'locked_user', password: 'password123' }, { 'x-forwarded-for': '10.0.2.99' })
    );
    expect(res.status).toBe(429);

    const attempts = await prisma.loginAttempt.count({ where: { username: 'locked_user' } });
    expect(attempts).toBe(MAX_USERNAME_ATTEMPTS);
  });

  it('a successful password check clears prior failed attempts for that IP and username', async () => {
    const user = await createTestUser('EMPLOYEE');
    const ip = '10.0.0.9';
    await prisma.loginAttempt.create({
      data: { username: user.username, ipAddress: ip, success: false, reason: 'prior failure' },
    });

    const res = await POST(req({ username: user.username, password: 'Test1234!' }, { 'x-forwarded-for': ip }));
    expect(res.status).toBe(200);

    const remaining = await prisma.loginAttempt.findMany({ where: { ipAddress: ip } });
    expect(remaining).toHaveLength(0);
  });
});
