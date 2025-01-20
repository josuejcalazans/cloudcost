import { describe, expect, it } from 'vitest';
import { createCostRecord } from '../../src/domain/entities/cost-record.ts';
import { InvalidCostRecordError } from '../../src/domain/errors.ts';

describe('createCostRecord', () => {
  it('creates a valid record with defaults', () => {
    const c = createCostRecord({
      provider: 'oci',
      date: '2026-10-01',
      service: 'Compute',
      amount: 1.5,
    });
    expect(c.region).toBe('global');
    expect(c.currency).toBe('USD');
    expect(c.provider).toBe('oci');
  });

  it('rejects unknown providers', () => {
    expect(() =>
      createCostRecord({
        provider: 'gcp' as never,
        date: '2026-10-01',
        service: 'Compute',
        amount: 1,
      }),
    ).toThrow(InvalidCostRecordError);
  });

  it('rejects malformed dates', () => {
    expect(() =>
      createCostRecord({
        provider: 'aws',
        date: '2026-13-45',
        service: 'Compute',
        amount: 1,
      }),
    ).toThrow(InvalidCostRecordError);
  });

  it('rejects non-finite amounts', () => {
    expect(() =>
      createCostRecord({
        provider: 'aws',
        date: '2026-10-01',
        service: 'Compute',
        amount: Number.NaN,
      }),
    ).toThrow(InvalidCostRecordError);
  });

  it('rejects empty service names', () => {
    expect(() =>
      createCostRecord({
        provider: 'aws',
        date: '2026-10-01',
        service: '   ',
        amount: 1,
      }),
    ).toThrow(InvalidCostRecordError);
  });
});
