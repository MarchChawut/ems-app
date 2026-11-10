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

describe('GET /api/supply-transactions', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/supply-transactions'));
    expect(res.status).toBe(401);
  });

  it('filters by supplyId', async () => {
    await loginAsNewUser('EMPLOYEE');
    const manager = await loginAsNewUser('MANAGER');
    const supply1 = await prisma.supply.create({ data: { name: 'A', type: 'STOCK' } });
    const supply2 = await prisma.supply.create({ data: { name: 'B', type: 'STOCK' } });
    await prisma.supplyTransaction.create({
      data: { supplyId: supply1.id, type: 'RECEIVE', quantity: 5, quantityBefore: 0, quantityAfter: 5, performedById: manager.id },
    });
    await prisma.supplyTransaction.create({
      data: { supplyId: supply2.id, type: 'RECEIVE', quantity: 5, quantityBefore: 0, quantityAfter: 5, performedById: manager.id },
    });

    const res = await GET(req(`/api/supply-transactions?supplyId=${supply1.id}`));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });
});

describe('POST /api/supply-transactions', () => {
  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(
      req('/api/supply-transactions', { method: 'POST', body: { supplyId: 1, type: 'RECEIVE', quantity: 1 } })
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent supply', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(
      req('/api/supply-transactions', { method: 'POST', body: { supplyId: 999999, type: 'RECEIVE', quantity: 1 } })
    );
    expect(res.status).toBe(404);
  });

  it('RECEIVE increases currentQuantity', async () => {
    await loginAsNewUser('MANAGER');
    const supply = await prisma.supply.create({ data: { name: 'A', type: 'STOCK', currentQuantity: 10 } });
    const res = await POST(
      req('/api/supply-transactions', { method: 'POST', body: { supplyId: supply.id, type: 'RECEIVE', quantity: 5 } })
    );
    expect(res.status).toBe(201);
    const updated = await prisma.supply.findUniqueOrThrow({ where: { id: supply.id } });
    expect(updated.currentQuantity).toBe(15);
  });

  it('ISSUE decreases currentQuantity', async () => {
    await loginAsNewUser('MANAGER');
    const supply = await prisma.supply.create({ data: { name: 'A', type: 'STOCK', currentQuantity: 10 } });
    const res = await POST(
      req('/api/supply-transactions', { method: 'POST', body: { supplyId: supply.id, type: 'ISSUE', quantity: 3 } })
    );
    expect(res.status).toBe(201);
    const updated = await prisma.supply.findUniqueOrThrow({ where: { id: supply.id } });
    expect(updated.currentQuantity).toBe(7);
  });

  it('returns 400 INSUFFICIENT_STOCK when ISSUE exceeds current quantity', async () => {
    await loginAsNewUser('MANAGER');
    const supply = await prisma.supply.create({ data: { name: 'A', type: 'STOCK', currentQuantity: 2 } });
    const res = await POST(
      req('/api/supply-transactions', { method: 'POST', body: { supplyId: supply.id, type: 'ISSUE', quantity: 5 } })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('INSUFFICIENT_STOCK');

    const unchanged = await prisma.supply.findUniqueOrThrow({ where: { id: supply.id } });
    expect(unchanged.currentQuantity).toBe(2);
  });

  it('ADJUST sets currentQuantity to the given absolute value', async () => {
    await loginAsNewUser('MANAGER');
    const supply = await prisma.supply.create({ data: { name: 'A', type: 'STOCK', currentQuantity: 10 } });
    const res = await POST(
      req('/api/supply-transactions', { method: 'POST', body: { supplyId: supply.id, type: 'ADJUST', quantity: 42 } })
    );
    expect(res.status).toBe(201);
    const updated = await prisma.supply.findUniqueOrThrow({ where: { id: supply.id } });
    expect(updated.currentQuantity).toBe(42);
  });

  it('RETURN increases currentQuantity', async () => {
    await loginAsNewUser('MANAGER');
    const supply = await prisma.supply.create({ data: { name: 'A', type: 'STOCK', currentQuantity: 5 } });
    const res = await POST(
      req('/api/supply-transactions', { method: 'POST', body: { supplyId: supply.id, type: 'RETURN', quantity: 2 } })
    );
    expect(res.status).toBe(201);
    const updated = await prisma.supply.findUniqueOrThrow({ where: { id: supply.id } });
    expect(updated.currentQuantity).toBe(7);
  });
});
