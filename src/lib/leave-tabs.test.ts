import { describe, it, expect } from 'vitest';
import { resolveLeaveTab, parseLeaveTab } from './leave-tabs';

describe('resolveLeaveTab', () => {
  it('LATE_ARRIVAL type always wins, even if formCategory is set', () => {
    expect(resolveLeaveTab({ type: 'LATE_ARRIVAL', formCategory: 'KBK', hours: 2 })).toBe('LATE_ARRIVAL');
    expect(resolveLeaveTab({ type: 'LATE_ARRIVAL', formCategory: 'STATS', hours: 2 })).toBe('LATE_ARRIVAL');
    expect(resolveLeaveTab({ type: 'LATE_ARRIVAL', formCategory: null, hours: null })).toBe('LATE_ARRIVAL');
  });

  it('EARLY_LEAVE type always wins too, even if formCategory is set', () => {
    expect(resolveLeaveTab({ type: 'EARLY_LEAVE', formCategory: 'KBK', hours: 2 })).toBe('EARLY_LEAVE');
    expect(resolveLeaveTab({ type: 'EARLY_LEAVE', formCategory: 'STATS', hours: 2 })).toBe('EARLY_LEAVE');
    expect(resolveLeaveTab({ type: 'EARLY_LEAVE', formCategory: null, hours: null })).toBe('EARLY_LEAVE');
  });

  it('uses formCategory when explicitly set on a non-dedicated-tab leave', () => {
    expect(resolveLeaveTab({ type: 'SICK', formCategory: 'KBK', hours: 2 })).toBe('KBK');
    expect(resolveLeaveTab({ type: 'SICK', formCategory: 'STATS', hours: null })).toBe('STATS');
  });

  it('falls back to hours when formCategory is null: hourly -> STATS', () => {
    expect(resolveLeaveTab({ type: 'SICK', formCategory: null, hours: 2 })).toBe('STATS');
    expect(resolveLeaveTab({ type: 'RUN_AN_ERRAND', formCategory: null, hours: 0.5 })).toBe('STATS');
  });

  it('falls back to hours when formCategory is null: half-day/full-day -> KBK', () => {
    expect(resolveLeaveTab({ type: 'SICK', formCategory: null, hours: null })).toBe('KBK');
    expect(resolveLeaveTab({ type: 'SICK', formCategory: null, hours: 0 })).toBe('KBK');
  });

  it('only LATE_ARRIVAL and EARLY_LEAVE have dedicated tabs - RUN_AN_ERRAND still classifies as KBK/STATS', () => {
    expect(resolveLeaveTab({ type: 'RUN_AN_ERRAND', formCategory: null, hours: 2 })).toBe('STATS');
    expect(resolveLeaveTab({ type: 'RUN_AN_ERRAND', formCategory: 'KBK', hours: null })).toBe('KBK');
  });
});

describe('parseLeaveTab', () => {
  it('accepts valid tab values', () => {
    expect(parseLeaveTab('KBK')).toBe('KBK');
    expect(parseLeaveTab('STATS')).toBe('STATS');
    expect(parseLeaveTab('LATE_ARRIVAL')).toBe('LATE_ARRIVAL');
    expect(parseLeaveTab('EARLY_LEAVE')).toBe('EARLY_LEAVE');
  });

  it('rejects invalid or missing values', () => {
    expect(parseLeaveTab(null)).toBeNull();
    expect(parseLeaveTab('')).toBeNull();
    expect(parseLeaveTab('kbk')).toBeNull();
    expect(parseLeaveTab('OTHER')).toBeNull();
  });
});
