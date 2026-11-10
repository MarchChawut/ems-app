import { describe, it, expect } from 'vitest';
import {
  cn,
  toBuddhistYear,
  safeGetGregorianYear,
  toSafeGregorianDate,
  computeTaskReminderSchedule,
  formatDate,
  formatTime,
  formatDateTime,
  calculateDays,
  truncate,
  formatNumber,
  isValidEmail,
  slugify,
  generateUUID,
  isBrowser,
  isServer,
  isMilitaryPrefix,
  formatSignatureName,
  CIVILIAN_PREFIXES,
} from './utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('px-4', 'py-2')).toBe('px-4 py-2');
  });

  it('resolves tailwind-merge conflicts (later class wins)', () => {
    expect(cn('px-4', 'px-8')).toBe('px-8');
  });

  it('drops falsy values', () => {
    expect(cn('px-4', false, undefined, null, 'py-2')).toBe('px-4 py-2');
  });
});

describe('toBuddhistYear', () => {
  it('converts a Gregorian year to Buddhist year', () => {
    expect(toBuddhistYear(2025)).toBe(2568);
  });

  it('does not double-add when already a Buddhist year', () => {
    expect(toBuddhistYear(2568)).toBe(2568);
  });

  it('boundary: exactly 2500 is treated as Gregorian and converted', () => {
    expect(toBuddhistYear(2500)).toBe(3043);
  });

  it('boundary: 2501 is treated as already Buddhist and passed through', () => {
    expect(toBuddhistYear(2501)).toBe(2501);
  });
});

describe('safeGetGregorianYear', () => {
  it('extracts the Gregorian year unchanged from a Gregorian date', () => {
    expect(safeGetGregorianYear(new Date(2025, 0, 15))).toBe(2025);
  });

  it('converts a Buddhist year back to Gregorian', () => {
    expect(safeGetGregorianYear(new Date(2568, 0, 15))).toBe(2025);
  });
});

describe('toSafeGregorianDate', () => {
  it('leaves an already-Gregorian date string unchanged', () => {
    const d = toSafeGregorianDate('2026-07-07');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(7);
  });

  it('corrects a Buddhist-year date string to Gregorian', () => {
    const d = toSafeGregorianDate('2569-07-07');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(7);
  });
});

describe('computeTaskReminderSchedule', () => {
  it('computes day-before at 19:00 and on-day at 08:00, midday input', () => {
    const { dayBeforeAt, onDayAt } = computeTaskReminderSchedule(new Date(2026, 6, 22, 12, 40));

    expect(onDayAt.getFullYear()).toBe(2026);
    expect(onDayAt.getMonth()).toBe(6);
    expect(onDayAt.getDate()).toBe(22);
    expect(onDayAt.getHours()).toBe(8);
    expect(onDayAt.getMinutes()).toBe(0);

    expect(dayBeforeAt.getFullYear()).toBe(2026);
    expect(dayBeforeAt.getMonth()).toBe(6);
    expect(dayBeforeAt.getDate()).toBe(21);
    expect(dayBeforeAt.getHours()).toBe(19);
    expect(dayBeforeAt.getMinutes()).toBe(0);
  });

  it('handles month rollover when reminder is on the 1st', () => {
    const { dayBeforeAt, onDayAt } = computeTaskReminderSchedule(new Date(2026, 6, 1, 9, 0));

    expect(onDayAt.getMonth()).toBe(6);
    expect(onDayAt.getDate()).toBe(1);

    expect(dayBeforeAt.getMonth()).toBe(5);
    expect(dayBeforeAt.getDate()).toBe(30);
  });

  it('does not mutate the input Date', () => {
    const input = new Date(2026, 6, 22, 12, 40);
    const inputTime = input.getTime();
    computeTaskReminderSchedule(input);
    expect(input.getTime()).toBe(inputTime);
  });
});

