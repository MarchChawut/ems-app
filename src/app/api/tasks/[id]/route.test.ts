import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH, DELETE } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(method: string, body?: unknown) {
  return new NextRequest('http://localhost:3000/api/tasks/1', {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function createTask(assigneeId: number, columnId: number) {
  return prisma.task.create({ data: { title: 'Task', priority: 'LOW', columnId, assigneeId } });
}

describe('PATCH /api/tasks/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await PATCH(req('PATCH', { title: 'x' }), params('1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a non-numeric id', async () => {
    await loginAsNewUser('ADMIN');
    const res = await PATCH(req('PATCH', { title: 'x' }), params('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 404 for a nonexistent task', async () => {
    await loginAsNewUser('ADMIN');
    const res = await PATCH(req('PATCH', { title: 'x' }), params('999999'));
    expect(res.status).toBe(404);
  });

  it('updates the title', async () => {
    const user = await loginAsNewUser('ADMIN');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    const task = await createTask(user.id, column.id);

    const res = await PATCH(req('PATCH', { title: 'Renamed' }), params(String(task.id)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.title).toBe('Renamed');
  });

  it('returns 404 COLUMN_NOT_FOUND when moving to a nonexistent column', async () => {
    const user = await loginAsNewUser('ADMIN');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    const task = await createTask(user.id, column.id);

    const res = await PATCH(req('PATCH', { columnId: 999999 }), params(String(task.id)));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('COLUMN_NOT_FOUND');
  });

  it('returns 400 for an invalid priority', async () => {
    const user = await loginAsNewUser('ADMIN');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    const task = await createTask(user.id, column.id);

    const res = await PATCH(req('PATCH', { priority: 'CRITICAL' }), params(String(task.id)));
    expect(res.status).toBe(400);
  });

  it('returns 404 ASSIGNEE_NOT_FOUND for a nonexistent assignee', async () => {
    const user = await loginAsNewUser('ADMIN');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    const task = await createTask(user.id, column.id);

    const res = await PATCH(req('PATCH', { assigneeId: 999999 }), params(String(task.id)));
    expect(res.status).toBe(404);
  });

  it('clears the assignee when assigneeId is explicitly null', async () => {
    const user = await loginAsNewUser('ADMIN');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    const task = await createTask(user.id, column.id);

    const res = await PATCH(req('PATCH', { assigneeId: null }), params(String(task.id)));
    const body = await res.json();
    expect(body.data.assigneeId).toBeNull();
  });

  it('recomputes reminder schedule fields when reminderAt changes, and resets sent flags', async () => {
    const user = await loginAsNewUser('ADMIN');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    const task = await prisma.task.create({
      data: {
        title: 'Task', priority: 'LOW', columnId: column.id, assigneeId: user.id,
        reminderAt: new Date('2026-07-01T12:00:00'),
        reminderSentAt: new Date(),
      },
    });

    const res = await PATCH(req('PATCH', { reminderAt: '2026-07-22T12:40:00' }), params(String(task.id)));
    const body = await res.json();
    expect(new Date(body.data.reminderOnDayAt).getDate()).toBe(22);
    expect(body.data.reminderSentAt).toBeNull();
  });

  it('clears reminder fields when reminderAt is set to null', async () => {
    const user = await loginAsNewUser('ADMIN');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    const task = await prisma.task.create({
      data: { title: 'Task', priority: 'LOW', columnId: column.id, assigneeId: user.id, reminderAt: new Date() },
    });

    const res = await PATCH(req('PATCH', { reminderAt: null }), params(String(task.id)));
    const body = await res.json();
    expect(body.data.reminderAt).toBeNull();
    expect(body.data.reminderDayBeforeAt).toBeNull();
  });

  it('archives a task into a folder in one request', async () => {
    const user = await loginAsNewUser('ADMIN');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    const folder = await prisma.taskFolder.create({ data: { name: 'โปรเจกต์ A' } });
    const task = await createTask(user.id, column.id);

    const res = await PATCH(
      req('PATCH', { archivedAt: new Date().toISOString(), folderId: folder.id }),
      params(String(task.id))
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.archivedAt).not.toBeNull();
    expect(body.data.folderId).toBe(folder.id);
    expect(body.data.folder.name).toBe('โปรเจกต์ A');
  });

  it('returns 404 FOLDER_NOT_FOUND for a nonexistent folderId', async () => {
    const user = await loginAsNewUser('ADMIN');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    const task = await createTask(user.id, column.id);

    const res = await PATCH(req('PATCH', { folderId: 999999 }), params(String(task.id)));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('FOLDER_NOT_FOUND');
  });

  it('clears the folder when folderId is explicitly null', async () => {
    const user = await loginAsNewUser('ADMIN');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    const folder = await prisma.taskFolder.create({ data: { name: 'x' } });
    const task = await prisma.task.create({
      data: { title: 'Task', priority: 'LOW', columnId: column.id, assigneeId: user.id, archivedAt: new Date(), folderId: folder.id },
    });

    const res = await PATCH(req('PATCH', { folderId: null }), params(String(task.id)));
    const body = await res.json();
    expect(body.data.folderId).toBeNull();
  });
});

describe('DELETE /api/tasks/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await DELETE(req('DELETE'), params('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 for a nonexistent task', async () => {
    await loginAsNewUser('ADMIN');
    const res = await DELETE(req('DELETE'), params('999999'));
    expect(res.status).toBe(404);
  });

  it('deletes the task', async () => {
    const user = await loginAsNewUser('ADMIN');
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    const task = await createTask(user.id, column.id);

    const res = await DELETE(req('DELETE'), params(String(task.id)));
    expect(res.status).toBe(200);
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeNull();
  });
});

describe('board permissions (shared vs private)', () => {
  const patchReq = (id: number, body: unknown) =>
    PATCH(
      new NextRequest(`http://localhost:3000/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: String(id) }) }
    );
  const deleteReq = (id: number) =>
    DELETE(new NextRequest(`http://localhost:3000/api/tasks/${id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: String(id) }),
    });

  it('EMPLOYEE / MANAGER cannot edit, move or delete a SHARED task (403)', async () => {
    const task = await prisma.task.create({ data: { title: 'ส่วนรวม' } });
    for (const role of ['EMPLOYEE', 'MANAGER'] as const) {
      await loginAsNewUser(role);
      expect((await patchReq(task.id, { title: 'hack' })).status).toBe(403);
      expect((await deleteReq(task.id)).status).toBe(403);
    }
    expect((await prisma.task.findUnique({ where: { id: task.id } }))?.title).toBe('ส่วนรวม');
  });

  it('ADMIN and SUPER_ADMIN can edit and delete a shared task', async () => {
    const task = await prisma.task.create({ data: { title: 'ส่วนรวม' } });
    await loginAsNewUser('SUPER_ADMIN');
    expect((await patchReq(task.id, { title: 'ok' })).status).toBe(200);
    await loginAsNewUser('ADMIN');
    expect((await deleteReq(task.id)).status).toBe(200);
  });

  it('a PRIVATE task is invisible (404) and untouchable by everyone except its owner — even admins', async () => {
    const owner = await loginAsNewUser('EMPLOYEE');
    const task = await prisma.task.create({ data: { title: 'ส่วนตัว', ownerId: owner.id, assigneeId: owner.id } });
    expect((await patchReq(task.id, { title: 'mine' })).status).toBe(200);

    for (const role of ['EMPLOYEE', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'] as const) {
      await loginAsNewUser(role);
      expect((await patchReq(task.id, { title: 'x' })).status).toBe(404);
      expect((await deleteReq(task.id)).status).toBe(404);
    }
    expect(await prisma.task.findUnique({ where: { id: task.id } })).not.toBeNull();
  });

  it('the owner can move/delete their private task but cannot reassign it, set LINE reminders, or change ownerId', async () => {
    const owner = await loginAsNewUser('EMPLOYEE');
    const other = await createTestUser('EMPLOYEE');
    const task = await prisma.task.create({ data: { title: 'ส่วนตัว', ownerId: owner.id, assigneeId: owner.id } });

    const res = await patchReq(task.id, {
      assigneeId: other.id,
      reminderAt: '2030-01-10T09:00:00.000Z',
      ownerId: other.id,
    });
    expect(res.status).toBe(200);
    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(after.ownerId).toBe(owner.id);
    expect(after.assigneeId).toBe(owner.id);
    expect(after.reminderAt).toBeNull();
    expect(after.reminderDayBeforeAt).toBeNull();

    expect((await deleteReq(task.id)).status).toBe(200);
  });
});
