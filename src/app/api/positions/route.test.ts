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

describe('GET /api/positions', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/positions'));
    expect(res.status).toBe(401);
  });

  it('lists positions, active ones first', async () => {
    await loginAsNewUser('EMPLOYEE');
    await prisma.position.create({ data: { name: 'Inactive', isActive: false } });
    await prisma.position.create({ data: { name: 'Active' } });

    const res = await GET(req('/api/positions'));
    const body = await res.json();
    expect(body.data[0].name).toBe('Active');
  });
});

describe('POST /api/positions', () => {
  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(req('/api/positions', { method: 'POST', body: { name: 'x' } }));
    expect(res.status).toBe(403);
  });

  it('creates a position', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(req('/api/positions', { method: 'POST', body: { name: 'นักวิชาการ' } }));
    expect(res.status).toBe(201);
  });
});

describe('PATCH /api/positions', () => {
  it('returns 400 without an id', async () => {
    await loginAsNewUser('MANAGER');
    const res = await PATCH(req('/api/positions', { method: 'PATCH', body: { name: 'x' } }));
    expect(res.status).toBe(400);
  });

  it('updates a position', async () => {
    await loginAsNewUser('MANAGER');
    const position = await prisma.position.create({ data: { name: 'Old' } });
    const res = await PATCH(req('/api/positions', { method: 'PATCH', body: { id: position.id, name: 'New' } }));
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/positions', () => {
  it('returns 400 without an id', async () => {
    await loginAsNewUser('MANAGER');
    const res = await DELETE(req('/api/positions', { method: 'DELETE' }));
    expect(res.status).toBe(400);
  });

  it('hard-deletes a position', async () => {
    await loginAsNewUser('MANAGER');
    const position = await prisma.position.create({ data: { name: 'ToDelete' } });
    const res = await DELETE(req(`/api/positions?id=${position.id}`, { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(await prisma.position.findUnique({ where: { id: position.id } })).toBeNull();
  });
});
