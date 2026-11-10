import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/security';

setupTestDatabase();

function req(body: unknown) {
  return new NextRequest('http://localhost:3000/api/auth/change-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/change-password', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await POST(
      req({ currentPassword: 'x', newPassword: 'NewPassword123', confirmPassword: 'NewPassword123' })
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when confirmPassword does not match', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(
      req({ currentPassword: 'Test1234!', newPassword: 'NewPassword123', confirmPassword: 'Mismatch123' })
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 when currentPassword is wrong', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(
      req({ currentPassword: 'WrongOldPassword1', newPassword: 'NewPassword123', confirmPassword: 'NewPassword123' })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('INVALID_CURRENT_PASSWORD');
  });

  it('changes the password on success and the new password verifies afterward', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const res = await POST(
      req({ currentPassword: 'Test1234!', newPassword: 'NewPassword123', confirmPassword: 'NewPassword123' })
    );
    expect(res.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword('NewPassword123', updated.password)).toBe(true);
    expect(await verifyPassword('Test1234!', updated.password)).toBe(false);
  });
});
