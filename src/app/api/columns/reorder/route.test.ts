import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(body: unknown) {
  return new NextRequest('http://localhost:3000/api/columns/reorder', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/columns/reorder', () => {
  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(req({ columnIds: [1, 2, 3] }));
    expect(res.status).toBe(403);
  });

  it('returns 400 for an empty columnIds array', async () => {
    await loginAsNewUser('ADMIN');
    const res = await POST(req({ columnIds: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 INVALID_COLUMNS when an id does not exist', async () => {
    await loginAsNewUser('ADMIN');
    const columns = await prisma.kanbanColumn.findMany();
    const res = await POST(req({ columnIds: [...columns.map((c) => c.id), 999999] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('INVALID_COLUMNS');
  });

  it('reassigns order to match the given sequence', async () => {
    await loginAsNewUser('ADMIN');
    const columns = await prisma.kanbanColumn.findMany({ orderBy: { order: 'asc' } });
    const reversed = [...columns].reverse().map((c) => c.id);

    const res = await POST(req({ columnIds: reversed }));
    expect(res.status).toBe(200);

    const updated = await prisma.kanbanColumn.findMany({ orderBy: { order: 'asc' } });
    expect(updated.map((c) => c.id)).toEqual(reversed);
  });
});
