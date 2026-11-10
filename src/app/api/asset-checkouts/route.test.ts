import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(url: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

describe('GET /api/asset-checkouts', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/asset-checkouts'));
    expect(res.status).toBe(401);
  });

  it('filters to only active (not yet returned) checkouts', async () => {
    await loginAsNewUser('EMPLOYEE');
    const holder = await createTestUser('EMPLOYEE');
    const asset = await prisma.asset.create({ data: { name: 'A' } });
    await prisma.assetCheckout.create({ data: { assetId: asset.id, holderId: holder.id, issuedById: holder.id } });
    await prisma.assetCheckout.create({ data: { assetId: asset.id, holderId: holder.id, issuedById: holder.id, returnedAt: new Date() } });

    const res = await GET(req('/api/asset-checkouts?active=true'));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].returnedAt).toBeNull();
  });
});

describe('POST /api/asset-checkouts', () => {
  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(req('/api/asset-checkouts', { method: 'POST', body: { assetId: 1, holderId: 1 } }));
    expect(res.status).toBe(403);
  });

  it('returns 404 when the asset does not exist', async () => {
    await loginAsNewUser('MANAGER');
    const holder = await createTestUser('EMPLOYEE');
    const res = await POST(
      req('/api/asset-checkouts', { method: 'POST', body: { assetId: 999999, holderId: holder.id } })
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 UNAVAILABLE when the asset is not AVAILABLE', async () => {
    await loginAsNewUser('MANAGER');
    const holder = await createTestUser('EMPLOYEE');
    const asset = await prisma.asset.create({ data: { name: 'A', status: 'IN_REPAIR' } });
    const res = await POST(
      req('/api/asset-checkouts', { method: 'POST', body: { assetId: asset.id, holderId: holder.id } })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('UNAVAILABLE');
  });

  it('checks out an asset atomically: creates checkout and flips asset to IN_USE', async () => {
    const manager = await loginAsNewUser('MANAGER');
    const holder = await createTestUser('EMPLOYEE');
    const asset = await prisma.asset.create({ data: { name: 'A' } });

    const res = await POST(
      req('/api/asset-checkouts', { method: 'POST', body: { assetId: asset.id, holderId: holder.id } })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.issuedBy.id).toBe(manager.id);

    const updatedAsset = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(updatedAsset.status).toBe('IN_USE');
    expect(updatedAsset.currentHolderId).toBe(holder.id);
  });

  it('returns 400 INVALID when the holder does not exist', async () => {
    await loginAsNewUser('MANAGER');
    const asset = await prisma.asset.create({ data: { name: 'A' } });
    const res = await POST(
      req('/api/asset-checkouts', { method: 'POST', body: { assetId: asset.id, holderId: 999999 } })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('INVALID');
  });
});
