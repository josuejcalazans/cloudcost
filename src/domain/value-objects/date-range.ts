import { InvalidDateRangeError } from '../errors.ts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function normalizeIsoDate(value: string): string {
  if (!ISO_DATE.test(value)) {
    throw new InvalidDateRangeError(
      `"${value}" is not an ISO date (expected YYYY-MM-DD)`,
    );
  }
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  const roundTrip = new Date(ms).toISOString().slice(0, 10);
  if (Number.isNaN(ms) || roundTrip !== value) {
    throw new InvalidDateRangeError(`"${value}" is not a real calendar date`);
  }
  return value;
}

/**
 * Half-open date interval [from, to) as ISO calendar dates.
 *
 * Complexity: O(1) for every operation (string comparison is O(10) for
 * fixed-length ISO dates).
 */
export class DateRange {
  readonly from: string;
  readonly to: string;

  private constructor(from: string, to: string) {
    this.from = from;
    this.to = to;
  }

  static of(from: string, to: string): DateRange {
    const start = normalizeIsoDate(from);
    const end = normalizeIsoDate(to);
    if (start >= end) {
      throw new InvalidDateRangeError(
        `range must start before it ends (got ${start} >= ${end})`,
      );
    }
    return new DateRange(start, end);
  }

  static lastDays(days: number, now: Date = new Date()): DateRange {
    if (!Number.isInteger(days) || days < 1) {
      throw new InvalidDateRangeError(
        `days must be a positive integer, received ${String(days)}`,
      );
    }
    const to = now.toISOString().slice(0, 10);
    const from = new Date(Date.parse(`${to}T00:00:00.000Z`) - days * DAY_MS)
      .toISOString()
      .slice(0, 10);
    return new DateRange(from, to);
  }

  get daysCount(): number {
    return (
      (Date.parse(`${this.to}T00:00:00.000Z`) -
        Date.parse(`${this.from}T00:00:00.000Z`)) /
      DAY_MS
    );
  }

  contains(date: string): boolean {
    return date >= this.from && date < this.to;
  }

  /** UTC midnight boundaries — usage APIs reject non-midnight timestamps. */
  utcBounds(): { start: Date; end: Date } {
    return {
      start: new Date(Date.parse(`${this.from}T00:00:00.000Z`)),
      end: new Date(Date.parse(`${this.to}T00:00:00.000Z`)),
    };
  }

  toString(): string {
    return `${this.from}..${this.to}`;
  }
}
