/**
 * ฟีเจอร์ที่แอดมินปิด: API ของฟีเจอร์นั้นต้องตอบ 403 FEATURE_DISABLED ทุกเส้น — รวมถึงเมื่อพยายามหลบด้วยรูปแบบ path แปลกๆ
 * (percent-encoding, slash ซ้อน, dot-segment, ตัวพิมพ์ใหญ่) และต้องไม่กระทบฟีเจอร์หลัก (users/auth/dashboard)
 * เรียก route handler จริงโดยตรง — ตรวจผ่าน requireAuth ตัวเดียวกับที่ production ใช้
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getLeaves } from './leaves/route';
import { GET as getLeaveRules } from './leave-rules/route';
import { GET as getHolidays } from './holidays/route';
import { GET as getRoster } from './roster/route';
import { GET as getSupplies } from './supplies/route';
import { GET as getAssets } from './assets/route';
import { GET as getDocuments } from './documents/route';
import { GET as getTasks } from './tasks/route';
import { GET as getFormRequests } from './form-requests/route';
import { GET as getUsers } from './users/route';
import { GET as getDashboard } from './dashboard/route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';
import { clearFeatureCache } from '@/lib/feature-settings-server';
import { FEATURES } from '@/lib/features';

setupTestDatabase();

const req = (path: string) => new NextRequest(new URL(path, 'http://localhost:3000'));

async function disable(featureKey: string) {
  await prisma.featureSetting.upsert({
    where: { featureKey },
    update: { enabled: false },
    create: { featureKey, enabled: false },
  });
  clearFeatureCache();
}

const handlers: { feature: string; path: string; call: (r: NextRequest) => Promise<Response> }[] = [
  { feature: 'leaves', path: '/api/leaves', call: getLeaves },
  { feature: 'leaves', path: '/api/leave-rules', call: getLeaveRules },
  { feature: 'leaves', path: '/api/holidays', call: getHolidays },
  { feature: 'roster', path: '/api/roster', call: getRoster },
  { feature: 'supplies', path: '/api/supplies', call: getSupplies },
  { feature: 'assets', path: '/api/assets', call: getAssets },
  { feature: 'documents', path: '/api/documents', call: getDocuments },
  { feature: 'tasks', path: '/api/tasks', call: getTasks },
  { feature: 'forms', path: '/api/form-requests', call: getFormRequests },
];

describe('disabled features answer 403 FEATURE_DISABLED', () => {
  it.each(handlers)('$path is reachable while $feature is enabled and blocked once disabled', async ({ feature, path, call }) => {
    await loginAsNewUser('SUPER_ADMIN');

    const before = await call(req(path));
    expect(before.status, `${path} should work while enabled`).toBe(200);

    await disable(feature);
    const after = await call(req(path));
    expect(after.status).toBe(403);
    expect((await after.json()).error).toBe('FEATURE_DISABLED');
  });

  it('every toggleable feature with API prefixes is covered by this test', () => {
    const covered = new Set(handlers.map((h) => h.feature));
    for (const f of FEATURES.filter((x) => x.apiPrefixes.length > 0 && x.id !== 'notifications')) {
      expect(covered.has(f.id), `add a handler for feature ${f.id}`).toBe(true);
    }
  });

  it('is not bypassed by percent-encoding, extra slashes, dot-segments or upper case', async () => {
    await loginAsNewUser('SUPER_ADMIN');
    await disable('leaves');
    for (const p of ['/api/%6Ceaves', '/api//leaves', '/api/./leaves', '/api/x/../leaves', '/api/LEAVES', '/api/Leaves/', '/api%2Fleaves']) {
      const res = await getLeaves(req(p));
      expect(res.status, p).toBe(403);
    }
  });

  it('disabling one feature does not affect the others or the core features', async () => {
    await loginAsNewUser('SUPER_ADMIN');
    await disable('leaves');
    expect((await getSupplies(req('/api/supplies'))).status).toBe(200);
    expect((await getUsers(req('/api/users'))).status).toBe(200);
    expect((await getDashboard(req('/api/dashboard'))).status).toBe(200);
  });

  it('the dashboard skips widgets of disabled features instead of failing', async () => {
    await loginAsNewUser('SUPER_ADMIN');
    await disable('supplies');
    await disable('assets');
    const res = await getDashboard(req('/api/dashboard'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.enabledFeatures).toMatchObject({ supplies: false, assets: false, leaves: true, tasks: true });
    expect(body.data.lowStockSupplies).toEqual([]);
    expect(body.data.stats.assetsInUse).toBe(0);
  });
});
