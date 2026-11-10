import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { GET } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(url = '/api/documents/export') {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

describe('GET /api/documents/export', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('returns 403 for a regular employee (document register is staff-only)', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req('/api/documents/export'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when period=custom without dates', async () => {
    await loginAsNewUser('MANAGER');
    const res = await GET(req('/api/documents/export?period=custom'));
    expect(res.status).toBe(400);
  });

  it('produces a valid xlsx with the document register data', async () => {
    const user = await loginAsNewUser('MANAGER');
    await prisma.documentRegister.create({
      data: { date: new Date(), subject: 'Test doc', direction: 'RECEIVE', recordedById: user.id },
    });

    const res = await GET(req('/api/documents/export?period=day'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('spreadsheetml');

    const buf = Buffer.from(await res.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
    expect(wb.worksheets[0].name).toBe('ทะเบียนรับ-ส่งเอกสาร');
  });

  it('excludes soft-deleted documents', async () => {
    const user = await loginAsNewUser('MANAGER');
    await prisma.documentRegister.create({
      data: { date: new Date(), subject: 'Deleted', direction: 'RECEIVE', recordedById: user.id, isActive: false },
    });

    const res = await GET(req('/api/documents/export?period=day'));
    const buf = Buffer.from(await res.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
    const rows = wb.worksheets[0].getRows(3, 1) ?? [];
    const firstDataRowText = rows[0]?.getCell(6).text ?? '';
    expect(firstDataRowText).not.toBe('Deleted');
  });
});
