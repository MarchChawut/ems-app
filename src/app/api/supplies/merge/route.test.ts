import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(body: unknown) {
  return new NextRequest('http://localhost:3000/api/supplies/merge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/supplies/merge', () => {
  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(req({ primaryId: 1, secondaryId: 2 }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when primaryId equals secondaryId', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(req({ primaryId: 1, secondaryId: 1 }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the primary supply does not exist', async () => {
    await loginAsNewUser('MANAGER');
    const secondary = await prisma.supply.create({ data: { name: 'B', type: 'STOCK' } });
    const res = await POST(req({ primaryId: 999999, secondaryId: secondary.id }));
    expect(res.status).toBe(404);
  });

  it('returns 400 TYPE_MISMATCH when types differ', async () => {
    await loginAsNewUser('MANAGER');
    const primary = await prisma.supply.create({ data: { name: 'A', type: 'STOCK' } });
    const secondary = await prisma.supply.create({ data: { name: 'B', type: 'NON_STOCK' } });
    const res = await POST(req({ primaryId: primary.id, secondaryId: secondary.id }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('TYPE_MISMATCH');
  });

  it('merges two supplies: sums quantity, reassigns transactions, soft-deletes the secondary', async () => {
    const manager = await loginAsNewUser('MANAGER');
    const primary = await prisma.supply.create({ data: { name: 'Pens (blue)', type: 'STOCK', currentQuantity: 10 } });
    const secondary = await prisma.supply.create({ data: { name: 'Pens blue', type: 'STOCK', currentQuantity: 5 } });
    const tx = await prisma.supplyTransaction.create({
      data: { supplyId: secondary.id, type: 'RECEIVE', quantity: 5, quantityBefore: 0, quantityAfter: 5, performedById: manager.id },
    });

    const res = await POST(req({ primaryId: primary.id, secondaryId: secondary.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.currentQuantity).toBe(15);

    const movedTx = await prisma.supplyTransaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(movedTx.supplyId).toBe(primary.id);

    const deletedSecondary = await prisma.supply.findUniqueOrThrow({ where: { id: secondary.id } });
    expect(deletedSecondary.isActive).toBe(false);
  });
});
