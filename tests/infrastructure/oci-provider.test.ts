import { describe, expect, it } from 'vitest';
import { DateRange } from '../../src/domain/value-objects/date-range.ts';
import { OciCostProvider } from '../../src/infrastructure/providers/oci/oci-cost-provider.ts';

interface FakeState {
  args: unknown;
}

function fakeClient(response: unknown): {
  client: { requestSummarizedUsages: (args: unknown) => Promise<unknown> };
  state: FakeState;
} {
  const state: FakeState = { args: null };
  return {
    state,
    client: {
      requestSummarizedUsages: (args: unknown) => {
        state.args = args;
        return Promise.resolve(response);
      },
    },
  };
}

const range = DateRange.of('2026-10-01', '2026-10-05');

describe('OciCostProvider', () => {
  it('maps usage items to cost records', async () => {
    const { client } = fakeClient({
      usageAggregation: {
        items: [
          {
            timeUsageStarted: '2026-10-02T00:00:00.000Z',
            service: 'Object Storage',
            region: 'us-ashburn-1',
            computedAmount: 12.5,
            currency: 'USD',
            resourceId: 'ocid1.bucket.oc1..abc',
          },
        ],
      },
    });
    const provider = new OciCostProvider(client, 'ocid1.tenancy.oc1..tenant');

    const records = await provider.fetch({ provider: 'oci', range });

    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      provider: 'oci',
      date: '2026-10-02',
      service: 'Object Storage',
      region: 'us-ashburn-1',
      amount: 12.5,
      currency: 'USD',
      resourceId: 'ocid1.bucket.oc1..abc',
    });
  });

  it('sends a DAILY COST query with UTC midnight bounds', async () => {
    const { client, state } = fakeClient({ usageAggregation: { items: [] } });
    const provider = new OciCostProvider(client, 'ocid1.tenancy.oc1..tenant');

    await provider.fetch({ provider: 'oci', range });

    const details = (
      state.args as { requestSummarizedUsagesDetails: Record<string, unknown> }
    ).requestSummarizedUsagesDetails;
    expect(details.tenantId).toBe('ocid1.tenancy.oc1..tenant');
    expect(details.granularity).toBe('DAILY');
    expect(details.queryType).toBe('COST');
    expect(details.groupBy).toEqual(['service', 'region']);
    expect((details.timeUsageStarted as Date).toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    );
    expect((details.timeUsageEnded as Date).toISOString()).toBe(
      '2026-10-05T00:00:00.000Z',
    );
  });

  it('returns an empty list when the tenancy has no usage', async () => {
    const { client } = fakeClient({});
    const provider = new OciCostProvider(client, 'ocid1.tenancy.oc1..tenant');

    expect(await provider.fetch({ provider: 'oci', range })).toEqual([]);
  });

  it('falls back to Other/global for missing dimensions', async () => {
    const { client } = fakeClient({
      usageAggregation: {
        items: [
          {
            timeUsageStarted: '2026-10-01T00:00:00.000Z',
            computedAmount: 1,
          },
        ],
      },
    });
    const provider = new OciCostProvider(client, 'ocid1.tenancy.oc1..tenant');

    const [record] = await provider.fetch({ provider: 'oci', range });

    expect(record?.service).toBe('Other');
    expect(record?.region).toBe('global');
  });

  it('drops malformed rows instead of failing the whole report', async () => {
    const { client } = fakeClient({
      usageAggregation: {
        items: [
          {
            timeUsageStarted: '2026-10-01T00:00:00.000Z',
            service: 'Compute',
            computedAmount: 'not-a-number',
          },
          {
            service: 'Compute',
            computedAmount: 5,
          },
          {
            timeUsageStarted: '2026-10-01T00:00:00.000Z',
            service: 'Logging',
            computedAmount: 0.5,
          },
        ],
      },
    });
    const provider = new OciCostProvider(client, 'ocid1.tenancy.oc1..tenant');

    const records = await provider.fetch({ provider: 'oci', range });

    expect(records).toHaveLength(1);
    expect(records[0]?.service).toBe('Logging');
  });
});
