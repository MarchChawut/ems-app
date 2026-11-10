import { describe, it, expect } from 'vitest';
import {
  getFiscalYear,
  getFiscalYearRange,
  calculateLeaveDays,
  DEFAULT_LEAVE_RULE,
  type HolidayLike,
} from './leave-calc';

describe('getFiscalYear', () => {
  it('a date in October belongs to the fiscal year starting that year', () => {
    expect(getFiscalYear(new Date(2025, 9, 1))).toBe(2025); // Oct 1
  });

  it('a date in January belongs to the fiscal year that started the previous October', () => {
    expect(getFiscalYear(new Date(2026, 0, 15))).toBe(2025);
  });

  it('boundary: September 30 (last day) still belongs to the previous fiscal year', () => {
    expect(getFiscalYear(new Date(2026, 8, 30))).toBe(2025);
  });

  it('boundary: October 1 (first day) belongs to the new fiscal year', () => {
    expect(getFiscalYear(new Date(2026, 9, 1))).toBe(2026);
  });

  it('accepts a date string', () => {
    expect(getFiscalYear('2026-01-15')).toBe(2025);
  });
});

describe('getFiscalYearRange', () => {
  it('returns Oct 1 - Sep 30 spanning the fiscal year', () => {
    const { start, end } = getFiscalYearRange(new Date(2026, 0, 15));

    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(9);
    expect(start.getDate()).toBe(1);

    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(8);
    expect(end.getDate()).toBe(30);
  });
});

describe('calculateLeaveDays - hours branch', () => {
  it('hours at or below threshold count as a half day', () => {
    expect(calculateLeaveDays('2026-07-06', '2026-07-06', false, 3)).toBe(0.5);
    expect(calculateLeaveDays('2026-07-06', '2026-07-06', false, 1)).toBe(0.5);
  });

  it('hours above threshold count as a full day', () => {
    expect(calculateLeaveDays('2026-07-06', '2026-07-06', false, 4)).toBe(1);
    expect(calculateLeaveDays('2026-07-06', '2026-07-06', false, 8)).toBe(1);
  });

  it('respects a custom rule', () => {
    const rule = { hourThreshold: 4, halfDayFraction: 0.4 };
    expect(calculateLeaveDays('2026-07-06', '2026-07-06', false, 4, [], rule)).toBe(0.4);
    expect(calculateLeaveDays('2026-07-06', '2026-07-06', false, 5, [], rule)).toBe(1);
  });

  it('hours=0 is falsy and falls through to the date-range calculation instead', () => {
    // Monday 2026-07-06, no holidays -> 1 full weekday
    expect(calculateLeaveDays('2026-07-06', '2026-07-06', false, 0)).toBe(1);
  });

  it('negative hours fall through to the date-range calculation instead', () => {
    expect(calculateLeaveDays('2026-07-06', '2026-07-06', false, -1)).toBe(1);
  });

  it('null/undefined hours fall through to the date-range calculation', () => {
    expect(calculateLeaveDays('2026-07-06', '2026-07-06', false, null)).toBe(1);
    expect(calculateLeaveDays('2026-07-06', '2026-07-06', false, undefined)).toBe(1);
  });
});

describe('calculateLeaveDays - isHalfDay branch', () => {
  it('returns halfDayFraction when isHalfDay is true and no hours given', () => {
    expect(calculateLeaveDays('2026-07-06', '2026-07-06', true, null)).toBe(0.5);
  });

  it('respects a custom halfDayFraction', () => {
    const rule = { hourThreshold: 3, halfDayFraction: 0.4 };
    expect(calculateLeaveDays('2026-07-06', '2026-07-06', true, null, [], rule)).toBe(0.4);
  });

  it('hours takes priority over isHalfDay when both are set', () => {
    expect(calculateLeaveDays('2026-07-06', '2026-07-06', true, 8)).toBe(1);
  });
});

describe('calculateLeaveDays - date-range branch', () => {
  it('counts a single weekday as 1 day', () => {
    // Monday
    expect(calculateLeaveDays('2026-07-06', '2026-07-06', false, null)).toBe(1);
  });

  it('is inclusive of both start and end dates', () => {
    // Mon-Wed = 3 days
    expect(calculateLeaveDays('2026-07-06', '2026-07-08', false, null)).toBe(3);
  });

  it('skips weekends within the range', () => {
    // Fri 2026-07-10 through Mon 2026-07-13 -> Fri, Mon = 2 days (Sat/Sun skipped)
    expect(calculateLeaveDays('2026-07-10', '2026-07-13', false, null)).toBe(2);
  });

  it('a range that is entirely a weekend counts as 0 days', () => {
    // Sat 2026-07-11 - Sun 2026-07-12
    expect(calculateLeaveDays('2026-07-11', '2026-07-12', false, null)).toBe(0);
  });

  it('skips holidays that fall within the range', () => {
    const holidays: HolidayLike[] = [{ date: '2026-07-07' }];
    // Mon-Wed minus the Tue holiday = 2 days
    expect(calculateLeaveDays('2026-07-06', '2026-07-08', false, null, holidays)).toBe(2);
  });

  it('a holiday on a weekend does not double-subtract', () => {
    const holidays: HolidayLike[] = [{ date: '2026-07-11' }]; // Saturday
    expect(calculateLeaveDays('2026-07-10', '2026-07-13', false, null, holidays)).toBe(2);
  });

  it('matches holidays by calendar date regardless of Date vs string input', () => {
    const holidays: HolidayLike[] = [{ date: new Date(2026, 6, 7, 15, 30) }]; // time component should be ignored
    expect(calculateLeaveDays('2026-07-06', '2026-07-08', false, null, holidays)).toBe(2);
  });

  it('uses DEFAULT_LEAVE_RULE when no rule is passed', () => {
    expect(calculateLeaveDays('2026-07-06', '2026-07-06', false, DEFAULT_LEAVE_RULE.hourThreshold)).toBe(
      DEFAULT_LEAVE_RULE.halfDayFraction
    );
  });
});
