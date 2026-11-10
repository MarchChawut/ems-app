import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';
import { getFeatureSettings } from '@/lib/feature-settings-server';

setupTestDatabase();

function req(init?: { method?: string; body?: unknown }) {
  return new NextRequest(new URL('/api/feature-settings', 'http://localhost:3000'), {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

describe('GET /api/feature-settings', () => {
  it('returns 401 when unauthenticated', async () => {
    expect((await GET(req())).status).toBe(401);
  });

  it('any logged-in user can read it; with no rows every feature is enabled with defaults', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.leaves.enabled).toBe(true);
    expect(body.data.leaves.config.lateArrivalFixedTime).toBe('08:30');
  });
});

describe('PATCH /api/feature-settings — Super Admin only', () => {
  const patch = { featureKey: 'supplies', enabled: false };

  it('returns 401 when unauthenticated', async () => {
    expect((await PATCH(req({ method: 'PATCH', body: patch }))).status).toBe(401);
  });

  it.each(['ADMIN', 'MANAGER', 'DIRECTOR', 'HR', 'EMPLOYEE'] as const)('%s cannot change features (403) and nothing is written', async (role) => {
    await loginAsNewUser(role);
    const res = await PATCH(req({ method: 'PATCH', body: patch }));
    expect(res.status).toBe(403);
    expect(await prisma.featureSetting.count()).toBe(0);
  });

  it('a user granted every permission override still cannot (role is what matters, not a grantable permission)', async () => {
    const admin = await loginAsNewUser('ADMIN');
    await prisma.userPermission.create({ data: { userId: admin.id, permissionKey: 'features.manage', granted: true } });
    expect((await PATCH(req({ method: 'PATCH', body: patch }))).status).toBe(403);
  });

  it('SUPER_ADMIN can disable and re-enable a feature; the guard reflects it immediately', async () => {
    await loginAsNewUser('SUPER_ADMIN');
    const off = await PATCH(req({ method: 'PATCH', body: patch }));
    expect(off.status).toBe(200);
    expect((await getFeatureSettings()).supplies.enabled).toBe(false);

    const on = await PATCH(req({ method: 'PATCH', body: { featureKey: 'supplies', enabled: true } }));
    expect(on.status).toBe(200);
    expect((await getFeatureSettings()).supplies.enabled).toBe(true);
  });

  it('stores options and config defaults and merges partial patches', async () => {
    await loginAsNewUser('SUPER_ADMIN');
    await PATCH(req({ method: 'PATCH', body: { featureKey: 'leaves', config: { lateArrivalFixedTime: '09:00' } } }));
    await PATCH(req({ method: 'PATCH', body: { featureKey: 'leaves', options: { earlyLeave: false } } }));
    const leaves = (await getFeatureSettings()).leaves;
    expect(leaves.config.lateArrivalFixedTime).toBe('09:00');
    expect(leaves.config.workStartTime).toBe('08:30'); // not touched
    expect(leaves.options).toEqual({ lateArrival: true, earlyLeave: false });
  });

  it('rejects unknown/core features, unknown options/config and bad values with 400 (nothing stored)', async () => {
    await loginAsNewUser('SUPER_ADMIN');
    const bad = [
      { featureKey: 'users', enabled: false },
      { featureKey: 'dashboard', enabled: false },
      { featureKey: 'settings', enabled: false },
      { featureKey: 'leaves', options: { nope: true } },
      { featureKey: 'leaves', config: { nope: '08:00' } },
      { featureKey: 'leaves', config: { lateArrivalFixedTime: '25:99' } },
      { featureKey: 'leaves', config: { lateArrivalFixedTime: 830 } },
      { featureKey: 'leaves', enabled: 'false' },
      { featureKey: '' },
      { enabled: false },
    ];
    for (const body of bad) {
      const res = await PATCH(req({ method: 'PATCH', body }));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await prisma.featureSetting.count()).toBe(0);
  });

  it('ignores extra fields instead of storing them (no mass assignment)', async () => {
    await loginAsNewUser('SUPER_ADMIN');
    const res = await PATCH(req({ method: 'PATCH', body: { featureKey: 'roster', enabled: false, updatedById: 999, evil: 'x' } }));
    expect(res.status).toBe(200);
    const row = await prisma.featureSetting.findUniqueOrThrow({ where: { featureKey: 'roster' } });
    expect(row.updatedById).not.toBe(999);
  });
});
