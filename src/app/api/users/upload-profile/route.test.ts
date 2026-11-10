import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
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

function reqWithBytes(userId: string, bytes: Uint8Array, opts?: { type?: string; name?: string }) {
  const formData = new FormData();
  formData.append(
    'file',
    new File([bytes as BlobPart], opts?.name ?? 'avatar.png', { type: opts?.type ?? 'image/png' })
  );
  formData.append('userId', userId);
  return new NextRequest('http://localhost:3000/api/users/upload-profile', { method: 'POST', body: formData });
}

describe('POST /api/users/upload-profile', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await POST(reqWithBytes('1', PNG_BYTES));
    expect(res.status).toBe(401);
  });

  it('returns 400 when file or userId is missing', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await POST(new NextRequest('http://localhost:3000/api/users/upload-profile', { method: 'POST', body: new FormData() }));
    expect(res.status).toBe(400);
  });

  it('returns 403 when a non-admin uploads for someone else', async () => {
    await loginAsNewUser('EMPLOYEE');
    const other = await createTestUser('EMPLOYEE');
    const res = await POST(reqWithBytes(String(other.id), PNG_BYTES));
    expect(res.status).toBe(403);
  });

  it('stores the image in the database (not under public/) and points profileImage at the authenticated file route', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const res = await POST(reqWithBytes(String(user.id), PNG_BYTES));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.profileImage).toMatch(/^\/api\/files\/[a-z0-9]+$/);
    const id = body.data.profileImage.replace('/api/files/', '');
    const file = await prisma.uploadedFile.findUnique({ where: { id } });
    expect(file?.mimeType).toBe('image/png');
  });

  it('rejects an HTML/SVG payload disguised as image/png with a .html filename (stored-XSS attempt)', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    const res = await POST(reqWithBytes(String(user.id), html, { type: 'image/png', name: 'evil.html' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_FILE_TYPE');
    expect(await prisma.uploadedFile.count()).toBe(0);
  });

  it('returns 400 INVALID_FILE_TYPE for a non-image even if the client says image/png', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const pdf = new TextEncoder().encode('%PDF-1.4 fake');
    const res = await POST(reqWithBytes(String(user.id), pdf, { type: 'image/png' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_FILE_TYPE');
  });

  it('returns 400 FILE_TOO_LARGE for files over 2MB', async () => {
    const user = await loginAsNewUser('EMPLOYEE');
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(PNG_BYTES);
    const res = await POST(reqWithBytes(String(user.id), big));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('FILE_TOO_LARGE');
  });

  it('an admin can upload for another user; replacing deletes the previous file', async () => {
    await loginAsNewUser('ADMIN');
    const target = await createTestUser('EMPLOYEE');
    const first = await (await POST(reqWithBytes(String(target.id), PNG_BYTES))).json();
    const second = await (await POST(reqWithBytes(String(target.id), PNG_BYTES))).json();
    const firstId = first.data.profileImage.replace('/api/files/', '');
    expect(await prisma.uploadedFile.findUnique({ where: { id: firstId } })).toBeNull();
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.profileImage).toBe(second.data.profileImage);
  });
});
