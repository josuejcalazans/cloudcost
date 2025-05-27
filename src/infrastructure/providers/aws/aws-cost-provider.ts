import {
  GetCostAndUsageCommand,
  type GetCostAndUsageResponse,
} from '@aws-sdk/client-cost-explorer';
import type {
  CostProvider,
  CostQuery,
} from '../../../application/ports/cost-provider.ts';
import {
  type CostRecord,
  createCostRecord,
} from '../../../domain/entities/cost-record.ts';

export interface CostExplorerLike {
  send(command: GetCostAndUsageCommand): Promise<GetCostAndUsageResponse>;
}

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
    const command = new GetCostAndUsageCommand({
      TimePeriod: { Start: query.range.from, End: query.range.to },
      Granularity: 'DAILY',
      Metrics: ['UnblendedCost'],
      GroupBy: [
        { Type: 'DIMENSION', Key: 'SERVICE' },
        { Type: 'DIMENSION', Key: 'REGION' },
      ],
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
        try {
          records.push(
            createCostRecord({
              provider: 'aws',
              date,
              service: keys[0] || 'Other',
              region: keys[1] || 'global',
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
