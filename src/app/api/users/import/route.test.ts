import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function reqWithCsv(csv: string, filename = 'users.csv') {
  const formData = new FormData();
  formData.append('file', new File([csv], filename, { type: 'text/csv' }));
  return new NextRequest('http://localhost:3000/api/users/import', { method: 'POST', body: formData });
}

function reqNoFile() {
  return new NextRequest('http://localhost:3000/api/users/import', { method: 'POST', body: new FormData() });
}

describe('POST /api/users/import', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await POST(reqWithCsv('name,email,username\na,a@x.com,a'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-admin', async () => {
    await loginAsNewUser('MANAGER');
    const res = await POST(reqWithCsv('name,email,username\na,a@x.com,a'));
    expect(res.status).toBe(403);
  });

  it('returns 400 NO_FILE when no file is attached', async () => {
    await loginAsNewUser('ADMIN');
    const res = await POST(reqNoFile());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('NO_FILE');
  });

  it('returns 400 INVALID_FILE_TYPE for a non-csv file', async () => {
    await loginAsNewUser('ADMIN');
    const res = await POST(reqWithCsv('name,email,username\na,a@x.com,a', 'users.txt'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('INVALID_FILE_TYPE');
  });

  it('returns 400 MISSING_FIELDS when a required header is absent', async () => {
    await loginAsNewUser('ADMIN');
    const res = await POST(reqWithCsv('name,username\na,a'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('MISSING_FIELDS');
  });

  it('imports valid rows and reports per-row errors', async () => {
    await loginAsNewUser('ADMIN');
    const csv = [
      'name,email,username,role,department',
      'สมชาย ใจดี,somchai@example.test,somchai,EMPLOYEE,IT',
      'Bad Row,not-an-email,badrow,EMPLOYEE,IT',
    ].join('\n');

    const res = await POST(reqWithCsv(csv));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(1);
    expect(body.data.errors).toHaveLength(1);

    const created = await prisma.user.findUnique({ where: { username: 'somchai' } });
    expect(created).not.toBeNull();
    expect(created?.department).toBe('IT');
  });

  it('skips rows whose email or username already exists', async () => {
    await loginAsNewUser('ADMIN');
    await createTestUser('EMPLOYEE', { email: 'dup@example.test', username: 'dupuser' });

    const csv = ['name,email,username', 'Dup User,dup@example.test,dupuser'].join('\n');
    const res = await POST(reqWithCsv(csv));
    const body = await res.json();
    expect(body.data.skipped).toBe(1);
    expect(body.data.imported).toBe(0);
  });
});
