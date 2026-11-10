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

describe('GET /api/tasks', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await GET(req('/api/tasks'));
    expect(res.status).toBe(401);
  });

  it('returns an empty list when authenticated and no tasks exist', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req('/api/tasks'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('excludes archived tasks by default, includes them with showArchived=true', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const column = await prisma.kanbanColumn.findFirstOrThrow();

    await prisma.task.create({
      data: { title: 'Active task', priority: 'MEDIUM', columnId: column.id, assigneeId: user.id },
    });
    await prisma.task.create({
      data: {
        title: 'Archived task',
        priority: 'MEDIUM',
        columnId: column.id,
        assigneeId: user.id,
        archivedAt: new Date(),
      },
    });

    const defaultRes = await GET(req('/api/tasks'));
    const defaultBody = await defaultRes.json();
    expect(defaultBody.data).toHaveLength(1);
    expect(defaultBody.data[0].title).toBe('Active task');

    const allRes = await GET(req('/api/tasks?showArchived=true'));
    const allBody = await allRes.json();
    expect(allBody.data).toHaveLength(2);
  });

  it('filters by priority', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const column = await prisma.kanbanColumn.findFirstOrThrow();

    await prisma.task.create({
      data: { title: 'Low', priority: 'LOW', columnId: column.id, assigneeId: user.id },
    });
    await prisma.task.create({
      data: { title: 'Urgent', priority: 'URGENT', columnId: column.id, assigneeId: user.id },
    });

    const res = await GET(req('/api/tasks?priority=URGENT'));
    const body = await res.json();

    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('Urgent');
  });
});

describe('POST /api/tasks', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await POST(req('/api/tasks', { method: 'POST', body: { title: 'x', priority: 'LOW' } }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid input (missing title)', async () => {
    await loginAsNewUser('ADMIN');
    const res = await POST(req('/api/tasks', { method: 'POST', body: { priority: 'LOW' } }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('creates a task and defaults to the first column when columnId is omitted', async () => {
    await loginAsNewUser('ADMIN');
    const res = await POST(
      req('/api/tasks', { method: 'POST', body: { title: 'New task', priority: 'HIGH' } })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('New task');
    expect(body.data.columnId).toBe(1);
  });

  it('returns 404 when assigneeId does not exist', async () => {
    await loginAsNewUser('ADMIN');
    const res = await POST(
      req('/api/tasks', { method: 'POST', body: { title: 'x', priority: 'LOW', assigneeId: 999999 } })
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe('ASSIGNEE_NOT_FOUND');
  });

  it('auto-computes reminderDayBeforeAt/reminderOnDayAt from reminderAt', async () => {
    await loginAsNewUser('ADMIN');
    const res = await POST(
      req('/api/tasks', {
        method: 'POST',
        body: { title: 'Reminder task', priority: 'MEDIUM', reminderAt: '2026-07-22T12:40:00' },
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(new Date(body.data.reminderOnDayAt).getDate()).toBe(22);
    expect(new Date(body.data.reminderOnDayAt).getHours()).toBe(8);
    expect(new Date(body.data.reminderDayBeforeAt).getDate()).toBe(21);
    expect(new Date(body.data.reminderDayBeforeAt).getHours()).toBe(19);
  });
});

describe('board scope (shared vs private)', () => {
  const postReq = (body: unknown) =>
    POST(
      new NextRequest('http://localhost:3000/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
  const listReq = (scope?: string) =>
    GET(new NextRequest(`http://localhost:3000/api/tasks${scope ? `?scope=${scope}` : ''}`));

  it('EMPLOYEE / MANAGER cannot create a SHARED task (403) but can create a PRIVATE one', async () => {
    for (const role of ['EMPLOYEE', 'MANAGER'] as const) {
      const user = await loginAsNewUser(role);
      expect((await postReq({ title: 'ส่วนรวม', priority: 'LOW' })).status).toBe(403);
      const res = await postReq({ title: 'ส่วนตัว', priority: 'LOW', scope: 'private', assigneeId: 999999 });
      expect(res.status).toBe(201);
      const { data } = await res.json();
      expect(data.ownerId).toBe(user.id);
      expect(data.assigneeId).toBe(user.id); // forced to the owner
    }
  });

  it('a private task never triggers LINE reminders', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await postReq({ title: 'ส่วนตัว', priority: 'LOW', scope: 'private', reminderAt: '2030-01-10T09:00:00.000Z' });
    const { data } = await res.json();
    expect(data.reminderAt).toBeNull();
    expect(data.reminderDayBeforeAt).toBeNull();
    expect(data.reminderOnDayAt).toBeNull();
  });

  it('ADMIN and SUPER_ADMIN can create shared tasks', async () => {
    await loginAsNewUser('ADMIN');
    expect((await postReq({ title: 'ส่วนรวม', priority: 'LOW' })).status).toBe(201);
    await loginAsNewUser('SUPER_ADMIN');
    expect((await postReq({ title: 'ส่วนรวม 2', priority: 'LOW' })).status).toBe(201);
  });

  it('GET: shared board shows only shared tasks; private board shows only my own — never someone else\'s', async () => {
    const me = await loginAsNewUser('EMPLOYEE');
    const other = await createTestUser('EMPLOYEE');
    await prisma.task.create({ data: { title: 'shared-1' } });
    await prisma.task.create({ data: { title: 'mine-1', ownerId: me.id } });
    await prisma.task.create({ data: { title: 'theirs-1', ownerId: other.id } });

    const titles = async (scope?: string) => (await (await listReq(scope)).json()).data.map((t: { title: string }) => t.title);
    expect(await titles()).toEqual(['shared-1']);
    expect(await titles('shared')).toEqual(['shared-1']);
    expect(await titles('private')).toEqual(['mine-1']);
    expect(await titles('all')).toEqual(['shared-1']); // unknown scope falls back to shared, never widens access

    await loginAsNewUser('SUPER_ADMIN');
    expect((await titles('private')).includes('theirs-1')).toBe(false); // not even admins see others' private tasks
  });
});
