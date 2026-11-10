import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH, DELETE } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(method: string, body?: unknown) {
  return new NextRequest('http://localhost:3000/api/supplies/1', {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/supplies/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('GET'), params('1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a regular employee', async () => {
    await loginAsNewUser('EMPLOYEE');
    const supply = await prisma.supply.create({ data: { name: 'Pens', type: 'STOCK' } });
    const res = await GET(req('GET'), params(String(supply.id)));
    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent supply', async () => {
    await loginAsNewUser('MANAGER');
    const res = await GET(req('GET'), params('999999'));
    expect(res.status).toBe(404);
  });

  it('returns the supply with its transaction history', async () => {
    await loginAsNewUser('MANAGER');
    const supply = await prisma.supply.create({ data: { name: 'Pens', type: 'STOCK' } });
    const res = await GET(req('GET'), params(String(supply.id)));
    const body = await res.json();
    expect(body.data.id).toBe(supply.id);
    expect(body.data.transactions).toEqual([]);
  });
});

describe('PATCH /api/supplies/[id]', () => {
  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await PATCH(req('PATCH', { name: 'x' }), params('1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent supply', async () => {
    await loginAsNewUser('MANAGER');
    const res = await PATCH(req('PATCH', { name: 'x' }), params('999999'));
    expect(res.status).toBe(404);
  });

  it('updates the supply', async () => {
    await loginAsNewUser('MANAGER');
    const supply = await prisma.supply.create({ data: { name: 'Old', type: 'STOCK' } });
    const res = await PATCH(req('PATCH', { name: 'New' }), params(String(supply.id)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('New');
  });
});

describe('DELETE /api/supplies/[id]', () => {
  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await DELETE(req('DELETE'), params('1'));
    expect(res.status).toBe(403);
  });

  it('soft-deletes the supply', async () => {
    await loginAsNewUser('MANAGER');
    const supply = await prisma.supply.create({ data: { name: 'ToRemove', type: 'STOCK' } });
    const res = await DELETE(req('DELETE'), params(String(supply.id)));
    expect(res.status).toBe(200);
    const updated = await prisma.supply.findUniqueOrThrow({ where: { id: supply.id } });
    expect(updated.isActive).toBe(false);
  });
});
