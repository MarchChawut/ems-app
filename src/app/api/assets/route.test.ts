import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
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

describe('GET /api/assets', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/assets'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a regular employee', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req('/api/assets'));
    expect(res.status).toBe(403);
  });

  it('returns a plain array without pagination meta by default', async () => {
    await loginAsNewUser('MANAGER');
    await prisma.asset.create({ data: { name: 'Laptop' } });

    const res = await GET(req('/api/assets'));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.meta).toEqual({ total: 1 });
  });

  it('opts into pagination only when page/limit are passed', async () => {
    await loginAsNewUser('MANAGER');
    for (let i = 0; i < 3; i++) await prisma.asset.create({ data: { name: `Asset ${i}` } });

    const res = await GET(req('/api/assets?page=1&limit=2'));
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.meta).toEqual({ total: 3, page: 1, limit: 2, hasMore: true });
  });

  it('excludes soft-deleted (inactive) assets', async () => {
    await loginAsNewUser('MANAGER');
    await prisma.asset.create({ data: { name: 'Active' } });
    await prisma.asset.create({ data: { name: 'Deleted', isActive: false } });

    const res = await GET(req('/api/assets'));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Active');
  });

  it('filters by search across name/assetTag/serialNumber', async () => {
    await loginAsNewUser('MANAGER');
    await prisma.asset.create({ data: { name: 'MacBook Pro', serialNumber: 'SN123' } });
    await prisma.asset.create({ data: { name: 'Dell XPS' } });

    const res = await GET(req('/api/assets?search=SN123'));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('MacBook Pro');
  });

  it('converts acquisitionCost (Decimal) to a plain number', async () => {
    await loginAsNewUser('MANAGER');
    await prisma.asset.create({ data: { name: 'Costly', acquisitionCost: 12345.67 } });

    const res = await GET(req('/api/assets'));
    const body = await res.json();
    expect(typeof body.data[0].acquisitionCost).toBe('number');
    expect(body.data[0].acquisitionCost).toBeCloseTo(12345.67);
  });
});

describe('POST /api/assets', () => {
  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(req('/api/assets', { method: 'POST', body: { name: 'x' } }));
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid input', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(req('/api/assets', { method: 'POST', body: { name: '' } }));
    expect(res.status).toBe(400);
  });

  it('creates an asset with default status/condition', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(req('/api/assets', { method: 'POST', body: { name: 'New Asset' } }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.status).toBe('AVAILABLE');
    expect(body.data.condition).toBe('GOOD');
  });

  it('returns 409 when assetTag already exists', async () => {
    await loginAsNewUser('MANAGER');
    await prisma.asset.create({ data: { name: 'Existing', assetTag: 'TAG-1' } });
    const res = await POST(req('/api/assets', { method: 'POST', body: { name: 'Dup', assetTag: 'TAG-1' } }));
    expect(res.status).toBe(409);
  });
});
