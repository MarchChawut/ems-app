import { describe, it, expect } from 'vitest';
import { allowedModesFor, coerceMode } from './leave-modes';

describe('allowedModesFor', () => {
  it('late arrival is time-based only; ordination has no hourly mode; others allow all', () => {
    expect(allowedModesFor('LATE_ARRIVAL')).toEqual(['hours']);
    expect(allowedModesFor('ORDINATION')).toEqual(['fullday', 'halfday']);
    expect(allowedModesFor('SICK')).toEqual(['fullday', 'halfday', 'hours']);
    expect(allowedModesFor('RUN_AN_ERRAND')).toContain('hours');
  });
});

describe('coerceMode', () => {
  it('keeps an allowed mode and replaces a disallowed one', () => {
    expect(coerceMode('SICK', 'hours')).toBe('hours');
    expect(coerceMode('ORDINATION', 'hours')).toBe('fullday');
    expect(coerceMode('ORDINATION', 'halfday')).toBe('halfday');
    expect(coerceMode('LATE_ARRIVAL', 'fullday')).toBe('hours');
  });
});
