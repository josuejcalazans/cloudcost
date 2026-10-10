import { InvalidCostRecordError } from '../errors.ts';

export const PROVIDER_IDS = ['oci', 'aws'] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

export interface CostRecord {
  provider: ProviderId;
  /** UTC usage day, YYYY-MM-DD. */
  date: string;
  service: string;
  region: string;
  /** Amount in major units (e.g. 1.23 USD). */
  amount: number;
  currency: string;
  /**
   * Billable line item within a service (OCI `skuName`, AWS usage type).
   * Present only when the provider was asked to group by SKU.
   */
  sku?: string;
  resourceId?: string;
}

export interface CostRecordInput {
  provider: ProviderId;
  date: string;
  service: string;
  amount: number;
  region?: string;
  currency?: string;
  sku?: string;
  resourceId?: string;
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

export function createCostRecord(input: CostRecordInput): CostRecord {
  if (!(PROVIDER_IDS as readonly string[]).includes(input.provider)) {
    throw new InvalidCostRecordError(
      `unknown provider: ${String(input.provider)}`,
    );
  }
  if (!isValidIsoDate(input.date)) {
    throw new InvalidCostRecordError(`invalid usage date: ${input.date}`);
  }
  if (!Number.isFinite(input.amount)) {
    throw new InvalidCostRecordError(
      `amount must be a finite number, received ${String(input.amount)}`,
    );
  }
  if (typeof input.service !== 'string' || input.service.trim() === '') {
    throw new InvalidCostRecordError('service must be a non-empty string');
  }

  const record: CostRecord = {
    provider: input.provider,
    date: input.date,
    service: input.service.trim(),
    region: input.region?.trim() || 'global',
    amount: input.amount,
    currency: input.currency?.trim().toUpperCase() || 'USD',
  };
  if (input.sku !== undefined && input.sku !== '') {
    record.sku = input.sku.trim();
  }
  if (input.resourceId !== undefined && input.resourceId !== '') {
    record.resourceId = input.resourceId;
  }
  return record;
}
