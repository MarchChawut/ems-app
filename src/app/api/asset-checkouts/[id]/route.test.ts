import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(body?: unknown) {
  return new NextRequest('http://localhost:3000/api/asset-checkouts/1', {
    method: 'PATCH',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/asset-checkouts/[id] (return)', () => {
  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await PATCH(req({}), params('1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent checkout', async () => {
    await loginAsNewUser('MANAGER');
    const res = await PATCH(req({}), params('999999'));
    expect(res.status).toBe(404);
  });

  it('returns 400 ALREADY_RETURNED for an already-returned checkout', async () => {
    await loginAsNewUser('MANAGER');
    const holder = await createTestUser('EMPLOYEE');
    const asset = await prisma.asset.create({ data: { name: 'A' } });
    const checkout = await prisma.assetCheckout.create({
      data: { assetId: asset.id, holderId: holder.id, issuedById: holder.id, returnedAt: new Date() },
    });

    const res = await PATCH(req({}), params(String(checkout.id)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('ALREADY_RETURNED');
  });

  it('returns the asset atomically: sets returnedAt and resets asset to AVAILABLE', async () => {
    await loginAsNewUser('MANAGER');
    const holder = await createTestUser('EMPLOYEE');
    const asset = await prisma.asset.create({
      data: { name: 'A', status: 'IN_USE', currentHolderId: holder.id },
    });
    const checkout = await prisma.assetCheckout.create({ data: { assetId: asset.id, holderId: holder.id, issuedById: holder.id } });

    const res = await PATCH(req({ notes: 'returned in good condition' }), params(String(checkout.id)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.returnedAt).not.toBeNull();

    const updatedAsset = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(updatedAsset.status).toBe('AVAILABLE');
    expect(updatedAsset.currentHolderId).toBeNull();

    const updatedCheckout = await prisma.assetCheckout.findUniqueOrThrow({ where: { id: checkout.id } });
    expect(updatedCheckout.notes).toBe('returned in good condition');
  });
});
