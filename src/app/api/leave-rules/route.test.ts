import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PATCH } from './route';
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

describe('GET /api/leave-rules', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/leave-rules'));
    expect(res.status).toBe(401);
  });

  it('auto-creates and returns a default fallback rule when none exist', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req('/api/leave-rules'));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].fiscalYear).toBeNull();
    expect(body.data[0].hourThreshold).toBe(3);
  });

  it('filters by fiscalYear', async () => {
    await loginAsNewUser('EMPLOYEE');
    await prisma.leaveRule.create({
      data: { name: 'FY2025', startTime: '08:30', endTime: '16:30', hourThreshold: 3, halfDayFraction: 0.5, fiscalYear: 2025, isActive: true },
    });
    await prisma.leaveRule.create({
      data: { name: 'FY2026', startTime: '08:30', endTime: '16:30', hourThreshold: 4, halfDayFraction: 0.5, fiscalYear: 2026, isActive: true },
    });

    const res = await GET(req('/api/leave-rules?fiscalYear=2026'));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('FY2026');
  });
});

describe('POST /api/leave-rules', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await POST(req('/api/leave-rules', { method: 'POST', body: { name: 'x' } }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(req('/api/leave-rules', { method: 'POST', body: { name: 'x' } }));
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid input', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(req('/api/leave-rules', { method: 'POST', body: { name: '' } }));
    expect(res.status).toBe(400);
  });

  it('creates a rule with defaults applied', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(req('/api/leave-rules', { method: 'POST', body: { name: 'New rule' } }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.hourThreshold).toBe(3);
    expect(body.data.halfDayFraction).toBe(0.5);
  });

  it('returns 409 when the fiscalYear already has a rule', async () => {
    await loginAsNewUser('MANAGER');
    await prisma.leaveRule.create({
      data: { name: 'Existing', startTime: '08:30', endTime: '16:30', hourThreshold: 3, halfDayFraction: 0.5, fiscalYear: 2027, isActive: true },
    });

    const res = await POST(req('/api/leave-rules', { method: 'POST', body: { name: 'Dup', fiscalYear: 2027 } }));
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/leave-rules', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await PATCH(req('/api/leave-rules', { method: 'PATCH', body: { id: 1 } }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await PATCH(req('/api/leave-rules', { method: 'PATCH', body: { id: 1 } }));
    expect(res.status).toBe(403);
  });

  it('returns 400 without an id', async () => {
    await loginAsNewUser('MANAGER');
    const res = await PATCH(req('/api/leave-rules', { method: 'PATCH', body: { hourThreshold: 4 } }));
    expect(res.status).toBe(400);
  });

  it('updates an existing rule', async () => {
    await loginAsNewUser('MANAGER');
    const rule = await prisma.leaveRule.create({
      data: { name: 'ToUpdate', startTime: '08:30', endTime: '16:30', hourThreshold: 3, halfDayFraction: 0.5, isActive: true },
    });

    const res = await PATCH(
      req('/api/leave-rules', { method: 'PATCH', body: { id: rule.id, hourThreshold: 5 } })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.hourThreshold).toBe(5);
  });

  it('returns 409 when updating fiscalYear to one already used by another rule', async () => {
    await loginAsNewUser('MANAGER');
    await prisma.leaveRule.create({
      data: { name: 'A', startTime: '08:30', endTime: '16:30', hourThreshold: 3, halfDayFraction: 0.5, fiscalYear: 2028, isActive: true },
    });
    const ruleB = await prisma.leaveRule.create({
      data: { name: 'B', startTime: '08:30', endTime: '16:30', hourThreshold: 3, halfDayFraction: 0.5, fiscalYear: 2029, isActive: true },
    });

    const res = await PATCH(
      req('/api/leave-rules', { method: 'PATCH', body: { id: ruleB.id, fiscalYear: 2028 } })
    );
    expect(res.status).toBe(409);
  });
});
