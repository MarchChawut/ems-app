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

describe('GET /api/documents', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/documents'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a regular employee', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req('/api/documents'));
    expect(res.status).toBe(403);
  });

  it('filters by direction and excludes soft-deleted', async () => {
    const user = await loginAsNewUser('ADMIN');
    await prisma.documentRegister.create({
      data: { date: new Date('2026-07-06'), subject: 'In', direction: 'RECEIVE', recordedById: user.id },
    });
    await prisma.documentRegister.create({
      data: { date: new Date('2026-07-06'), subject: 'Out', direction: 'SEND', recordedById: user.id },
    });
    await prisma.documentRegister.create({
      data: { date: new Date('2026-07-06'), subject: 'Deleted', direction: 'RECEIVE', recordedById: user.id, isActive: false },
    });

    const res = await GET(req('/api/documents?direction=RECEIVE'));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].subject).toBe('In');
  });
});

describe('POST /api/documents', () => {
  const valid = { date: '2026-07-06', subject: 'ทดสอบ', direction: 'RECEIVE', category: 'MEMO' };

  it('returns 403 for a non-admin', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(req('/api/documents', { method: 'POST', body: valid }));
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid input', async () => {
    await loginAsNewUser('ADMIN');
    const res = await POST(req('/api/documents', { method: 'POST', body: { ...valid, subject: '' } }));
    expect(res.status).toBe(400);
  });

  it('creates a document and records the current user as recorder', async () => {
    const user = await loginAsNewUser('ADMIN');
    const res = await POST(req('/api/documents', { method: 'POST', body: valid }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.recordedBy.id).toBe(user.id);
  });
});
