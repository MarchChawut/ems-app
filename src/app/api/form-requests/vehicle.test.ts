/**
 * ใบขอรับการสนับสนุนรถยนต์ — ตรวจที่ฝั่ง server (ไม่เชื่อข้อมูลจาก client):
 * สิทธิ์ใช้ฟอร์ม, การเลือกชื่อผู้ขอ (admin เลือกคนอื่นได้ คนอื่นเลือกได้แค่ตัวเอง), ผบ.ชา. ต้องเป็น MANAGER/DIRECTOR,
 * ชื่อที่พิมพ์ในใบถูกเขียนทับจากฐานข้อมูล (กันปลอมชื่อ), จำนวนต้อง ≥ 1
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { GET as getRequesterOptions } from './requester-options/route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';
import { VEHICLE_REQUEST_FIELDS } from '@/lib/vehicle-request';
import { DEFAULT_ORG } from '@/lib/org-settings';

setupTestDatabase();

const req = (url: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

async function createVehicleTemplate() {
  return prisma.formTemplate.create({
    data: {
      systemKey: 'VEHICLE_REQUEST',
      menuTitle: 'ขอรถยนต์หลวง',
      documentTitle: 'ใบขอรับการสนับสนุนรถยนต์',
      fields: {
        create: VEHICLE_REQUEST_FIELDS.map((f, order) => ({
          key: f.key,
          label: f.label,
          inputType: f.inputType,
          required: f.required,
          order,
          options: f.options ?? undefined,
        })),
      },
    },
  });
}

const grantVehicle = (userId: number) =>
  prisma.userPermission.create({ data: { userId, permissionKey: 'forms.request_vehicle', granted: true } });

const body = (templateId: number, data: Record<string, unknown>) => ({
  templateId,
  requestDate: '2026-11-10',
  data: { vehicleCount: 1, vehicleTypes: ['บัส'], purpose: 'ทดสอบ', destination: 'กรุงเทพฯ', ...data },
});

const post = (templateId: number, data: Record<string, unknown>) =>
  POST(req('/api/form-requests', { method: 'POST', body: body(templateId, data) }));

describe('permission to use the vehicle form', () => {
  it('a user without forms.request_vehicle gets 403', async () => {
    const t = await createVehicleTemplate();
    const me = await loginAsNewUser('EMPLOYEE');
    expect((await post(t.id, { requesterUserId: me.id })).status).toBe(403);
    expect(await prisma.formRequest.count()).toBe(0);
  });

  it('a user granted the permission can submit for themself', async () => {
    const t = await createVehicleTemplate();
    const me = await loginAsNewUser('EMPLOYEE');
    await grantVehicle(me.id);
    const res = await post(t.id, { requesterUserId: me.id });
    expect(res.status).toBe(201);
  });
});

describe('who may be chosen as the requester ("ข้าพเจ้า")', () => {
  it('a non-admin cannot pick someone else (403, nothing saved)', async () => {
    const t = await createVehicleTemplate();
    const me = await loginAsNewUser('EMPLOYEE');
    await grantVehicle(me.id);
    const other = await createTestUser('EMPLOYEE');
    expect((await post(t.id, { requesterUserId: other.id })).status).toBe(403);
    expect(await prisma.formRequest.count()).toBe(0);
  });

  it('an admin can pick anyone, and the printed name is overwritten from the database (client value ignored)', async () => {
    const t = await createVehicleTemplate();
    await loginAsNewUser('ADMIN');
    const other = await createTestUser('EMPLOYEE', { name: 'ชื่อจริงในระบบ' });
    const res = await post(t.id, { requesterUserId: other.id, requesterName: 'ชื่อปลอมที่ส่งมา' });
    expect(res.status).toBe(201);
    const saved = (await res.json()).data;
    expect(saved.data.requesterName).toBe('ชื่อจริงในระบบ');
    expect(saved.data.requesterName).not.toContain('ปลอม');
  });

  it('an unknown or deactivated requester is rejected (400)', async () => {
    const t = await createVehicleTemplate();
    await loginAsNewUser('ADMIN');
    const inactive = await createTestUser('EMPLOYEE', { isActive: false });
    expect((await post(t.id, { requesterUserId: 999999 })).status).toBe(400);
    expect((await post(t.id, { requesterUserId: inactive.id })).status).toBe(400);
  });
});

describe('approver (ผบ.ชา.)', () => {
  it('must be an active MANAGER/DIRECTOR; the name comes from the database', async () => {
    const t = await createVehicleTemplate();
    const admin = await loginAsNewUser('ADMIN');
    const employee = await createTestUser('EMPLOYEE');
    const hr = await createTestUser('HR');
    const superAdmin = await createTestUser('SUPER_ADMIN');
    const manager = await createTestUser('MANAGER', { name: 'ผู้จัดการจริง' });
    const director = await createTestUser('DIRECTOR');
    const inactiveManager = await createTestUser('MANAGER', { isActive: false });

    for (const bad of [employee, hr, admin, superAdmin, inactiveManager]) {
      expect((await post(t.id, { requesterUserId: admin.id, approverUserId: bad.id })).status, `role ${bad.role}`).toBe(400);
    }
    const ok = await post(t.id, { requesterUserId: admin.id, approverUserId: manager.id, approverName: 'ปลอม' });
    expect(ok.status).toBe(201);
    expect((await ok.json()).data.data.approverName).toBe('ผู้จัดการจริง');
    expect((await post(t.id, { requesterUserId: admin.id, approverUserId: director.id })).status).toBe(201);
  });
});

describe('coordinator and document preparer', () => {
  it('a chosen coordinator/submitter must exist and be active; their names come from the database', async () => {
    const t = await createVehicleTemplate();
    const admin = await loginAsNewUser('ADMIN');
    const person = await createTestUser('EMPLOYEE', { name: 'ผู้ประสานงานจริง' });
    const inactive = await createTestUser('EMPLOYEE', { isActive: false });

    expect((await post(t.id, { requesterUserId: admin.id, coordinatorUserId: 999999 })).status).toBe(400);
    expect((await post(t.id, { requesterUserId: admin.id, coordinatorUserId: inactive.id })).status).toBe(400);
    expect((await post(t.id, { requesterUserId: admin.id, submitterUserId: inactive.id })).status).toBe(400);

    const ok = await post(t.id, { requesterUserId: admin.id, coordinatorUserId: person.id, coordinator: 'ปลอม', submitterUserId: person.id, submitterName: 'ปลอม' });
    expect(ok.status).toBe(201);
    const saved = (await ok.json()).data.data;
    expect(saved.coordinator).toBe('ผู้ประสานงานจริง');
    expect(saved.submitterName).toBe('ผู้ประสานงานจริง');
  });

  it('"other" (no user id) keeps the typed free-text name', async () => {
    const t = await createVehicleTemplate();
    const admin = await loginAsNewUser('ADMIN');
    const res = await post(t.id, { requesterUserId: admin.id, coordinator: 'คนนอกหน่วย' });
    expect(res.status).toBe(201);
    expect((await res.json()).data.data.coordinator).toBe('คนนอกหน่วย');
  });
});

describe('numbers must be whole and at least 1', () => {
  it('rejects 0, negatives and decimals for the counts (400)', async () => {
    const t = await createVehicleTemplate();
    const admin = await loginAsNewUser('ADMIN');
    for (const patch of [{ vehicleCount: 0 }, { vehicleCount: -3 }, { vehicleCount: 1.5 }, { tripCount: 0 }, { passengerCount: -1 }]) {
      const res = await post(t.id, { requesterUserId: admin.id, ...patch });
      expect(res.status, JSON.stringify(patch)).toBe(400);
    }
    expect((await post(t.id, { requesterUserId: admin.id, vehicleCount: 2, tripCount: 1, passengerCount: 4 })).status).toBe(201);
  });
});

describe('select options', () => {
  it('rejects a department or destination office that is not one of the options', async () => {
    const t = await createVehicleTemplate();
    const admin = await loginAsNewUser('ADMIN');
    expect((await post(t.id, { requesterUserId: admin.id, department: 'หน่วยที่ไม่มีในรายการ' })).status).toBe(400);
    expect((await post(t.id, { requesterUserId: admin.id, addressTo: 'ที่ไหนก็ได้' })).status).toBe(400);
    expect((await post(t.id, { requesterUserId: admin.id, vehicleTypes: ['เรือดำน้ำ'] })).status).toBe(400);
  });

  it('the department option follows the org setting (rename takes effect without re-seeding)', async () => {
    const t = await createVehicleTemplate();
    const admin = await loginAsNewUser('ADMIN');
    // ค่าตอน seed เป็นชื่อเริ่มต้น แต่แอดมินเปลี่ยนชื่อสังกัดแล้ว
    await prisma.orgSetting.create({ data: { id: 1, divisionName: 'สังกัดชื่อใหม่', departmentName: DEFAULT_ORG.departmentName } });
    expect((await post(t.id, { requesterUserId: admin.id, department: 'สังกัดชื่อใหม่' })).status).toBe(201);
    expect((await post(t.id, { requesterUserId: admin.id, department: DEFAULT_ORG.divisionName })).status).toBe(400);
  });
});

describe('GET /api/form-requests/requester-options', () => {
  it('401 unauthenticated; 403 without the vehicle permission', async () => {
    expect((await getRequesterOptions(req('/api/form-requests/requester-options'))).status).toBe(401);
    await loginAsNewUser('EMPLOYEE');
    expect((await getRequesterOptions(req('/api/form-requests/requester-options'))).status).toBe(403);
  });

  it('a permitted non-admin only sees themself as a requester; approvers are MANAGER/DIRECTOR only', async () => {
    const me = await loginAsNewUser('EMPLOYEE');
    await grantVehicle(me.id);
    await createTestUser('EMPLOYEE');
    const manager = await createTestUser('MANAGER');
    await createTestUser('HR');

    const res = await getRequesterOptions(req('/api/form-requests/requester-options'));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.requesters.map((u: { id: number }) => u.id)).toEqual([me.id]);
    expect(data.approvers.map((u: { id: number }) => u.id)).toEqual([manager.id]);
    // รายชื่อ ผบ.ชา. ไม่ส่งเบอร์โทร (ไม่จำเป็นต่อการเติมใบ)
    expect(data.approvers[0]).not.toHaveProperty('phone');
  });

  it('an admin sees every active user as a possible requester (inactive excluded)', async () => {
    await loginAsNewUser('ADMIN');
    await createTestUser('EMPLOYEE');
    await createTestUser('EMPLOYEE', { isActive: false });
    const res = await getRequesterOptions(req('/api/form-requests/requester-options'));
    expect((await res.json()).data.requesters).toHaveLength(2);
  });
});

describe('phone numbers (privacy)', () => {
  it('a non-admin never receives other people\'s phone numbers in the coordinator list; the server fills them on save', async () => {
    const t = await createVehicleTemplate();
    const me = await loginAsNewUser('EMPLOYEE');
    await grantVehicle(me.id);
    const colleague = await createTestUser('EMPLOYEE', { name: 'เพื่อนร่วมงาน' });
    await prisma.user.update({ where: { id: colleague.id }, data: { phone: '081-111-2222' } });
    await prisma.user.update({ where: { id: me.id }, data: { phone: '089-999-0000' } });

    const list = await (await getRequesterOptions(req('/api/form-requests/requester-options'))).json();
    for (const c of list.data.coordinators) expect(c).not.toHaveProperty('phone');
    expect(JSON.stringify(list.data.coordinators)).not.toContain('081-111-2222');

    const res = await post(t.id, { requesterUserId: me.id, coordinatorUserId: colleague.id, submitterUserId: me.id });
    expect(res.status).toBe(201);
    const saved = (await res.json()).data.data;
    expect(saved.coordinatorPhone).toBe('081-111-2222');
    expect(saved.submitterPhone).toBe('089-999-0000');
    expect(saved.phone).toBe('089-999-0000');
  });

  it('a phone the user typed is kept (not overwritten); admins still see phones in the list', async () => {
    const t = await createVehicleTemplate();
    const admin = await loginAsNewUser('ADMIN');
    const person = await createTestUser('EMPLOYEE');
    await prisma.user.update({ where: { id: person.id }, data: { phone: '081-000-0000' } });

    const list = await (await getRequesterOptions(req('/api/form-requests/requester-options'))).json();
    expect(list.data.coordinators.find((c: { id: number }) => c.id === person.id)).toHaveProperty('phone', '081-000-0000');

    const res = await post(t.id, { requesterUserId: admin.id, coordinatorUserId: person.id, coordinatorPhone: '02-123-4567' });
    expect((await res.json()).data.data.coordinatorPhone).toBe('02-123-4567');
  });

  it('counts above the cap are rejected', async () => {
    const t = await createVehicleTemplate();
    const admin = await loginAsNewUser('ADMIN');
    expect((await post(t.id, { requesterUserId: admin.id, vehicleCount: 1001 })).status).toBe(400);
  });
});

