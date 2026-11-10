import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { GET } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(url = '/api/supplies/export') {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

describe('GET /api/supplies/export', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it('returns 400 when period=custom without dates', async () => {
    await loginAsNewUser('MANAGER');
    const res = await GET(req('/api/supplies/export?period=custom'));
    expect(res.status).toBe(400);
  });

  it('produces a workbook with STOCK/NON_STOCK, history, and low-stock sheets', async () => {
    await loginAsNewUser('MANAGER');
    await prisma.supply.create({ data: { name: 'Low', type: 'STOCK', currentQuantity: 1, minimumQuantity: 5 } });
    await prisma.supply.create({ data: { name: 'NonStock', type: 'NON_STOCK' } });

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('spreadsheetml');

    const buf = Buffer.from(await res.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'คงคลัง (STOCK)',
      'ไม่คงคลัง (NON_STOCK)',
      'ประวัติการเบิก-รับ',
      'สินค้าใกล้หมด',
    ]);
  });

  it('a single type filter produces a single summary sheet', async () => {
    await loginAsNewUser('MANAGER');
    await prisma.supply.create({ data: { name: 'A', type: 'STOCK' } });

    const res = await GET(req('/api/supplies/export?type=STOCK'));
    const buf = Buffer.from(await res.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['สรุปพัสดุ', 'ประวัติการเบิก-รับ', 'สินค้าใกล้หมด']);
  });
});
