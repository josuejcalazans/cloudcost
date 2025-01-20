import type { CostRecord } from '../../src/domain/entities/cost-record.ts';

export const record = (overrides: Partial<CostRecord> = {}): CostRecord => ({
  provider: 'oci',
  date: '2026-10-01',
  service: 'Object Storage',
  region: 'us-ashburn-1',
  amount: 1.23,
  currency: 'USD',
  ...overrides,
});
