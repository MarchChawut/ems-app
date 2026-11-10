import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from './route';
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

describe('GET /api/holidays', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/holidays'));
    expect(res.status).toBe(401);
  });

  it('filters by year', async () => {
    await loginAsNewUser('EMPLOYEE');
    await prisma.holiday.create({ data: { date: new Date('2025-12-25'), name: '2025 holiday', year: 2025 } });
    await prisma.holiday.create({ data: { date: new Date('2026-01-01'), name: '2026 holiday', year: 2026 } });

    const res = await GET(req('/api/holidays?year=2026'));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('2026 holiday');
  });
});

describe('POST /api/holidays', () => {
  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(req('/api/holidays', { method: 'POST', body: { startDate: '2026-07-06', name: 'x' } }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when endDate precedes startDate', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(
      req('/api/holidays', { method: 'POST', body: { startDate: '2026-07-10', endDate: '2026-07-05', name: 'x' } })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when the range exceeds 30 days', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(
      req('/api/holidays', { method: 'POST', body: { startDate: '2026-01-01', endDate: '2026-03-01', name: 'x' } })
    );
    expect(res.status).toBe(400);
  });

  it('creates one holiday per day in a multi-day range', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(
      req('/api/holidays', { method: 'POST', body: { startDate: '2026-04-13', endDate: '2026-04-15', name: 'สงกรานต์' } })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toHaveLength(3);
  });

  it('skips dates that already have a holiday', async () => {
    await loginAsNewUser('MANAGER');
    await prisma.holiday.create({ data: { date: new Date('2026-04-13'), name: 'Existing', year: 2026 } });

    const res = await POST(
      req('/api/holidays', { method: 'POST', body: { startDate: '2026-04-13', endDate: '2026-04-14', name: 'สงกรานต์' } })
    );
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.message).toContain('ข้าม');
  });
});

describe('DELETE /api/holidays', () => {
  it('returns 400 without an id', async () => {
    await loginAsNewUser('MANAGER');
    const res = await DELETE(req('/api/holidays', { method: 'DELETE' }));
    expect(res.status).toBe(400);
  });

  it('deletes a holiday', async () => {
    await loginAsNewUser('MANAGER');
    const holiday = await prisma.holiday.create({ data: { date: new Date('2026-07-06'), name: 'x', year: 2026 } });
    const res = await DELETE(req(`/api/holidays?id=${holiday.id}`, { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(await prisma.holiday.findUnique({ where: { id: holiday.id } })).toBeNull();
  });
});
