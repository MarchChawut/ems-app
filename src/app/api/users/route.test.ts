import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser } from '@tests/helpers/auth';

setupTestDatabase();

function req(url: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

describe('GET /api/users', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/users'));
    expect(res.status).toBe(401);
  });

  it('never includes the password field', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req('/api/users'));
    const body = await res.json();
    expect(body.data.every((u: Record<string, unknown>) => !('password' in u))).toBe(true);
  });

  it('filters by role and search', async () => {
    await loginAsNewUser('MANAGER');
    await createTestUser('ADMIN', { name: 'Somchai Admin' });
    await createTestUser('EMPLOYEE', { name: 'Somsri Employee' });

    const byRole = await GET(req('/api/users?role=ADMIN'));
    const byRoleBody = await byRole.json();
    expect(byRoleBody.data.every((u: { role: string }) => u.role === 'ADMIN')).toBe(true);

    const bySearch = await GET(req('/api/users?search=Somchai'));
    const bySearchBody = await bySearch.json();
    expect(bySearchBody.data.some((u: { name: string }) => u.name === 'Somchai Admin')).toBe(true);
  });

  it('opts into pagination only when page/limit are passed', async () => {
    await loginAsNewUser('MANAGER');
    for (let i = 0; i < 3; i++) await createTestUser('EMPLOYEE');

    const res = await GET(req('/api/users?page=1&limit=2'));
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.meta.page).toBe(1);
  });

  it('returns only id/name/avatar/isActive for a regular employee (not the full directory)', async () => {
    await loginAsNewUser('EMPLOYEE');
    await createTestUser('MANAGER', { name: 'Somchai Manager', email: 'somchai@example.test' });

    const res = await GET(req('/api/users'));
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
    for (const u of body.data) {
      expect(Object.keys(u).sort()).toEqual(['avatar', 'id', 'isActive', 'name']);
    }
  });

  it('returns the full directory for a manager', async () => {
    await loginAsNewUser('MANAGER');
    await createTestUser('EMPLOYEE', { email: 'full@example.test' });

    const res = await GET(req('/api/users'));
    const body = await res.json();
    const target = body.data.find((u: { email?: string }) => u.email === 'full@example.test');
    expect(target).toBeDefined();
    expect(target).toHaveProperty('phone');
    expect(target).toHaveProperty('department');
  });
});

describe('POST /api/users', () => {
  const valid = {
    email: 'newuser@example.test',
    username: 'newuser1',
    password: 'Password123',
    name: 'New User',
    role: 'EMPLOYEE',
  };

  it('returns 401 when unauthenticated', async () => {
    const res = await POST(req('/api/users', { method: 'POST', body: valid }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-admin', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(req('/api/users', { method: 'POST', body: valid }));
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid input', async () => {
    await loginAsNewUser('ADMIN');
    const res = await POST(req('/api/users', { method: 'POST', body: { ...valid, email: 'not-an-email' } }));
    expect(res.status).toBe(400);
  });

  it('creates a user and never returns the password', async () => {
    await loginAsNewUser('ADMIN');
    const res = await POST(req('/api/users', { method: 'POST', body: valid }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.email).toBe(valid.email);
    expect(body.data.password).toBeUndefined();
  });

  it('returns 409 EMAIL_EXISTS for a duplicate email', async () => {
    await loginAsNewUser('ADMIN');
    await createTestUser('EMPLOYEE', { email: valid.email });
    const res = await POST(req('/api/users', { method: 'POST', body: { ...valid, username: 'different' } }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('EMAIL_EXISTS');
  });

  it('returns 409 USERNAME_EXISTS for a duplicate username', async () => {
    await loginAsNewUser('ADMIN');
    await createTestUser('EMPLOYEE', { username: valid.username });
    const res = await POST(req('/api/users', { method: 'POST', body: { ...valid, email: 'different@example.test' } }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('USERNAME_EXISTS');
  });

  it('SUPER_ADMIN can also create users', async () => {
    await loginAsNewUser('SUPER_ADMIN');
    const res = await POST(req('/api/users', { method: 'POST', body: valid }));
    expect(res.status).toBe(201);
  });

  it('creates a user with an assigned supervisor', async () => {
    await loginAsNewUser('ADMIN');
    const supervisor = await createTestUser('MANAGER');
    const res = await POST(req('/api/users', { method: 'POST', body: { ...valid, supervisorId: supervisor.id } }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.supervisorId).toBe(supervisor.id);
  });

  it('returns 400 SUPERVISOR_NOT_FOUND for a nonexistent supervisorId', async () => {
    await loginAsNewUser('ADMIN');
    const res = await POST(req('/api/users', { method: 'POST', body: { ...valid, supervisorId: 999999 } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('SUPERVISOR_NOT_FOUND');
  });
});
