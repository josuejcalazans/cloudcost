import {
  GetCostAndUsageCommand,
  type GetCostAndUsageResponse,
} from '@aws-sdk/client-cost-explorer';
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

export interface CostExplorerLike {
  send(command: GetCostAndUsageCommand): Promise<GetCostAndUsageResponse>;
}

/** Maps provider-neutral dimensions to Cost Explorer `GroupBy` keys. */
const AWS_DIMENSIONS: Readonly<Record<CostDimension, string>> = {
  service: 'SERVICE',
  region: 'REGION',
  sku: 'USAGE_TYPE',
};

/**
 * AWS Cost Explorer adapter (GetCostAndUsage). Rows that cannot be
 * mapped are dropped instead of failing the whole report.
 *
 * Complexity: O(n) for n group entries; the API returns every day of
 * the range in one paginated response (handled by the SDK).
 */
export class AwsCostProvider implements CostProvider {
  readonly id = 'aws' as const;

  private readonly client: CostExplorerLike;

  constructor(client: CostExplorerLike) {
    this.client = client;
  }

  async fetch(query: CostQuery): Promise<CostRecord[]> {
    const granularity: CostGranularity = query.granularity ?? 'DAILY';
    const dimensions =
      query.groupBy ?? (DEFAULT_COST_DIMENSIONS as readonly CostDimension[]);

    const command = new GetCostAndUsageCommand({
      TimePeriod: { Start: query.range.from, End: query.range.to },
      Granularity: granularity,
      Metrics: ['UnblendedCost'],
      GroupBy: dimensions.map((dimension) => ({
        Type: 'DIMENSION' as const,
        Key: AWS_DIMENSIONS[dimension],
      })),
    });

    const response = await this.client.send(command);
    const records: CostRecord[] = [];

    for (const result of response.ResultsByTime ?? []) {
      const date = result.TimePeriod?.Start;
      if (date === undefined) {
        continue;
      }
      for (const group of result.Groups ?? []) {
        const keys = group.Keys ?? [];
        const metric = group.Metrics?.UnblendedCost;
        const amount = Number(metric?.Amount ?? Number.NaN);
        if (!Number.isFinite(amount)) {
          continue;
        }
        // `keys` is ordered exactly as `dimensions`, so read them by index.
        const byDimension = new Map(
          dimensions.map((dimension, index) => [dimension, keys[index]]),
        );
        try {
          records.push(
            createCostRecord({
              provider: 'aws',
              date,
              service: byDimension.get('service') || 'Other',
              region: byDimension.get('region') || 'global',
              sku: byDimension.get('sku') || undefined,
              amount,
              currency: metric?.Unit || 'USD',
            }),
          );
        } catch {}
      }
    }
    return records;
  }
}
