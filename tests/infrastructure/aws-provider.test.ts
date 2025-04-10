import { describe, expect, it } from 'vitest';
import { DateRange } from '../../src/domain/value-objects/date-range.ts';
import { AwsCostProvider } from '../../src/infrastructure/providers/aws/aws-cost-provider.ts';

interface FakeState {
  command: unknown;
}

function fakeClient(response: unknown): {
  client: { send: (command: unknown) => Promise<unknown> };
  state: FakeState;
} {
  const state: FakeState = { command: null };
  return {
    state,
    client: {
      send: (command: unknown) => {
        state.command = command;
        return Promise.resolve(response);
      },
    },
  };
}

const range = DateRange.of('2026-10-01', '2026-10-05');

describe('AwsCostProvider', () => {
  it('maps Cost Explorer groups to cost records', async () => {
    const { client } = fakeClient({
      ResultsByTime: [
        {
          TimePeriod: { Start: '2026-10-02', End: '2026-10-03' },
          Groups: [
            {
              Keys: ['Amazon Simple Storage Service', 'us-east-1'],
              Metrics: { UnblendedCost: { Amount: '3.14', Unit: 'USD' } },
            },
          ],
        },
      ],
    });
    const provider = new AwsCostProvider(client);

    const records = await provider.fetch({ provider: 'aws', range });

    expect(records).toEqual([
      {
        provider: 'aws',
        date: '2026-10-02',
        service: 'Amazon Simple Storage Service',
        region: 'us-east-1',
        amount: 3.14,
        currency: 'USD',
      },
    ]);
  });

  it('requests daily unblended cost grouped by service and region', async () => {
    const { client, state } = fakeClient({ ResultsByTime: [] });
    const provider = new AwsCostProvider(client);

    await provider.fetch({ provider: 'aws', range });

    const input = (state.command as { input: Record<string, unknown> }).input;
    expect(input.TimePeriod).toEqual({
      Start: '2026-10-01',
      End: '2026-10-05',
    });
    expect(input.Granularity).toBe('DAILY');
    expect(input.Metrics).toEqual(['UnblendedCost']);
    expect(input.GroupBy).toEqual([
      { Type: 'DIMENSION', Key: 'SERVICE' },
      { Type: 'DIMENSION', Key: 'REGION' },
    ]);
  });

  it('returns an empty list when there are no results', async () => {
    const { client } = fakeClient({});
    const provider = new AwsCostProvider(client);

    expect(await provider.fetch({ provider: 'aws', range })).toEqual([]);
  });

  it('falls back to Other/global for missing dimensions', async () => {
    const { client } = fakeClient({
      ResultsByTime: [
        {
          TimePeriod: { Start: '2026-10-01', End: '2026-10-02' },
          Groups: [
            {
              Keys: ['AWSLambda'],
              Metrics: { UnblendedCost: { Amount: '1.00', Unit: 'USD' } },
            },
          ],
        },
      ],
    });
    const provider = new AwsCostProvider(client);

    const [record] = await provider.fetch({ provider: 'aws', range });

    expect(record?.service).toBe('AWSLambda');
    expect(record?.region).toBe('global');
  });

  it('drops rows with unparseable amounts', async () => {
    const { client } = fakeClient({
      ResultsByTime: [
        {
          TimePeriod: { Start: '2026-10-01', End: '2026-10-02' },
          Groups: [
            {
              Keys: ['Broken', 'us-east-1'],
              Metrics: { UnblendedCost: { Amount: 'NaN-ish', Unit: 'USD' } },
            },
            {
              Keys: ['Fine', 'us-east-1'],
              Metrics: { UnblendedCost: { Amount: '0.42', Unit: 'USD' } },
            },
          ],
        },
      ],
    });
    const provider = new AwsCostProvider(client);

    const records = await provider.fetch({ provider: 'aws', range });

    expect(records).toHaveLength(1);
    expect(records[0]?.service).toBe('Fine');
  });
});
