import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser } from '@tests/helpers/auth';

setupTestDatabase();

const req = () => new NextRequest(new URL('/api/users/options', 'http://localhost:3000'));

describe('GET /api/users/options', () => {
  it('returns 401 when unauthenticated', async () => {
    expect((await GET(req())).status).toBe(401);
  });

  it('EMPLOYEE gets only id/prefix/name/isActive (no role, position, department or supervisor of colleagues)', async () => {
    await loginAsNewUser('EMPLOYEE');
    await createTestUser('MANAGER', { department: 'กองทดสอบ' });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.length).toBeGreaterThanOrEqual(2);
    for (const row of data) {
      expect(Object.keys(row).sort()).toEqual(['id', 'isActive', 'name', 'prefix']);
    }
  });

  it('MANAGER gets the slim directory fields, including inactive users (old leaves may reference them)', async () => {
    await loginAsNewUser('MANAGER');
    await createTestUser('EMPLOYEE', { isActive: false, department: 'กองทดสอบ' });
    const { data } = await (await GET(req())).json();
    const row = data.find((u: { isActive: boolean }) => u.isActive === false);
    expect(row).toBeTruthy();
    expect(Object.keys(row).sort()).toEqual(
      ['department', 'id', 'isActive', 'name', 'position', 'prefix', 'role', 'supervisorId'].sort()
    );
  });
});
