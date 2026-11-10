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

describe('GET /api/supplies', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/supplies'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a regular employee (not the employee directory)', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req('/api/supplies'));
    expect(res.status).toBe(403);
  });

  it('filters to low-stock STOCK items only', async () => {
    await loginAsNewUser('MANAGER');
    await prisma.supply.create({ data: { name: 'Low', type: 'STOCK', currentQuantity: 1, minimumQuantity: 5 } });
    await prisma.supply.create({ data: { name: 'OK', type: 'STOCK', currentQuantity: 10, minimumQuantity: 5 } });
    await prisma.supply.create({ data: { name: 'NonStock', type: 'NON_STOCK' } });

    const res = await GET(req('/api/supplies?lowStock=true'));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Low');
  });

  it('opts into pagination applied after the lowStock in-memory filter', async () => {
    await loginAsNewUser('MANAGER');
    for (let i = 0; i < 3; i++) {
      await prisma.supply.create({ data: { name: `Low ${i}`, type: 'STOCK', currentQuantity: 1, minimumQuantity: 5 } });
    }

    const res = await GET(req('/api/supplies?lowStock=true&page=1&limit=2'));
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.meta.total).toBe(3);
  });

  it('converts unitPrice (Decimal) to a plain number', async () => {
    await loginAsNewUser('MANAGER');
    await prisma.supply.create({ data: { name: 'Priced', type: 'NON_STOCK', unitPrice: 49.99 } });

    const res = await GET(req('/api/supplies'));
    const body = await res.json();
    expect(typeof body.data[0].unitPrice).toBe('number');
  });
});

describe('POST /api/supplies', () => {
  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(req('/api/supplies', { method: 'POST', body: { name: 'x', type: 'STOCK' } }));
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid input', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(req('/api/supplies', { method: 'POST', body: { name: '', type: 'STOCK' } }));
    expect(res.status).toBe(400);
  });

  it('creates a supply with zero initial quantity and no auto RECEIVE transaction', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(req('/api/supplies', { method: 'POST', body: { name: 'Pens', type: 'STOCK' } }));
    expect(res.status).toBe(201);
    const body = await res.json();

    const transactions = await prisma.supplyTransaction.findMany({ where: { supplyId: body.data.id } });
    expect(transactions).toHaveLength(0);
  });

  it('auto-creates a RECEIVE transaction when initial currentQuantity > 0', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(
      req('/api/supplies', { method: 'POST', body: { name: 'Paper', type: 'STOCK', currentQuantity: 100 } })
    );
    const body = await res.json();

    const transactions = await prisma.supplyTransaction.findMany({ where: { supplyId: body.data.id } });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].type).toBe('RECEIVE');
    expect(transactions[0].quantityAfter).toBe(100);
  });
});
