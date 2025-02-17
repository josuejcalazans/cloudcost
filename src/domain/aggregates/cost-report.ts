import type { CostRecord } from '../entities/cost-record.ts';
import { MixedCurrencyError, UnsupportedGroupKeyError } from '../errors.ts';
import type { DateRange } from '../value-objects/date-range.ts';
import { Money } from '../value-objects/money.ts';

export const GROUP_KEYS = ['service', 'region', 'day', 'provider'] as const;

export type GroupKey = (typeof GROUP_KEYS)[number];

export function isGroupKey(value: string): value is GroupKey {
  return (GROUP_KEYS as readonly string[]).includes(value);
}

export interface ReportGroup {
  key: string;
  amount: number;
  /** Fraction of the total in [0, 1], rounded to 6 decimals. */
  share: number;
}

export interface CostReport {
  range: { from: string; to: string };
  currency: string;
  total: number;
  generatedAt: string;
  groupBy: GroupKey;
  /** Sorted by amount descending, ties broken by key ascending (deterministic). */
  groups: ReportGroup[];
  records: CostRecord[];
}

function keyOf(record: CostRecord, groupBy: GroupKey): string {
  switch (groupBy) {
    case 'service':
      return record.service;
    case 'region':
      return record.region;
    case 'day':
      return record.date;
    case 'provider':
      return record.provider;
  }
}

function detectCurrency(records: CostRecord[]): string {
  const first = records[0];
  if (first === undefined) return 'USD';
  for (const record of records) {
    if (record.currency !== first.currency) {
      throw new MixedCurrencyError(
        `cannot mix ${first.currency} and ${record.currency} in one report`,
      );
    }
  }
  return first.currency;
}

function roundShare(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Aggregates raw cost records into a report.
 *
 * Complexity: O(n) to fold records into a hash map of buckets, plus
 * O(k log k) to sort the k distinct group keys — total O(n + k log k)
 * with O(k) extra memory (records are referenced, not copied).
 */
export function buildReport(
  records: CostRecord[],
  range: DateRange,
  groupBy: GroupKey,
  generatedAt: Date = new Date(),
): CostReport {
  if (!(GROUP_KEYS as readonly string[]).includes(groupBy)) {
    throw new UnsupportedGroupKeyError(
      `unsupported group key: ${String(groupBy)}`,
    );
  }

  const currency = detectCurrency(records);
  const buckets = new Map<string, Money>();
  let total = Money.zero(currency);

  for (const record of records) {
    const amount = Money.fromAmount(record.amount, currency);
    total = total.add(amount);
    const key = keyOf(record, groupBy);
    const bucket = buckets.get(key) ?? Money.zero(currency);
    buckets.set(key, bucket.add(amount));
  }

  const groups: ReportGroup[] = [...buckets.entries()]
    .map(([key, amount]) => ({
      key,
      amount: amount.amount,
      share: total.isZero() ? 0 : roundShare(amount.amount / total.amount),
    }))
    .sort((a, b) => b.amount - a.amount || a.key.localeCompare(b.key));

  return {
    range: { from: range.from, to: range.to },
    currency,
    total: total.amount,
    generatedAt: generatedAt.toISOString(),
    groupBy,
    groups,
    records,
  };
}
