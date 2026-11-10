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

describe('GET /api/supply-categories', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/supply-categories'));
    expect(res.status).toBe(401);
  });

  it('lists only active categories', async () => {
    await loginAsNewUser('EMPLOYEE');
    await prisma.supplyCategory.create({ data: { name: 'Active' } });
    await prisma.supplyCategory.create({ data: { name: 'Inactive', isActive: false } });

    const res = await GET(req('/api/supply-categories'));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });
});

describe('POST /api/supply-categories', () => {
  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(req('/api/supply-categories', { method: 'POST', body: { name: 'x' } }));
    expect(res.status).toBe(403);
  });

  it('returns 409 for a duplicate name', async () => {
    await loginAsNewUser('MANAGER');
    await prisma.supplyCategory.create({ data: { name: 'Dup' } });
    const res = await POST(req('/api/supply-categories', { method: 'POST', body: { name: 'Dup' } }));
    expect(res.status).toBe(409);
  });

  it('creates a category', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(req('/api/supply-categories', { method: 'POST', body: { name: 'Office' } }));
    expect(res.status).toBe(201);
  });
});

describe('PATCH /api/supply-categories', () => {
  it('returns 404 for a nonexistent category', async () => {
    await loginAsNewUser('MANAGER');
    const res = await PATCH(req('/api/supply-categories', { method: 'PATCH', body: { id: 999999, name: 'x' } }));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/supply-categories', () => {
  it('soft-deletes a category', async () => {
    await loginAsNewUser('MANAGER');
    const category = await prisma.supplyCategory.create({ data: { name: 'ToDelete' } });
    const res = await DELETE(req(`/api/supply-categories?id=${category.id}`, { method: 'DELETE' }));
    expect(res.status).toBe(200);
    const updated = await prisma.supplyCategory.findUniqueOrThrow({ where: { id: category.id } });
    expect(updated.isActive).toBe(false);
  });
});
