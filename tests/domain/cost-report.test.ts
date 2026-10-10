import { describe, expect, it } from 'vitest';
import { buildReport } from '../../src/domain/aggregates/cost-report.ts';
import {
  MixedCurrencyError,
  UnsupportedGroupKeyError,
} from '../../src/domain/errors.ts';
import { DateRange } from '../../src/domain/value-objects/date-range.ts';
import { record } from '../helpers/records.ts';

const range = DateRange.of('2026-10-01', '2026-10-05');

describe('buildReport', () => {
  it('totals every record in the range', () => {
    const report = buildReport(
      [record({ amount: 3 }), record({ amount: 1.5 })],
      range,
      'service',
    );
    expect(report.total).toBe(4.5);
    expect(report.range).toEqual({ from: '2026-10-01', to: '2026-10-05' });
    expect(report.currency).toBe('USD');
    expect(report.records).toHaveLength(2);
  });

  it('groups by service, sorted descending by amount, with shares', () => {
    const report = buildReport(
      [
        record({ service: 'Object Storage', amount: 3 }),
        record({ service: 'Compute', amount: 1 }),
        record({ service: 'Object Storage', amount: 1 }),
      ],
      range,
      'service',
    );
    expect(report.groups).toEqual([
      { key: 'Object Storage', amount: 4, share: 0.8 },
      { key: 'Compute', amount: 1, share: 0.2 },
    ]);
  });

  it('groups by day', () => {
    const report = buildReport(
      [
        record({ date: '2026-10-01', amount: 2 }),
        record({ date: '2026-10-02', amount: 1 }),
        record({ date: '2026-10-01', amount: 1 }),
      ],
      range,
      'day',
    );
    expect(report.groups).toEqual([
      { key: '2026-10-01', amount: 3, share: 0.75 },
      { key: '2026-10-02', amount: 1, share: 0.25 },
    ]);
  });

  it('groups by provider', () => {
    const report = buildReport(
      [
        record({ provider: 'oci', amount: 2 }),
        record({ provider: 'aws', amount: 3 }),
      ],
      range,
      'provider',
    );
    expect(report.groups.map((g) => g.key)).toEqual(['aws', 'oci']);
  });

  it('groups by region and falls back to "global"', () => {
    const report = buildReport(
      [
        record({ region: 'us-ashburn-1', amount: 1 }),
        record({ region: 'us-ashburn-1', amount: 2 }),
        record({ region: 'global', amount: 1 }),
      ],
      range,
      'region',
    );
    expect(report.groups).toEqual([
      { key: 'us-ashburn-1', amount: 3, share: 0.75 },
      { key: 'global', amount: 1, share: 0.25 },
    ]);
  });

  it('breaks ties deterministically by key ascending', () => {
    const report = buildReport(
      [
        record({ service: 'B', amount: 1 }),
        record({ service: 'A', amount: 1 }),
      ],
      range,
      'service',
    );
    expect(report.groups.map((g) => g.key)).toEqual(['A', 'B']);
  });

  it('rejects unsupported group keys', () => {
    expect(() => buildReport([record()], range, 'billing' as never)).toThrow(
      UnsupportedGroupKeyError,
    );
  });

  it('groups by sku, falling back to Other when absent', () => {
    const report = buildReport(
      [
        record({ amount: 2, sku: 'Object Storage - Storage' }),
        record({ amount: 3, sku: 'Object Storage - Requests' }),
        record({ amount: 5 }),
      ],
      range,
      'sku',
    );

    expect(report.groups).toEqual([
      { key: 'Other', amount: 5, share: 0.5 },
      { key: 'Object Storage - Requests', amount: 3, share: 0.3 },
      { key: 'Object Storage - Storage', amount: 2, share: 0.2 },
    ]);
  });

  it('rejects mixed currencies', () => {
    expect(() =>
      buildReport(
        [record({ currency: 'USD' }), record({ currency: 'EUR' })],
        range,
        'service',
      ),
    ).toThrow(MixedCurrencyError);
  });

  it('returns an empty report for no records', () => {
    const report = buildReport([], range, 'service');
    expect(report.total).toBe(0);
    expect(report.groups).toEqual([]);
    expect(report.records).toEqual([]);
  });

  it('never divides by zero when total is 0', () => {
    const report = buildReport([record({ amount: 0 })], range, 'service');
    expect(report.total).toBe(0);
    expect(report.groups[0]?.share).toBe(0);
  });

  it('sums float amounts without drift', () => {
    const report = buildReport(
      [record({ amount: 0.1 }), record({ amount: 0.2 })],
      range,
      'service',
    );
    expect(report.total).toBe(0.3);
  });
});
