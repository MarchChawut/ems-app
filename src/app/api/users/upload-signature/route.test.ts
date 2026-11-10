import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, DELETE } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

// Minimal valid PNG signature + IHDR-ish padding so file-type detects image/png
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89,
]);

function uploadReq(bytes: Uint8Array, userId?: number) {
  const formData = new FormData();
  formData.append('file', new File([bytes as BlobPart], 'sig.png', { type: 'image/png' }));
  if (userId !== undefined) formData.append('userId', String(userId));
  return new NextRequest('http://localhost:3000/api/users/upload-signature', { method: 'POST', body: formData });
}

const deleteReq = (userId?: number) =>
  new NextRequest(`http://localhost:3000/api/users/upload-signature${userId ? `?userId=${userId}` : ''}`, {
    method: 'DELETE',
  });

describe('POST /api/users/upload-signature', () => {
  it('returns 401 when unauthenticated', async () => {
    expect((await POST(uploadReq(PNG_BYTES))).status).toBe(401);
  });

  it('a user can upload their own signature (stored in UploadedFile, linked on the user)', async () => {
    const me = await loginAsNewUser('EMPLOYEE');
    const res = await POST(uploadReq(PNG_BYTES));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const user = await prisma.user.findUnique({ where: { id: me.id } });
    expect(user?.signatureFileId).toBe(data.signatureFileId);
    const file = await prisma.uploadedFile.findUnique({ where: { id: data.signatureFileId } });
    expect(file?.mimeType).toBe('image/png');
  });

  it('an EMPLOYEE cannot upload for someone else (403)', async () => {
    const other = await createTestUser('EMPLOYEE');
    await loginAsNewUser('EMPLOYEE');
    expect((await POST(uploadReq(PNG_BYTES, other.id))).status).toBe(403);
  });

  it('an ADMIN can upload for another user', async () => {
    const other = await createTestUser('EMPLOYEE');
    await loginAsNewUser('ADMIN');
    expect((await POST(uploadReq(PNG_BYTES, other.id))).status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: other.id } }))?.signatureFileId).toBeTruthy();
  });

  it('rejects non-image content even if the client claims image/png (magic-byte check)', async () => {
    await loginAsNewUser('EMPLOYEE');
    const notAnImage = new TextEncoder().encode('<html>not an image</html>');
    expect((await POST(uploadReq(notAnImage))).status).toBe(400);
  });

  it('rejects files over 2MB', async () => {
    await loginAsNewUser('EMPLOYEE');
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(PNG_BYTES);
    expect((await POST(uploadReq(big))).status).toBe(400);
  });

  it('replacing the signature deletes the old UploadedFile', async () => {
    await loginAsNewUser('EMPLOYEE');
    const first = (await (await POST(uploadReq(PNG_BYTES))).json()).data.signatureFileId;
    const second = (await (await POST(uploadReq(PNG_BYTES))).json()).data.signatureFileId;
    expect(second).not.toBe(first);
    expect(await prisma.uploadedFile.findUnique({ where: { id: first } })).toBeNull();
    expect(await prisma.uploadedFile.findUnique({ where: { id: second } })).not.toBeNull();
  });
});

describe('DELETE /api/users/upload-signature', () => {
  it('removes the signature and its file; another EMPLOYEE gets 403', async () => {
    const me = await loginAsNewUser('EMPLOYEE');
    const id = (await (await POST(uploadReq(PNG_BYTES))).json()).data.signatureFileId;

    const intruder = await createTestUser('EMPLOYEE');
    expect(intruder.id).not.toBe(me.id);
    expect((await DELETE(deleteReq(intruder.id))).status).toBe(403);

    expect((await DELETE(deleteReq())).status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: me.id } }))?.signatureFileId).toBeNull();
    expect(await prisma.uploadedFile.findUnique({ where: { id } })).toBeNull();
  });
});