describe('formatDate', () => {
  it('returns a placeholder for an invalid date', () => {
    expect(formatDate('not-a-date')).toBe('ไม่ระบุ');
  });

  it('formats a valid Gregorian date without throwing', () => {
    const result = formatDate(new Date(2026, 1, 4));
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('corrects a legacy Buddhist-year Date before formatting (no double-conversion)', () => {
    const beDate = new Date(2568, 1, 4); // stored as BE by mistake
    const result = formatDate(beDate, { year: 'numeric' });
    // formatDate corrects the year to Gregorian (2025) before formatting via th-TH,
    // which itself renders Buddhist-era year numerals — so the displayed year should
    // land back on 2568, not double-add to 3111.
    expect(result).toContain('2568');
    expect(result).not.toContain('3111');
  });
});

describe('formatTime', () => {
  it('returns a placeholder for an invalid date', () => {
    expect(formatTime('not-a-date')).toBe('--:--');
  });

  it('formats a valid time as HH:MM', () => {
    const result = formatTime(new Date(2026, 1, 4, 14, 30));
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe('formatDateTime', () => {
  it('combines date and time output', () => {
    const result = formatDateTime(new Date(2026, 1, 4, 14, 30));
    expect(result).toContain(' ');
  });
});

describe('calculateDays', () => {
  it('computes the day difference between two dates', () => {
    expect(calculateDays('2024-02-01', '2024-02-05')).toBe(4);
  });

  it('is order-independent (uses absolute difference)', () => {
    expect(calculateDays('2024-02-05', '2024-02-01')).toBe(4);
  });

  it('returns 0 for the same date', () => {
    expect(calculateDays('2024-02-01', '2024-02-01')).toBe(0);
  });
});

describe('truncate', () => {
  it('returns the text unchanged when shorter than maxLength', () => {
    expect(truncate('short', 10)).toBe('short');
  });

  it('truncates and appends the default suffix', () => {
    expect(truncate('This is a long text', 10)).toBe('This is...');
  });

  it('supports a custom suffix', () => {
    expect(truncate('This is a long text', 10, '~')).toBe('This is a~');
  });
});

describe('formatNumber', () => {
  it('adds thousands separators', () => {
    expect(formatNumber(1000000)).toBe((1000000).toLocaleString('th-TH'));
  });
});

describe('isValidEmail', () => {
  it.each([
    ['test@example.com', true],
    ['a.b+c@sub.example.co.th', true],
    ['not-an-email', false],
    ['missing@domain', false],
    ['@missing-local.com', false],
    ['spaces in@email.com', false],
  ])('isValidEmail(%s) -> %s', (input, expected) => {
    expect(isValidEmail(input)).toBe(expected);
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips special characters', () => {
    expect(slugify('Hello, World!!')).toBe('hello-world');
  });

  it('collapses multiple hyphens', () => {
    expect(slugify('Hello   World')).toBe('hello-world');
  });
});

describe('generateUUID', () => {
  it('generates a v4-shaped UUID', () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates distinct values across calls', () => {
    const a = generateUUID();
    const b = generateUUID();
    expect(a).not.toBe(b);
  });
});

describe('isBrowser / isServer', () => {
  it('report server environment under Vitest node environment', () => {
    expect(isServer()).toBe(true);
    expect(isBrowser()).toBe(false);
  });
});

describe('isMilitaryPrefix', () => {
  it('returns false for civilian prefixes', () => {
    for (const prefix of CIVILIAN_PREFIXES) {
      expect(isMilitaryPrefix(prefix)).toBe(false);
    }
  });

  it('returns true for a military/police-style prefix', () => {
    expect(isMilitaryPrefix('ร.ท.')).toBe(true);
    expect(isMilitaryPrefix('พ.อ.')).toBe(true);
  });

  it('returns false for empty/null/undefined', () => {
    expect(isMilitaryPrefix('')).toBe(false);
    expect(isMilitaryPrefix(null)).toBe(false);
    expect(isMilitaryPrefix(undefined)).toBe(false);
    expect(isMilitaryPrefix('   ')).toBe(false);
  });
});

describe('formatSignatureName', () => {
  it('puts civilian prefix inline with the parenthesized name, blank line-prefix', () => {
    expect(formatSignatureName('นาย', 'สมชาย ใจดี')).toEqual({
      linePrefix: '',
      parenName: 'นายสมชาย ใจดี',
    });
  });

  it('keeps military prefix on the signature line, name-only in parens', () => {
    expect(formatSignatureName('ร.ท.', 'สมศักดิ์ ใจดี')).toEqual({
      linePrefix: 'ร.ท.',
      parenName: 'สมศักดิ์ ใจดี',
    });
  });

  it('handles missing prefix/name gracefully', () => {
    expect(formatSignatureName(null, null)).toEqual({ linePrefix: '', parenName: '' });
    expect(formatSignatureName(undefined, 'สมชาย')).toEqual({ linePrefix: '', parenName: 'สมชาย' });
  });
});
