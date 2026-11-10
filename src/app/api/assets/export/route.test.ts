import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { GET } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(url = '/api/assets/export') {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

describe('GET /api/assets/export', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-manager', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  async function loadWorkbook(res: Response) {
    const buf = Buffer.from(await res.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
    return wb;
  }

  it('produces a valid xlsx workbook with two sheets', async () => {
    await loginAsNewUser('MANAGER');
    await prisma.asset.create({ data: { name: 'Laptop', assetTag: 'TAG-1' } });

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('spreadsheetml');

    const wb = await loadWorkbook(res);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['ครุภัณฑ์', 'ประวัติการเบิก-คืน']);
    // แถวแรกเป็นหัวตาราง + 1 รายการ
    expect(wb.getWorksheet('ครุภัณฑ์')!.rowCount).toBe(2);
  });

  it('excludes soft-deleted assets from the export', async () => {
    await loginAsNewUser('MANAGER');
    await prisma.asset.create({ data: { name: 'Active' } });
    await prisma.asset.create({ data: { name: 'Deleted', isActive: false } });

    const wb = await loadWorkbook(await GET(req()));
    expect(wb.getWorksheet('ครุภัณฑ์')!.rowCount).toBe(2);
  });

  it('neutralizes spreadsheet formulas in user-entered text (formula injection)', async () => {
    await loginAsNewUser('MANAGER');
    await prisma.asset.create({ data: { name: '=HYPERLINK("http://evil.example","click")', brand: '@SUM(1+1)' } });

    const wb = await loadWorkbook(await GET(req()));
    const row = wb.getWorksheet('ครุภัณฑ์')!.getRow(2);
    const values = (row.values as unknown[]).filter((v) => typeof v === 'string') as string[];
    expect(values.some((v) => v.startsWith('=') || v.startsWith('@'))).toBe(false);
    expect(values).toContain(`'=HYPERLINK("http://evil.example","click")`);
  });
});
