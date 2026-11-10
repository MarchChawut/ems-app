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
      type: 'VEHICLE_REQUEST',
      requestDate: new Date('2026-07-06'),
      data: { destination: 'กรุงเทพฯ', purpose: 'ประชุม' },
    },
  });
}

describe('GET /api/form-requests', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/form-requests'));
    expect(res.status).toBe(401);
  });

  it('a regular employee only sees their own form requests', async () => {
    const me = await loginAsNewUser('EMPLOYEE');
    const other = await createTestUser('EMPLOYEE');
    await createFormRequest(me.id);
    await createFormRequest(other.id);

    const res = await GET(req('/api/form-requests'));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].requestedById).toBe(me.id);
  });

  it('a manager sees all form requests', async () => {
    await loginAsNewUser('MANAGER');
    const employee = await createTestUser('EMPLOYEE');
    await createFormRequest(employee.id);
    await createFormRequest(employee.id);

    const res = await GET(req('/api/form-requests'));
    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });

  it('an admin sees all form requests', async () => {
    await loginAsNewUser('ADMIN');
    const employee = await createTestUser('EMPLOYEE');
    await createFormRequest(employee.id);

    const res = await GET(req('/api/form-requests'));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });

  it('supports pagination via page/limit', async () => {
    const manager = await loginAsNewUser('MANAGER');
    for (let i = 0; i < 3; i++) {
      await createFormRequest(manager.id);
    }

    const res = await GET(req('/api/form-requests?page=1&limit=2'));
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.meta).toEqual({ total: 3, page: 1, limit: 2, hasMore: true });
  });
});

describe('POST /api/form-requests', () => {
  it('returns 401 when unauthenticated', async () => {
    const template = await createFormTemplate();
    const res = await POST(
      req('/api/form-requests', {
        method: 'POST',
        body: { templateId: template.id, requestDate: '2026-07-06', data: { destination: 'x', purpose: 'y' } },
      })
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid input (missing required field)', async () => {
    const template = await createFormTemplate();
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(
      req('/api/form-requests', {
        method: 'POST',
        body: { templateId: template.id, requestDate: '2026-07-06', data: { destination: 'x' } },
      })
    );
    expect(res.status).toBe(400);
  });

  it('lets a regular employee create a form request for themselves', async () => {
    const template = await createFormTemplate();
    const me = await loginAsNewUser('EMPLOYEE');
    const res = await POST(
      req('/api/form-requests', {
        method: 'POST',
        body: {
          templateId: template.id,
          requestDate: '2026-07-06',
          data: { destination: 'กรุงเทพฯ', purpose: 'ประชุม' },
        },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.requestedById).toBe(me.id);
    expect(body.data.templateId).toBe(template.id);
    expect(body.data.type).toBe('MEETING_ROOM_REQUEST'); // type = systemKey ของแม่แบบ
    expect(body.data.status).toBe('PENDING');
  });
});
