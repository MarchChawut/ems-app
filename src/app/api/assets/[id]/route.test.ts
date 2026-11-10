import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH, DELETE } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(method: string, body?: unknown) {
  return new NextRequest('http://localhost:3000/api/assets/1', {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/assets/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('GET'), params('1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a regular employee', async () => {
    await loginAsNewUser('EMPLOYEE');
    const asset = await prisma.asset.create({ data: { name: 'Laptop' } });
    const res = await GET(req('GET'), params(String(asset.id)));
    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent asset', async () => {
    await loginAsNewUser('MANAGER');
    const res = await GET(req('GET'), params('999999'));
    expect(res.status).toBe(404);
  });

  it('returns the asset with checkout history and a numeric acquisitionCost', async () => {
    await loginAsNewUser('MANAGER');
    const asset = await prisma.asset.create({ data: { name: 'Laptop', acquisitionCost: 999.5 } });

    const res = await GET(req('GET'), params(String(asset.id)));
    const body = await res.json();
    expect(body.data.id).toBe(asset.id);
    expect(body.data.checkouts).toEqual([]);
    expect(body.data.acquisitionCost).toBeCloseTo(999.5);
  });
});

describe('PATCH /api/assets/[id]', () => {
  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await PATCH(req('PATCH', { status: 'IN_REPAIR' }), params('1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent asset', async () => {
    await loginAsNewUser('MANAGER');
    const res = await PATCH(req('PATCH', { status: 'IN_REPAIR' }), params('999999'));
    expect(res.status).toBe(404);
  });

  it('updates only the fields provided', async () => {
    await loginAsNewUser('MANAGER');
    const asset = await prisma.asset.create({ data: { name: 'Laptop', location: 'Room A' } });

    const res = await PATCH(req('PATCH', { status: 'IN_REPAIR' }), params(String(asset.id)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('IN_REPAIR');
    expect(body.data.location).toBe('Room A');
  });
});

describe('DELETE /api/assets/[id]', () => {
  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await DELETE(req('DELETE'), params('1'));
    expect(res.status).toBe(403);
  });

  it('soft-deletes the asset', async () => {
    await loginAsNewUser('MANAGER');
    const asset = await prisma.asset.create({ data: { name: 'ToDelete' } });

    const res = await DELETE(req('DELETE'), params(String(asset.id)));
    expect(res.status).toBe(200);

    const updated = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(updated.isActive).toBe(false);
  });

  it('returns 404 for a nonexistent asset', async () => {
    await loginAsNewUser('MANAGER');
    const res = await DELETE(req('DELETE'), params('999999'));
    expect(res.status).toBe(404);
  });
});
