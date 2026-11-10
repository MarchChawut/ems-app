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

describe('GET /api/position-seconds', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/position-seconds'));
    expect(res.status).toBe(401);
  });

  it('lists position-seconds, active ones first', async () => {
    await loginAsNewUser('EMPLOYEE');
    await prisma.positionSecond.create({ data: { name: 'Inactive', isActive: false } });
    await prisma.positionSecond.create({ data: { name: 'Active' } });

    const res = await GET(req('/api/position-seconds'));
    const body = await res.json();
    expect(body.data[0].name).toBe('Active');
  });
});

describe('POST /api/position-seconds', () => {
  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(req('/api/position-seconds', { method: 'POST', body: { name: 'x' } }));
    expect(res.status).toBe(403);
  });

  it('creates a position-second with hasLevel/maxLevel', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(
      req('/api/position-seconds', { method: 'POST', body: { name: 'ระดับ', hasLevel: true, maxLevel: 9 } })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.hasLevel).toBe(true);
    expect(body.data.maxLevel).toBe(9);
  });
});

describe('PATCH /api/position-seconds', () => {
  it('returns 400 without an id', async () => {
    await loginAsNewUser('MANAGER');
    const res = await PATCH(req('/api/position-seconds', { method: 'PATCH', body: { name: 'x' } }));
    expect(res.status).toBe(400);
  });

  it('updates a position-second', async () => {
    await loginAsNewUser('MANAGER');
    const ps = await prisma.positionSecond.create({ data: { name: 'Old' } });
    const res = await PATCH(req('/api/position-seconds', { method: 'PATCH', body: { id: ps.id, name: 'New' } }));
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/position-seconds', () => {
  it('hard-deletes a position-second', async () => {
    await loginAsNewUser('MANAGER');
    const ps = await prisma.positionSecond.create({ data: { name: 'ToDelete' } });
    const res = await DELETE(req(`/api/position-seconds?id=${ps.id}`, { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(await prisma.positionSecond.findUnique({ where: { id: ps.id } })).toBeNull();
  });
});
