import { describe, it, expect } from 'vitest';
import { PAGE_MARGINS, getPageMargins, cssPadding, pdfPadding, mmToPt } from './pageMargins';

describe('pageMargins', () => {
  it('keeps the legacy margins for every form except the vehicle request', () => {
    for (const [key, setup] of Object.entries(PAGE_MARGINS)) {
      if (key === 'VEHICLE_REQUEST') continue;
      expect(setup.print).toEqual({ top: 15, right: 20, bottom: 10, left: 30 });
      expect(setup.pdf).toEqual({ top: 25, right: 20, bottom: 20, left: 30 });
    }
  });

  it('vehicle request: pdf margins are the print margins converted to pt (kept in sync)', () => {
    // ค่าตัวเลขของขอบแก้ได้อิสระใน pageMargins.ts — test นี้เช็คแค่ว่า pdf ตรงกับ print เสมอ
    const v = PAGE_MARGINS.VEHICLE_REQUEST;
    expect(v.pdf).toEqual(mmToPt(v.print));
  });

  it('every form has its own entry (editing one does not touch another)', () => {
    const keys = ['VEHICLE_REQUEST', 'REFRESHMENT_REQUEST', 'MEETING_ROOM_REQUEST', 'SPEAKER_REQUEST', 'LEAVE', 'LATE_ARRIVAL', 'EARLY_LEAVE'];
    for (const k of keys) expect(Object.keys(PAGE_MARGINS)).toContain(k);
    const objs = new Set(Object.values(PAGE_MARGINS).map((s) => s.print));
    expect(objs.size).toBe(Object.keys(PAGE_MARGINS).length);
  });

  it('unknown / empty keys fall back to default', () => {
    expect(getPageMargins('NOPE')).toBe(PAGE_MARGINS.default);
    expect(getPageMargins(null)).toBe(PAGE_MARGINS.default);
    expect(getPageMargins(undefined)).toBe(PAGE_MARGINS.default);
    expect(getPageMargins('toString')).toBe(PAGE_MARGINS.default);
    expect(getPageMargins('LEAVE')).toBe(PAGE_MARGINS.LEAVE);
  });

  it('formats css and pdf padding as top right bottom left', () => {
    expect(cssPadding({ top: 12, right: 10, bottom: 10, left: 10 })).toBe('12mm 10mm 10mm 10mm');
    expect(pdfPadding({ top: 34, right: 28, bottom: 28, left: 28 })).toBe('34 28 28 28');
    expect(mmToPt({ top: 10, right: 10, bottom: 10, left: 10 }).left).toBe(28);
  });
});
