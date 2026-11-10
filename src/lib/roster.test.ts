import { describe, it, expect } from 'vitest';
import { overlapDays, computeRosterStats, monthRange, toDateString, fiscalYearRangeStrings } from './roster';
import { createRosterSchema, updateRosterSchema } from './security';

describe('overlapDays', () => {
  it('counts inclusive days fully inside the range', () => {
    expect(overlapDays('2026-11-10', '2026-11-12', '2026-11-01', '2026-11-30')).toBe(3);
    expect(overlapDays('2026-11-10', '2026-11-10', '2026-11-01', '2026-11-30')).toBe(1);
  });

  it('clips jobs that start before / end after the range', () => {
    expect(overlapDays('2026-10-30', '2026-11-02', '2026-11-01', '2026-11-30')).toBe(2);
    expect(overlapDays('2026-11-29', '2026-12-05', '2026-11-01', '2026-11-30')).toBe(2);
  });

  it('returns 0 when there is no overlap', () => {
    expect(overlapDays('2026-12-01', '2026-12-02', '2026-11-01', '2026-11-30')).toBe(0);
    expect(overlapDays('2026-10-01', '2026-10-02', '2026-11-01', '2026-11-30')).toBe(0);
  });
});

describe('computeRosterStats / monthRange', () => {
  it('sums count, days and per-category counts', () => {
    const stats = computeRosterStats(
      [
        { category: 'DUTY', startDate: '2026-11-01', endDate: '2026-11-02' },
        { category: 'DUTY', startDate: '2026-11-05', endDate: '2026-11-05' },
        { category: 'MEETING', startDate: '2026-11-09', endDate: '2026-11-11' },
      ],
      '2026-11-01',
      '2026-11-30'
    );
    expect(stats.count).toBe(3);
    expect(stats.days).toBe(6);
    expect(stats.byCategory).toMatchObject({ DUTY: 2, MEETING: 1, TRAINING: 0 });
  });

  it('monthRange returns first and last day of the month (Bangkok time)', () => {
    expect(monthRange(new Date('2026-02-15T05:00:00Z'))).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange(new Date('2026-02-15T05:00:00Z'), -1)).toEqual({ from: '2026-01-01', to: '2026-01-31' });
    expect(toDateString(new Date('2026-11-08T05:00:00Z'))).toBe('2026-11-08');
  });

  it('uses Asia/Bangkok, not the server timezone, around midnight', () => {
    // 2026-11-30 18:00 UTC = 2026-12-01 01:00 in Bangkok
    expect(toDateString(new Date('2026-11-30T18:00:00Z'))).toBe('2026-12-01');
    expect(monthRange(new Date('2026-11-30T18:00:00Z'))).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('fiscalYearRangeStrings spans 1 Oct - 30 Sep', () => {
    expect(fiscalYearRangeStrings(new Date('2026-11-08T05:00:00Z'))).toEqual({ from: '2026-10-01', to: '2027-09-30' });
    expect(fiscalYearRangeStrings(new Date('2027-01-15T05:00:00Z'))).toEqual({ from: '2026-10-01', to: '2027-09-30' });
  });
});

describe('roster zod schemas', () => {
  const base = {
    title: 'ประชุม',
    category: 'MEETING',
    startDate: '2026-11-10',
    endDate: '2026-11-10',
  };

  it('accepts a valid create payload with times', () => {
    expect(createRosterSchema.safeParse({ ...base, userIds: [1, 2], startTime: '09:00', endTime: '12:30' }).success).toBe(true);
  });

  it('rejects empty title, no people, bad time, bad category and reversed dates', () => {
    expect(createRosterSchema.safeParse({ ...base, userIds: [1], title: '  ' }).success).toBe(false);
    expect(createRosterSchema.safeParse({ ...base, userIds: [] }).success).toBe(false);
    expect(createRosterSchema.safeParse({ ...base, userIds: [1], startTime: '9:00' }).success).toBe(false);
    expect(createRosterSchema.safeParse({ ...base, userIds: [1], category: 'PARTY' }).success).toBe(false);
    expect(createRosterSchema.safeParse({ ...base, userIds: [1], endDate: '2026-11-09' }).success).toBe(false);
  });

  it('update schema allows reassigning userId but not an empty title', () => {
    expect(updateRosterSchema.safeParse({ ...base, userId: 3 }).success).toBe(true);
    expect(updateRosterSchema.safeParse({ ...base, title: '' }).success).toBe(false);
  });
});
