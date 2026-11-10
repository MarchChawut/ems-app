import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH, DELETE } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(method: string, body?: unknown) {
  return new NextRequest('http://localhost:3000/api/documents/1', {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function createDoc(recordedById: number) {
  return prisma.documentRegister.create({
    data: { date: new Date('2026-07-06'), subject: 'Test', direction: 'RECEIVE', recordedById },
  });
}

describe('GET /api/documents/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('GET'), params('1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a regular employee', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req('GET'), params('1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent document', async () => {
    await loginAsNewUser('MANAGER');
    const res = await GET(req('GET'), params('999999'));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/documents/[id]', () => {
  it('returns 403 for a non-admin', async () => {
    const user = await loginAsNewUser('MANAGER');
    const doc = await createDoc(user.id);
    const res = await PATCH(req('PATCH', { subject: 'x' }), params(String(doc.id)));
    expect(res.status).toBe(403);
  });

  it('updates a document', async () => {
    const user = await loginAsNewUser('ADMIN');
    const doc = await createDoc(user.id);
    const res = await PATCH(req('PATCH', { subject: 'Updated' }), params(String(doc.id)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.subject).toBe('Updated');
  });

  it('returns 404 for a nonexistent document', async () => {
    await loginAsNewUser('ADMIN');
    const res = await PATCH(req('PATCH', { subject: 'x' }), params('999999'));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/documents/[id]', () => {
  it('returns 403 for a non-admin', async () => {
    const user = await loginAsNewUser('MANAGER');
    const doc = await createDoc(user.id);
    const res = await DELETE(req('DELETE'), params(String(doc.id)));
    expect(res.status).toBe(403);
  });

  it('soft-deletes a document', async () => {
    const user = await loginAsNewUser('ADMIN');
    const doc = await createDoc(user.id);
    const res = await DELETE(req('DELETE'), params(String(doc.id)));
    expect(res.status).toBe(200);
    const updated = await prisma.documentRegister.findUniqueOrThrow({ where: { id: doc.id } });
    expect(updated.isActive).toBe(false);
  });
});
