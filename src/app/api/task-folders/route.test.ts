import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';
import { PERMISSIONS } from '@/lib/permissions';

setupTestDatabase();

function req(url: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

describe('GET /api/task-folders', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/task-folders'));
    expect(res.status).toBe(401);
  });

  it('any authenticated user (even EMPLOYEE) can list folders', async () => {
    await loginAsNewUser('EMPLOYEE');
    await prisma.taskFolder.create({ data: { name: 'โปรเจกต์ A' } });
    const res = await GET(req('/api/task-folders'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.map((f: { name: string }) => f.name)).toEqual(['โปรเจกต์ A']);
  });

  it('returns folders ordered by order', async () => {
    await loginAsNewUser('ADMIN');
    await prisma.taskFolder.create({ data: { name: 'Second', order: 1 } });
    await prisma.taskFolder.create({ data: { name: 'First', order: 0 } });
    const res = await GET(req('/api/task-folders'));
    const body = await res.json();
    expect(body.data.map((f: { name: string }) => f.name)).toEqual(['First', 'Second']);
  });
});

describe('POST /api/task-folders', () => {
  it('returns 403 for a role without the permission (EMPLOYEE)', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(req('/api/task-folders', { method: 'POST', body: { name: 'x' } }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for MANAGER by default (not an admin role, no override yet)', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(req('/api/task-folders', { method: 'POST', body: { name: 'x' } }));
    expect(res.status).toBe(403);
  });

  it('ADMIN can create a folder', async () => {
    await loginAsNewUser('ADMIN');
    const res = await POST(req('/api/task-folders', { method: 'POST', body: { name: 'โปรเจกต์ B' } }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe('โปรเจกต์ B');
  });

  it('SUPER_ADMIN can create a folder', async () => {
    await loginAsNewUser('SUPER_ADMIN');
    const res = await POST(req('/api/task-folders', { method: 'POST', body: { name: 'x' } }));
    expect(res.status).toBe(201);
  });

  it('a MANAGER granted the tasks.manage_folders override can create a folder', async () => {
    const manager = await loginAsNewUser('MANAGER');
    await prisma.userPermission.create({
      data: { userId: manager.id, permissionKey: PERMISSIONS.TASKS_MANAGE_FOLDERS, granted: true },
    });
    const res = await POST(req('/api/task-folders', { method: 'POST', body: { name: 'x' } }));
    expect(res.status).toBe(201);
  });

  it('returns 400 for invalid input', async () => {
    await loginAsNewUser('ADMIN');
    const res = await POST(req('/api/task-folders', { method: 'POST', body: { name: '' } }));
    expect(res.status).toBe(400);
  });

  it('auto-assigns order as (max existing order + 1) when not specified', async () => {
    await loginAsNewUser('ADMIN');
    await prisma.taskFolder.create({ data: { name: 'Existing', order: 4 } });
    const res = await POST(req('/api/task-folders', { method: 'POST', body: { name: 'New' } }));
    const body = await res.json();
    expect(body.data.order).toBe(5);
  });
});
