import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

const get = (id: string) =>
  GET(new NextRequest(`http://localhost:3000/api/files/${id}`), { params: Promise.resolve({ id }) });

async function makeFile(uploadedById?: number) {
  return prisma.uploadedFile.create({
    data: { data: Buffer.from([1, 2, 3]), mimeType: 'image/png', fileName: 'x.png', size: 3, uploadedById },
  });
}

async function signatureOwnedBy(userId: number) {
  const file = await makeFile(userId);
  await prisma.user.update({ where: { id: userId }, data: { signatureFileId: file.id } });
  return file.id;
}

describe('GET /api/files/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    const file = await makeFile();
    expect((await get(file.id)).status).toBe(401);
  });

  it('ordinary files (e.g. supply/asset documents) stay readable by any authenticated user', async () => {
    const file = await makeFile();
    await loginAsNewUser('EMPLOYEE');
    expect((await get(file.id)).status).toBe(200);
  });

  it('a signature file is readable by its owner', async () => {
    const owner = await loginAsNewUser('EMPLOYEE');
    const id = await signatureOwnedBy(owner.id);
    expect((await get(id)).status).toBe(200);
  });

  it('a signature file is forbidden to an unrelated EMPLOYEE', async () => {
    const owner = await createTestUser('EMPLOYEE');
    const id = await signatureOwnedBy(owner.id);
    await loginAsNewUser('EMPLOYEE');
    expect((await get(id)).status).toBe(403);
  });

  it('a signature file is readable by MANAGER+, HR, and the owner\'s direct supervisor', async () => {
    const supervisor = await createTestUser('EMPLOYEE');
    const owner = await createTestUser('EMPLOYEE', { supervisorId: supervisor.id });
    const id = await signatureOwnedBy(owner.id);

    for (const role of ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'DIRECTOR', 'HR'] as const) {
      await loginAsNewUser(role);
      expect((await get(id)).status).toBe(200);
    }

    // เข้าสู่ระบบเป็นหัวหน้างานโดยตรงของเจ้าของลายเซ็น (ผู้ใช้เทสที่สร้างไว้แล้ว)
    const { createSessionForUser } = await import('@tests/helpers/auth');
    const { setMockSessionToken } = await import('@tests/helpers/mock-cookies');
    setMockSessionToken(await createSessionForUser(supervisor.id));
    expect((await get(id)).status).toBe(200);
  });
});
