import type {
  CostRecord,
  ProviderId,
} from '../../domain/entities/cost-record.ts';
import type { DateRange } from '../../domain/value-objects/date-range.ts';

export const COST_GRANULARITIES = ['DAILY', 'HOURLY', 'MONTHLY'] as const;
export type CostGranularity = (typeof COST_GRANULARITIES)[number];

export function isCostGranularity(value: string): value is CostGranularity {
  return (COST_GRANULARITIES as readonly string[]).includes(value);
}

/**
 * Provider-neutral billable dimensions. Each adapter maps these to its
 * native grouping key (OCI `groupBy`, Cost Explorer `GroupBy`).
 */
export const COST_DIMENSIONS = ['service', 'region', 'sku'] as const;
export type CostDimension = (typeof COST_DIMENSIONS)[number];

export function isCostDimension(value: string): value is CostDimension {
  return (COST_DIMENSIONS as readonly string[]).includes(value);
}

export interface CostQuery {
  provider: ProviderId;
  range: DateRange;
  /** Roll-up window passed to the provider API. Defaults to DAILY. */
  granularity?: CostGranularity;
  /** Dimensions to group by at the provider. Defaults to service + region. */
  groupBy?: readonly CostDimension[];
}

export const DEFAULT_COST_DIMENSIONS: readonly CostDimension[] = [
  'service',
  'region',
];

/**
 * Port implemented by cloud adapters (OCI, AWS, ...). Adapters receive the
 * full query and are responsible for mapping native API rows to CostRecords.
 */
export interface CostProvider {
  readonly id: ProviderId;
  fetch(query: CostQuery): Promise<CostRecord[]>;
}
