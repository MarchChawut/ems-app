import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH, DELETE } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(method: string, body?: unknown) {
  return new NextRequest('http://localhost:3000/api/form-requests/1', {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function createFormTemplate() {
  return prisma.formTemplate.create({
    data: {
      // แม่แบบทั่วไปสำหรับทดสอบกลไกฟอร์มแบบไดนามิก — ไม่ใช้ VEHICLE_REQUEST เพราะใบขอรถยนต์มีกติกาเฉพาะ (สิทธิ์ + เลือกผู้ขอ) ที่ทดสอบใน vehicle.test.ts
      systemKey: 'MEETING_ROOM_REQUEST',
      menuTitle: 'ขอใช้ห้องประชุม',
      documentTitle: 'ขอใช้ห้องประชุม',
      fields: {
        create: [
          { key: 'destination', label: 'ปลายทาง', inputType: 'text', required: true, order: 0 },
          { key: 'purpose', label: 'วัตถุประสงค์', inputType: 'text', required: true, order: 1 },
        ],
      },
    },
  });
}

async function createFormRequest(requestedById: number, templateId?: number) {
  return prisma.formRequest.create({
    data: {
      requestedById,
      templateId,
      // เหมือนพฤติกรรมจริงของ POST /api/form-requests (route.ts:103) ที่ตั้ง PENDING
      // เสมอเมื่อผูกกับ template — request ที่ไม่มี template จำลอง legacy data (status: null)
      status: templateId ? 'PENDING' : undefined,
      type: 'VEHICLE_REQUEST',
      requestDate: new Date('2026-07-06'),
      data: { destination: 'กรุงเทพฯ', purpose: 'ประชุม' },
    },
  });
}

// ใช้ในเทสที่คาดหวังให้ fail ก่อนถึงจุดตรวจสอบ templateId จริง (401/403/404 ของ resource เอง) - templateId
// เป็นเลขปลอมได้เพราะ schema แค่เช็คว่าเป็นตัวเลข ไม่ได้ query หา template จริงจนกว่าจะผ่านด่านก่อนหน้า
const validUpdateBody = {
  templateId: 1,
  requestDate: '2026-07-06',
  data: { destination: 'เชียงใหม่', purpose: 'อบรม' },
};

describe('GET /api/form-requests/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('GET'), params('1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a non-numeric id', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req('GET'), params('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 404 for a nonexistent form request', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req('GET'), params('999999'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when a non-owner, non-manager tries to view', async () => {
    const owner = await createTestUser('EMPLOYEE');
    await loginAsNewUser('EMPLOYEE');
    const fr = await createFormRequest(owner.id);

    const res = await GET(req('GET'), params(String(fr.id)));
    expect(res.status).toBe(403);
  });

  it('lets the owner view their own form request', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const fr = await createFormRequest(user.id);

    const res = await GET(req('GET'), params(String(fr.id)));
    expect(res.status).toBe(200);
  });

  it('lets a manager view any form request', async () => {
    const owner = await createTestUser('EMPLOYEE');
    await loginAsNewUser('MANAGER');
    const fr = await createFormRequest(owner.id);

    const res = await GET(req('GET'), params(String(fr.id)));
    expect(res.status).toBe(200);
  });

  it('lets an admin view any form request', async () => {
    const owner = await createTestUser('EMPLOYEE');
    await loginAsNewUser('ADMIN');
    const fr = await createFormRequest(owner.id);

    const res = await GET(req('GET'), params(String(fr.id)));
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/form-requests/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await PATCH(req('PATCH', validUpdateBody), params('1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a non-numeric id', async () => {
    await loginAsNewUser('ADMIN');
    const res = await PATCH(req('PATCH', validUpdateBody), params('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 403 for the owner editing their own form request (admin-only)', async () => {
    const owner = await loginAsNewUser('EMPLOYEE');
    const fr = await createFormRequest(owner.id);

    const res = await PATCH(req('PATCH', validUpdateBody), params(String(fr.id)));
    expect(res.status).toBe(403);
  });

  it('returns 403 for a manager', async () => {
    const owner = await createTestUser('EMPLOYEE');
    await loginAsNewUser('MANAGER');
    const fr = await createFormRequest(owner.id);

    const res = await PATCH(req('PATCH', validUpdateBody), params(String(fr.id)));
    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent form request', async () => {
    await loginAsNewUser('ADMIN');
    const res = await PATCH(req('PATCH', validUpdateBody), params('999999'));
    expect(res.status).toBe(404);
  });

  it('lets an admin edit any form request', async () => {
    const template = await createFormTemplate();
    const owner = await createTestUser('EMPLOYEE');
    await loginAsNewUser('ADMIN');
    const fr = await createFormRequest(owner.id, template.id);

    const res = await PATCH(
      req('PATCH', { templateId: template.id, requestDate: '2026-07-06', data: { destination: 'เชียงใหม่', purpose: 'อบรม' } }),
      params(String(fr.id))
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.data.destination).toBe('เชียงใหม่');
  });
});

describe('DELETE /api/form-requests/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await DELETE(req('DELETE'), params('1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a non-numeric id', async () => {
    await loginAsNewUser('ADMIN');
    const res = await DELETE(req('DELETE'), params('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 403 for the owner deleting their own form request (admin-only)', async () => {
    const owner = await loginAsNewUser('EMPLOYEE');
    const fr = await createFormRequest(owner.id);

    const res = await DELETE(req('DELETE'), params(String(fr.id)));
    expect(res.status).toBe(403);
  });

  it('returns 403 for a manager', async () => {
    const owner = await createTestUser('EMPLOYEE');
    await loginAsNewUser('MANAGER');
    const fr = await createFormRequest(owner.id);

    const res = await DELETE(req('DELETE'), params(String(fr.id)));
    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent form request', async () => {
    await loginAsNewUser('ADMIN');
    const res = await DELETE(req('DELETE'), params('999999'));
    expect(res.status).toBe(404);
  });

  it('lets an admin delete any form request', async () => {
    const owner = await createTestUser('EMPLOYEE');
    await loginAsNewUser('ADMIN');
    const fr = await createFormRequest(owner.id);

    const res = await DELETE(req('DELETE'), params(String(fr.id)));
    expect(res.status).toBe(200);
    expect(await prisma.formRequest.findUnique({ where: { id: fr.id } })).toBeNull();
  });
});
