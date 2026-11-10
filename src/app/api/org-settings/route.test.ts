import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';
import { DEFAULT_ORG } from '@/lib/org-settings';

setupTestDatabase();

function req(init?: { method?: string; body?: unknown }) {
  return new NextRequest(new URL('/api/org-settings', 'http://localhost:3000'), {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

describe('GET /api/org-settings', () => {
  it('401 when unauthenticated; defaults when no row exists', async () => {
    expect((await GET(req())).status).toBe(401);
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(DEFAULT_ORG);
  });
});

describe('PATCH /api/org-settings', () => {
  it('401 unauthenticated, 403 without org.manage', async () => {
    expect((await PATCH(req({ method: 'PATCH', body: { divisionName: 'X' } }))).status).toBe(401);
    await loginAsNewUser('EMPLOYEE');
    expect((await PATCH(req({ method: 'PATCH', body: { divisionName: 'X' } }))).status).toBe(403);
    expect(await prisma.orgSetting.count()).toBe(0);
  });

  it('a user granted org.manage can change it; admins always can', async () => {
    const emp = await loginAsNewUser('EMPLOYEE');
    await prisma.userPermission.create({ data: { userId: emp.id, permissionKey: 'org.manage', granted: true } });
    expect((await PATCH(req({ method: 'PATCH', body: { divisionName: 'หน่วยใหม่' } }))).status).toBe(200);
  });

  it('validates: empty, whitespace-only, too long and empty body are rejected (400)', async () => {
    await loginAsNewUser('ADMIN');
    for (const body of [{}, { divisionName: '' }, { departmentName: '   ' }, { divisionName: 'ก'.repeat(201) }, { departmentName: 'ก'.repeat(101) }]) {
      expect((await PATCH(req({ method: 'PATCH', body }))).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('renames the org and cascades only to users who still use the old name (seconded staff untouched)', async () => {
    await prisma.orgSetting.create({ data: { id: 1, ...DEFAULT_ORG } });
    const admin = await loginAsNewUser('ADMIN');
    const same = await createTestUser('EMPLOYEE');
    const seconded = await createTestUser('EMPLOYEE');
    await prisma.user.update({ where: { id: admin.id }, data: { division: DEFAULT_ORG.divisionName, department: DEFAULT_ORG.departmentName } });
    await prisma.user.update({ where: { id: same.id }, data: { division: DEFAULT_ORG.divisionName, department: DEFAULT_ORG.departmentName } });
    await prisma.user.update({ where: { id: seconded.id }, data: { division: 'สังกัดอื่น', department: 'กองอื่น' } });

    const res = await PATCH(req({ method: 'PATCH', body: { divisionName: '  ศูนย์ใหม่  ', departmentName: 'กองใหม่' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ divisionName: 'ศูนย์ใหม่', departmentName: 'กองใหม่' });
    expect(body.meta).toEqual({ divisionUsers: 2, departmentUsers: 2 });

    expect((await prisma.user.findUniqueOrThrow({ where: { id: same.id } })).division).toBe('ศูนย์ใหม่');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: same.id } })).department).toBe('กองใหม่');
    const s = await prisma.user.findUniqueOrThrow({ where: { id: seconded.id } });
    expect([s.division, s.department]).toEqual(['สังกัดอื่น', 'กองอื่น']);
  });

  it('treats injection-looking text as plain data', async () => {
    await loginAsNewUser('ADMIN');
    const evil = "x'; DROP TABLE users; --";
    const res = await PATCH(req({ method: 'PATCH', body: { divisionName: evil } }));
    expect(res.status).toBe(200);
    expect(await prisma.user.count()).toBeGreaterThan(0);
    expect((await prisma.orgSetting.findUniqueOrThrow({ where: { id: 1 } })).divisionName).toBe(evil);
  });

  it('rejects control / bidi characters in names (400)', async () => {
    await loginAsNewUser('ADMIN');
    for (const v of ['a\nb', 'a\u202Eb']) {
      expect((await PATCH(req({ method: 'PATCH', body: { divisionName: v } }))).status).toBe(400);
    }
  });

  it('concurrent renames stay consistent: users end up with exactly the final org name (no stale cascade)', async () => {
    await prisma.orgSetting.create({ data: { id: 1, ...DEFAULT_ORG } });
    const admin = await loginAsNewUser('ADMIN');
    await prisma.user.update({ where: { id: admin.id }, data: { division: DEFAULT_ORG.divisionName } });
    const u = await createTestUser('EMPLOYEE');
    await prisma.user.update({ where: { id: u.id }, data: { division: DEFAULT_ORG.divisionName } });

    const results = await Promise.all([
      PATCH(req({ method: 'PATCH', body: { divisionName: 'ชื่อ B' } })),
      PATCH(req({ method: 'PATCH', body: { divisionName: 'ชื่อ C' } })),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);

    const org = await prisma.orgSetting.findUniqueOrThrow({ where: { id: 1 } });
    const users = await prisma.user.findMany({ select: { division: true } });
    for (const user of users) expect(user.division).toBe(org.divisionName);
  });
});

