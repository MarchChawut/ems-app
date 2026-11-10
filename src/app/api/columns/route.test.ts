import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
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

describe('GET /api/columns', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/columns'));
    expect(res.status).toBe(401);
  });

  it('returns columns ordered by order (seeded baseline: To Do, In Progress, Done)', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req('/api/columns'));
    const body = await res.json();
    expect(body.data.map((c: { name: string }) => c.name)).toEqual(['To Do', 'In Progress', 'Done']);
  });
});

describe('POST /api/columns', () => {
  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(req('/api/columns', { method: 'POST', body: { name: 'x' } }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for a manager too (managing the shared board is admin-only)', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(req('/api/columns', { method: 'POST', body: { name: 'x' } }));
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid input', async () => {
    await loginAsNewUser('ADMIN');
    const res = await POST(req('/api/columns', { method: 'POST', body: { name: '' } }));
    expect(res.status).toBe(400);
  });

  it('auto-assigns order as (max existing order + 1) when not specified', async () => {
    await loginAsNewUser('ADMIN');
    const res = await POST(req('/api/columns', { method: 'POST', body: { name: 'Review' } }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.order).toBe(3); // after the 3 seeded columns (order 0,1,2)
  });

  it('defaults color to "slate" when not specified', async () => {
    await loginAsNewUser('ADMIN');
    const res = await POST(req('/api/columns', { method: 'POST', body: { name: 'x' } }));
    const body = await res.json();
    expect(body.data.color).toBe('slate');
  });
});
