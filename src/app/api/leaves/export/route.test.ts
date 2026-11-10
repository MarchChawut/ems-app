import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser, createTestUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

describe('GET /api/leaves/export', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req('/api/leaves/export'));
    expect(res.status).toBe(401);
  });

  it('exports a CSV with a BOM, Thai headers, and a content-disposition attachment header', async () => {
    await loginAsNewUser('MANAGER');
    const employee = await createTestUser('EMPLOYEE', { name: 'สมชาย ใจดี' });
    await prisma.leave.create({
      data: { userId: employee.id, type: 'SICK', startDate: new Date('2026-07-06'), endDate: new Date('2026-07-06'), reason: 'ป่วย', totalDays: 1 },
    });

    const res = await GET(req('/api/leaves/export'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment');

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM, for Excel

    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('รหัส');
    expect(text).toContain('สมชาย ใจดี');
  });

  it('respects a restricted columns list', async () => {
    await loginAsNewUser('MANAGER');
    const employee = await createTestUser('EMPLOYEE');
    await prisma.leave.create({
      data: { userId: employee.id, type: 'SICK', startDate: new Date('2026-07-06'), endDate: new Date('2026-07-06'), reason: 'x', totalDays: 1 },
    });

    const res = await GET(req('/api/leaves/export?columns=name,status'));
    const text = await res.text();
    const headerLine = text.replace('﻿', '').split('\n')[0];
    expect(headerLine).toBe('ชื่อพนักงาน,สถานะ');
  });

  it('returns an empty (header-less) body when there are no leaves to export', async () => {
    await loginAsNewUser('EMPLOYEE');
    const res = await GET(req('/api/leaves/export'));
    const text = await res.text();
    expect(text).toBe('');
  });

  it('tab=LATE_ARRIVAL exports only LATE_ARRIVAL rows regardless of formCategory', async () => {
    await loginAsNewUser('MANAGER');
    const employee = await createTestUser('EMPLOYEE');
    await prisma.leave.create({
      data: { userId: employee.id, type: 'LATE_ARRIVAL', startDate: new Date('2026-07-06'), endDate: new Date('2026-07-06'), reason: 'สาย', totalDays: 0.5, formCategory: 'KBK', hours: 2 },
    });
    await prisma.leave.create({
      data: { userId: employee.id, type: 'SICK', startDate: new Date('2026-07-06'), endDate: new Date('2026-07-06'), reason: 'ป่วย', totalDays: 1, formCategory: 'KBK' },
    });

    const res = await GET(req('/api/leaves/export?tab=LATE_ARRIVAL&columns=name,type'));
    const text = await res.text();
    const rows = text.replace('﻿', '').split('\n').filter(Boolean);
    expect(rows).toHaveLength(2); // header + 1 data row
    expect(rows[1]).toContain('มาสาย');
  });

  it('tab combined with a date range does not drop the range condition (AND-merge regression)', async () => {
    await loginAsNewUser('MANAGER');
    const employee = await createTestUser('EMPLOYEE');
    await prisma.leave.create({
      data: { userId: employee.id, type: 'SICK', startDate: new Date('2026-07-06'), endDate: new Date('2026-07-06'), reason: 'x', totalDays: 1, formCategory: 'KBK' },
    });

    const hit = await GET(req('/api/leaves/export?tab=KBK&startDate=2026-07-01&endDate=2026-07-10&columns=name'));
    const hitRows = (await hit.text()).replace('﻿', '').split('\n').filter(Boolean);
    expect(hitRows).toHaveLength(2);

    const miss = await GET(req('/api/leaves/export?tab=KBK&startDate=2026-08-01&endDate=2026-08-10&columns=name'));
    expect(await miss.text()).toBe('');
  });

  it('a regular employee only exports their own leave requests, even when searching by another name', async () => {
    const me = await loginAsNewUser('EMPLOYEE');
    const other = await createTestUser('EMPLOYEE', { name: 'สมชาย ใจดี' });
    await prisma.leave.create({
      data: { userId: me.id, type: 'SICK', startDate: new Date('2026-07-06'), endDate: new Date('2026-07-06'), reason: 'me', totalDays: 1 },
    });
    await prisma.leave.create({
      data: { userId: other.id, type: 'SICK', startDate: new Date('2026-07-06'), endDate: new Date('2026-07-06'), reason: 'other', totalDays: 1 },
    });

    const res = await GET(req('/api/leaves/export?name=สมชาย'));
    const text = await res.text();
    expect(text).toBe('');

    const own = await GET(req('/api/leaves/export'));
    const ownText = await own.text();
    expect(ownText).toContain('me');
  });
});
