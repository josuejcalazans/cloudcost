import { describe, expect, it } from 'vitest';
import { InvalidDateRangeError } from '../../src/domain/errors.ts';
import { DateRange } from '../../src/domain/value-objects/date-range.ts';

describe('DateRange', () => {
  it('creates a valid range from ISO dates', () => {
    const range = DateRange.of('2026-10-01', '2026-10-05');
    expect(range.from).toBe('2026-10-01');
    expect(range.to).toBe('2026-10-05');
  });

  it('rejects start date after end date', () => {
    expect(() => DateRange.of('2026-10-05', '2026-10-01')).toThrow(
      InvalidDateRangeError,
    );
  });

  it('rejects start equal to end (empty range)', () => {
    expect(() => DateRange.of('2026-10-01', '2026-10-01')).toThrow(
      InvalidDateRangeError,
    );
  });

  it('rejects non-ISO date strings', () => {
    expect(() => DateRange.of('10/01/2026', '2026-10-05')).toThrow(
      InvalidDateRangeError,
    );
    expect(() => DateRange.of('2026-10-01', 'not-a-date')).toThrow(
      InvalidDateRangeError,
    );
  });

  it('rejects impossible calendar dates', () => {
    expect(() => DateRange.of('2026-02-30', '2026-03-01')).toThrow(
      InvalidDateRangeError,
    );
  });

  it('builds the last N days relative to "now"', () => {
    const range = DateRange.lastDays(7, new Date('2026-10-09T15:30:00Z'));
    expect(range.from).toBe('2026-10-02');
    expect(range.to).toBe('2026-10-09');
  });

  it('treats bounds as inclusive-start, exclusive-end', () => {
    const range = DateRange.of('2026-10-01', '2026-10-05');
    expect(range.contains('2026-10-01')).toBe(true);
    expect(range.contains('2026-10-04')).toBe(true);
    expect(range.contains('2026-10-05')).toBe(false);
    expect(range.contains('2026-09-30')).toBe(false);
  });

  it('exposes UTC midnight bounds for usage APIs', () => {
    const { start, end } = DateRange.of('2026-10-01', '2026-10-05').utcBounds();
    expect(start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(
      start.getUTCHours() + start.getUTCMinutes() + start.getUTCSeconds(),
    ).toBe(0);
  });

  it('counts the number of days in range', () => {
    expect(DateRange.of('2026-10-01', '2026-10-05').daysCount).toBe(4);
    expect(DateRange.of('2026-10-01', '2026-10-02').daysCount).toBe(1);
  });

  it('formats as from..to', () => {
    expect(DateRange.of('2026-10-01', '2026-10-05').toString()).toBe(
      '2026-10-01..2026-10-05',
    );
  });
});
