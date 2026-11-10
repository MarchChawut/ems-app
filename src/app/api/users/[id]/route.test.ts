import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH, DELETE } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(method: string, body?: unknown) {
  return new NextRequest('http://localhost:3000/api/users/1', {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/users/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('GET'), params('1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a non-numeric id', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req('GET'), params('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 404 for a nonexistent user', async () => {
    await loginAsNewUser('MANAGER');
    const res = await GET(req('GET'), params('999999'));
    expect(res.status).toBe(404);
  });

  it('returns the user without a password field', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const res = await GET(req('GET'), params(String(user.id)));
    const body = await res.json();
    expect(body.data.id).toBe(user.id);
    expect(body.data.password).toBeUndefined();
  });

  it('returns 403 when a regular employee tries to view someone else', async () => {
    await loginAsNewUser('EMPLOYEE');
    const other = await createTestUser('EMPLOYEE');
    const res = await GET(req('GET'), params(String(other.id)));
    expect(res.status).toBe(403);
  });

  it('lets a manager view another user', async () => {
    await loginAsNewUser('MANAGER');
    const other = await createTestUser('EMPLOYEE');
    const res = await GET(req('GET'), params(String(other.id)));
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/users/[id]', () => {
  it('returns 403 when a non-admin tries to edit someone else', async () => {
    await loginAsNewUser('EMPLOYEE');
    const other = await createTestUser('EMPLOYEE');
    const res = await PATCH(req('PATCH', { name: 'x' }), params(String(other.id)));
    expect(res.status).toBe(403);
  });

  it('lets a non-admin edit their own name', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const res = await PATCH(req('PATCH', { name: 'Updated Name' }), params(String(user.id)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('Updated Name');
  });

  it('rejects (403) a role change by a user editing themselves, and nothing changes', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const res = await PATCH(req('PATCH', { role: 'SUPER_ADMIN', isActive: false }), params(String(user.id)));
    expect(res.status).toBe(403);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.role).toBe('EMPLOYEE');
    expect(updated.isActive).toBe(true);
  });

  it('lets an admin change role/isActive for another user', async () => {
    await loginAsNewUser('ADMIN');
    const other = await createTestUser('EMPLOYEE');
    const res = await PATCH(req('PATCH', { role: 'MANAGER', isActive: false }), params(String(other.id)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.role).toBe('MANAGER');
    expect(body.data.isActive).toBe(false);
  });

  it('lets an admin assign a supervisor to a user', async () => {
    await loginAsNewUser('ADMIN');
    const supervisor = await createTestUser('MANAGER');
    const target = await createTestUser('EMPLOYEE');
    const res = await PATCH(req('PATCH', { supervisorId: supervisor.id }), params(String(target.id)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.supervisorId).toBe(supervisor.id);
  });

  it('returns 400 CANNOT_SUPERVISE_SELF when assigning a user as their own supervisor', async () => {
    await loginAsNewUser('ADMIN');
    const target = await createTestUser('EMPLOYEE');
    const res = await PATCH(req('PATCH', { supervisorId: target.id }), params(String(target.id)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('CANNOT_SUPERVISE_SELF');
  });

  it('returns 400 SUPERVISOR_NOT_FOUND for a nonexistent supervisorId', async () => {
    await loginAsNewUser('ADMIN');
    const target = await createTestUser('EMPLOYEE');
    const res = await PATCH(req('PATCH', { supervisorId: 999999 }), params(String(target.id)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('SUPERVISOR_NOT_FOUND');
  });

  it('returns 400 SUPERVISOR_CYCLE for a direct 2-hop cycle (A -> B -> A)', async () => {
    await loginAsNewUser('ADMIN');
    const a = await createTestUser('EMPLOYEE');
    const b = await createTestUser('MANAGER');
    // b -> a (b's supervisor is a)
    await prisma.user.update({ where: { id: b.id }, data: { supervisorId: a.id } });
    // now try a -> b, which would close the loop
    const res = await PATCH(req('PATCH', { supervisorId: b.id }), params(String(a.id)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('SUPERVISOR_CYCLE');
  });

  it('returns 400 SUPERVISOR_CYCLE for a longer chain (A -> B -> C -> A)', async () => {
    await loginAsNewUser('ADMIN');
    const a = await createTestUser('EMPLOYEE');
    const b = await createTestUser('MANAGER');
    const c = await createTestUser('MANAGER');
    // c -> b -> a
    await prisma.user.update({ where: { id: b.id }, data: { supervisorId: a.id } });
    await prisma.user.update({ where: { id: c.id }, data: { supervisorId: b.id } });
    // now try a -> c, which would close the loop (a -> c -> b -> a)
    const res = await PATCH(req('PATCH', { supervisorId: c.id }), params(String(a.id)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('SUPERVISOR_CYCLE');
  });

  it('silently ignores supervisorId changes from a non-admin editing themselves', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const supervisor = await createTestUser('MANAGER');
    const res = await PATCH(req('PATCH', { supervisorId: supervisor.id }), params(String(user.id)));
    expect(res.status).toBe(200);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.supervisorId).toBeNull();
  });

  it('returns 409 EMAIL_EXISTS when changing to an email already in use', async () => {
    await loginAsNewUser('ADMIN');
    await createTestUser('EMPLOYEE', { email: 'taken@example.test' });
    const target = await createTestUser('EMPLOYEE');
    const res = await PATCH(req('PATCH', { email: 'taken@example.test' }), params(String(target.id)));
    expect(res.status).toBe(409);
  });

  it('ignores a password field if sent (no longer accepted by this endpoint)', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const res = await PATCH(req('PATCH', { password: 'BrandNewPassword1' }), params(String(user.id)));
    expect(res.status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.password).toBe(before.password);
  });

  it('returns 400 CANNOT_DEACTIVATE_SELF when an admin tries to suspend themselves', async () => {
    const admin = await loginAsNewUser('ADMIN');
    const res = await PATCH(req('PATCH', { isActive: false }), params(String(admin.id)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('CANNOT_DEACTIVATE_SELF');
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(updated.isActive).toBe(true);
  });

  it('returns 404 for a nonexistent user (as admin)', async () => {
    await loginAsNewUser('ADMIN');
    const res = await PATCH(req('PATCH', { name: 'x' }), params('999999'));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/users/[id]', () => {
  it('returns 403 for a non-admin', async () => {
    await loginAsNewUser('EMPLOYEE');
    const other = await createTestUser('EMPLOYEE');
    const res = await DELETE(req('DELETE'), params(String(other.id)));
    expect(res.status).toBe(403);
  });

  it('returns 400 CANNOT_DELETE_SELF', async () => {
    const admin = await loginAsNewUser('ADMIN');
    const res = await DELETE(req('DELETE'), params(String(admin.id)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('CANNOT_DELETE_SELF');
  });

  it('returns 404 for a nonexistent user', async () => {
    await loginAsNewUser('ADMIN');
    const res = await DELETE(req('DELETE'), params('999999'));
    expect(res.status).toBe(404);
  });

  it('deletes the user as an admin', async () => {
    await loginAsNewUser('ADMIN');
    const target = await createTestUser('EMPLOYEE');
    const res = await DELETE(req('DELETE'), params(String(target.id)));
    expect(res.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
  });
});
