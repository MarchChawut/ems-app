import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PATCH, DELETE } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(url: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

describe('GET /api/departments', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/departments'));
    expect(res.status).toBe(401);
  });

  it('lists departments, active ones first', async () => {
    await loginAsNewUser('EMPLOYEE');
    await prisma.department.create({ data: { name: 'Inactive', isActive: false } });
    await prisma.department.create({ data: { name: 'Active' } });

    const res = await GET(req('/api/departments'));
    const body = await res.json();
    expect(body.data[0].name).toBe('Active');
  });
});

describe('POST /api/departments', () => {
  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(req('/api/departments', { method: 'POST', body: { name: 'x' } }));
    expect(res.status).toBe(403);
  });

  it('creates a department', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(req('/api/departments', { method: 'POST', body: { name: 'IT' } }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe('IT');
  });
});

describe('PATCH /api/departments', () => {
  it('returns 400 without an id', async () => {
    await loginAsNewUser('MANAGER');
    const res = await PATCH(req('/api/departments', { method: 'PATCH', body: { name: 'x' } }));
    expect(res.status).toBe(400);
  });

  it('updates a department', async () => {
    await loginAsNewUser('MANAGER');
    const dept = await prisma.department.create({ data: { name: 'Old' } });
    const res = await PATCH(req('/api/departments', { method: 'PATCH', body: { id: dept.id, name: 'New' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('New');
  });
});

describe('DELETE /api/departments', () => {
  it('returns 400 without an id', async () => {
    await loginAsNewUser('MANAGER');
    const res = await DELETE(req('/api/departments', { method: 'DELETE' }));
    expect(res.status).toBe(400);
  });

  it('hard-deletes a department', async () => {
    await loginAsNewUser('MANAGER');
    const dept = await prisma.department.create({ data: { name: 'ToDelete' } });
    const res = await DELETE(req(`/api/departments?id=${dept.id}`, { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(await prisma.department.findUnique({ where: { id: dept.id } })).toBeNull();
  });
});
