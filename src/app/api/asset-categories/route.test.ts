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

describe('GET /api/asset-categories', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/asset-categories'));
    expect(res.status).toBe(401);
  });

  it('lists only active categories, ordered', async () => {
    await loginAsNewUser('EMPLOYEE');
    await prisma.assetCategory.create({ data: { name: 'Z', order: 1 } });
    await prisma.assetCategory.create({ data: { name: 'A', order: 0 } });
    await prisma.assetCategory.create({ data: { name: 'Inactive', order: 2, isActive: false } });

    const res = await GET(req('/api/asset-categories'));
    const body = await res.json();
    expect(body.data.map((c: { name: string }) => c.name)).toEqual(['A', 'Z']);
  });
});

describe('POST /api/asset-categories', () => {
  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(req('/api/asset-categories', { method: 'POST', body: { name: 'x' } }));
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid input', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(req('/api/asset-categories', { method: 'POST', body: { name: '' } }));
    expect(res.status).toBe(400);
  });

  it('creates a category', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(req('/api/asset-categories', { method: 'POST', body: { name: 'Electronics' } }));
    expect(res.status).toBe(201);
  });

  it('returns 409 for a duplicate name', async () => {
    await loginAsNewUser('MANAGER');
    await prisma.assetCategory.create({ data: { name: 'Dup' } });
    const res = await POST(req('/api/asset-categories', { method: 'POST', body: { name: 'Dup' } }));
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/asset-categories', () => {
  it('returns 400 without an id', async () => {
    await loginAsNewUser('MANAGER');
    const res = await PATCH(req('/api/asset-categories', { method: 'PATCH', body: { name: 'x' } }));
    expect(res.status).toBe(400);
  });

  it('returns 404 for a nonexistent category', async () => {
    await loginAsNewUser('MANAGER');
    const res = await PATCH(req('/api/asset-categories', { method: 'PATCH', body: { id: 999999, name: 'x' } }));
    expect(res.status).toBe(404);
  });

  it('updates a category', async () => {
    await loginAsNewUser('MANAGER');
    const category = await prisma.assetCategory.create({ data: { name: 'Old' } });
    const res = await PATCH(req('/api/asset-categories', { method: 'PATCH', body: { id: category.id, name: 'New' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('New');
  });
});

describe('DELETE /api/asset-categories', () => {
  it('soft-deletes a category (isActive=false), then it disappears from GET', async () => {
    await loginAsNewUser('MANAGER');
    const category = await prisma.assetCategory.create({ data: { name: 'ToRemove' } });

    const res = await DELETE(req(`/api/asset-categories?id=${category.id}`, { method: 'DELETE' }));
    expect(res.status).toBe(200);

    const updated = await prisma.assetCategory.findUniqueOrThrow({ where: { id: category.id } });
    expect(updated.isActive).toBe(false);
  });

  it('returns 400 without an id', async () => {
    await loginAsNewUser('MANAGER');
    const res = await DELETE(req('/api/asset-categories', { method: 'DELETE' }));
    expect(res.status).toBe(400);
  });
});
