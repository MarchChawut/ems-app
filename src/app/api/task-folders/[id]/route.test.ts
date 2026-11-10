import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH, DELETE } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(method: string, body?: unknown) {
  return new NextRequest('http://localhost:3000/api/task-folders/1', {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/task-folders/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await PATCH(req('PATCH', { name: 'x' }), params('1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-admin', async () => {
    await loginAsNewUser('MANAGER');
    const folder = await prisma.taskFolder.create({ data: { name: 'Original' } });
    const res = await PATCH(req('PATCH', { name: 'x' }), params(String(folder.id)));
    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent folder', async () => {
    await loginAsNewUser('ADMIN');
    const res = await PATCH(req('PATCH', { name: 'x' }), params('999999'));
    expect(res.status).toBe(404);
  });

  it('renames a folder', async () => {
    await loginAsNewUser('ADMIN');
    const folder = await prisma.taskFolder.create({ data: { name: 'Original' } });
    const res = await PATCH(req('PATCH', { name: 'Renamed' }), params(String(folder.id)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('Renamed');
  });
});

describe('DELETE /api/task-folders/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await DELETE(req('DELETE'), params('1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-admin', async () => {
    await loginAsNewUser('MANAGER');
    const folder = await prisma.taskFolder.create({ data: { name: 'x' } });
    const res = await DELETE(req('DELETE'), params(String(folder.id)));
    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent folder', async () => {
    await loginAsNewUser('ADMIN');
    const res = await DELETE(req('DELETE'), params('999999'));
    expect(res.status).toBe(404);
  });

  it('deletes a folder and unfiles (does not delete) any tasks that referenced it', async () => {
    await loginAsNewUser('ADMIN');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    const folder = await prisma.taskFolder.create({ data: { name: 'x' } });
    const task = await prisma.task.create({
      data: { title: 'archived task', columnId: column.id, archivedAt: new Date(), folderId: folder.id },
    });

    const res = await DELETE(req('DELETE'), params(String(folder.id)));
    expect(res.status).toBe(200);
    expect(await prisma.taskFolder.findUnique({ where: { id: folder.id } })).toBeNull();

    const updatedTask = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updatedTask.folderId).toBeNull();
    expect(updatedTask.archivedAt).not.toBeNull();
  });
});
