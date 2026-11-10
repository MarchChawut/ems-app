import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH, DELETE } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(method: string, body?: unknown) {
  return new NextRequest('http://localhost:3000/api/columns/1', {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/columns/[id]', () => {
  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await PATCH(req('PATCH', { name: 'x' }), params('1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent column', async () => {
    await loginAsNewUser('ADMIN');
    const res = await PATCH(req('PATCH', { name: 'x' }), params('999999'));
    expect(res.status).toBe(404);
  });

  it('updates a column', async () => {
    await loginAsNewUser('ADMIN');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    const res = await PATCH(req('PATCH', { name: 'Renamed' }), params(String(column.id)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('Renamed');
  });
});

describe('DELETE /api/columns/[id]', () => {
  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await DELETE(req('DELETE'), params('1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 COLUMN_HAS_TASKS when the column still has tasks', async () => {
    const user = await loginAsNewUser('ADMIN');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    await prisma.task.create({ data: { title: 'x', priority: 'LOW', columnId: column.id, assigneeId: user.id } });

    const res = await DELETE(req('DELETE'), params(String(column.id)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('COLUMN_HAS_TASKS');
  });

  it('deletes an empty column', async () => {
    await loginAsNewUser('ADMIN');
    const column = await prisma.kanbanColumn.create({ data: { name: 'Empty', order: 99 } });
    const res = await DELETE(req('DELETE'), params(String(column.id)));
    expect(res.status).toBe(200);
    expect(await prisma.kanbanColumn.findUnique({ where: { id: column.id } })).toBeNull();
  });
});
