import {
  type CostDimension,
  type CostGranularity,
  type CostProvider,
  type CostQuery,
  DEFAULT_COST_DIMENSIONS,
} from '../../../application/ports/cost-provider.ts';
import {
  type CostRecord,
  createCostRecord,
} from '../../../domain/entities/cost-record.ts';

export interface OciUsageItem {
  timeUsageStarted?: string | Date | null;
  service?: string | null;
  region?: string | null;
  skuName?: string | null;
  computedAmount?: number | string | null;
  currency?: string | null;
  resourceId?: string | null;
}

export interface UsageApiClientLike {
  requestSummarizedUsages(args: {
    requestSummarizedUsagesDetails: Record<string, unknown>;
  }): Promise<{ usageAggregation?: { items?: OciUsageItem[] } }>;
}

/** Maps provider-neutral dimensions to OCI Usage API `groupBy` values. */
const OCI_DIMENSIONS: Readonly<Record<CostDimension, string>> = {
  service: 'service',
  region: 'region',
  sku: 'skuName',
};

function toIsoDate(
  value: string | Date | null | undefined,
): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * OCI Usage API adapter (the same data source as the console's Cost
 * Analysis). Rows that cannot be mapped are dropped instead of failing
 * the whole report.
 *
 * Complexity: O(n) for n usage items in a single API round trip.
 */
export class OciCostProvider implements CostProvider {
  readonly id = 'oci' as const;

  private readonly client: UsageApiClientLike;
  private readonly tenantId: string;

  constructor(client: UsageApiClientLike, tenantId: string) {
    this.client = client;
    this.tenantId = tenantId;
  }

  async fetch(query: CostQuery): Promise<CostRecord[]> {
    const { start, end } = query.range.utcBounds();
    const granularity: CostGranularity = query.granularity ?? 'DAILY';
    const dimensions =
      query.groupBy ?? (DEFAULT_COST_DIMENSIONS as readonly CostDimension[]);

    const response = await this.client.requestSummarizedUsages({
      requestSummarizedUsagesDetails: {
        tenantId: this.tenantId,
        granularity,
        queryType: 'COST',
        groupBy: dimensions.map((dimension) => OCI_DIMENSIONS[dimension]),
        timeUsageStarted: start,
        timeUsageEnded: end,
      },
    });

    const items = response.usageAggregation?.items ?? [];
    const records: CostRecord[] = [];
    for (const item of items) {
      const date = toIsoDate(item.timeUsageStarted);
      const amount = Number(item.computedAmount ?? Number.NaN);
      if (date === undefined || !Number.isFinite(amount)) {
        continue;
      }
      try {
        records.push(
          createCostRecord({
            provider: 'oci',
            date,
            service: item.service || 'Other',
            region: item.region || 'global',
            amount,
            currency: item.currency || 'USD',
            sku: item.skuName || undefined,
            resourceId: item.resourceId || undefined,
          }),
        );
      } catch {}
    }
    return records;
  }
}
