import { describe, it, expect } from 'vitest';
import { formatSignDate } from './formPrintShared';

describe('formatSignDate', () => {
  it('formats as day / short Thai month / 2-digit Buddhist year', () => {
    expect(formatSignDate(new Date(2026, 10, 8))).toEqual({ day: '8', month: 'พ.ย.', year: '69' });
    expect(formatSignDate('2026-01-31T10:00:00')).toEqual({ day: '31', month: 'ม.ค.', year: '69' });
  });

  it('pads a single-digit Buddhist year (2501-2509 -> 01-09)', () => {
    expect(formatSignDate(new Date(1960, 0, 1))).toEqual({ day: '1', month: 'ม.ค.', year: '03' });
  });

  it('returns null when there is no (valid) date', () => {
    expect(formatSignDate(null)).toBeNull();
    expect(formatSignDate(undefined)).toBeNull();
    expect(formatSignDate('not a date')).toBeNull();
  });
});
