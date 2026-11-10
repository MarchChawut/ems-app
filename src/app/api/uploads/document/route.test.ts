import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
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

function reqWithFile(bytes: Uint8Array, filename = 'file.bin') {
  const formData = new FormData();
  formData.append('file', new File([bytes as BlobPart], filename));
  return new NextRequest('http://localhost:3000/api/uploads/document', { method: 'POST', body: formData });
}

function reqNoFile() {
  return new NextRequest('http://localhost:3000/api/uploads/document', { method: 'POST', body: new FormData() });
}

describe('POST /api/uploads/document', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await POST(reqWithFile(PNG_BYTES));
    expect(res.status).toBe(401);
  });

  it('returns 400 INVALID_INPUT when no file is attached', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(reqNoFile());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('INVALID_INPUT');
  });

  it('rejects a file whose magic bytes are not an allowed type, ignoring any client-supplied type', async () => {
    await loginAsNewUser('EMPLOYEE');
    const fakeBytes = new Uint8Array(Array.from({ length: 20 }, (_, i) => i));
    const res = await POST(reqWithFile(fakeBytes));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('INVALID_FILE_TYPE');
  });

  it('accepts a real PNG (detected via magic bytes) and stores it in the DB', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const res = await POST(reqWithFile(PNG_BYTES, 'photo.png'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.url).toMatch(/^\/api\/files\//);

    const fileId = body.data.url.split('/').pop();
    const stored = await prisma.uploadedFile.findUniqueOrThrow({ where: { id: fileId } });
    expect(stored.mimeType).toBe('image/png');
    expect(stored.uploadedById).toBe(user.id);
  });
});
