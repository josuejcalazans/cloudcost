import { describe, expect, it } from 'vitest';
import { ProviderNotConfiguredError } from '../../src/application/errors.ts';
import { GetCosts } from '../../src/application/use-cases/get-costs.ts';
import { DateRange } from '../../src/domain/value-objects/date-range.ts';
import { FakeProvider, MemoryCache } from '../helpers/fakes.ts';
import { record } from '../helpers/records.ts';

describe('GetCosts', () => {
  it('fetches records from the configured provider', async () => {
    const provider = new FakeProvider('oci', [record()]);
    const getCosts = new GetCosts(
      new Map([['oci', provider]]),
      new MemoryCache(),
    );

    const records = await getCosts.execute({
      provider: 'oci',
      range: DateRange.of('2026-10-01', '2026-10-05'),
    });

    expect(records).toHaveLength(1);
    expect(provider.calls).toHaveLength(1);
  });

  it('serves repeated queries from cache', async () => {
    const provider = new FakeProvider('oci', [record()]);
    const getCosts = new GetCosts(
      new Map([['oci', provider]]),
      new MemoryCache(),
    );
    const query = {
      provider: 'oci' as const,
      range: DateRange.of('2026-10-01', '2026-10-05'),
    };

    await getCosts.execute(query);
    await getCosts.execute(query);

    expect(provider.calls).toHaveLength(1);
  });

  it('uses a distinct cache entry per provider and range', async () => {
    const oci = new FakeProvider('oci', [record({ provider: 'oci' })]);
    const aws = new FakeProvider('aws', [record({ provider: 'aws' })]);
    const cache = new MemoryCache();
    const getCosts = new GetCosts(
      new Map([
        ['oci', oci],
        ['aws', aws],
      ]),
      cache,
    );

    await getCosts.execute({
      provider: 'oci',
      range: DateRange.of('2026-10-01', '2026-10-05'),
    });
    await getCosts.execute({
      provider: 'aws',
      range: DateRange.of('2026-10-01', '2026-10-05'),
    });
    await getCosts.execute({
      provider: 'oci',
      range: DateRange.of('2026-09-01', '2026-10-01'),
    });

    expect(oci.calls).toHaveLength(2);
    expect(aws.calls).toHaveLength(1);
    expect([...cache.store.keys()]).toEqual([
      'costs:oci:2026-10-01..2026-10-05:DAILY:region+service',
      'costs:aws:2026-10-01..2026-10-05:DAILY:region+service',
      'costs:oci:2026-09-01..2026-10-01:DAILY:region+service',
    ]);
  });

  it('uses a distinct cache entry per granularity and dimensions', async () => {
    const provider = new FakeProvider('oci', [record()]);
    const cache = new MemoryCache();
    const getCosts = new GetCosts(new Map([['oci', provider]]), cache);
    const range = DateRange.of('2026-10-01', '2026-10-05');

    await getCosts.execute({ provider: 'oci', range });
    await getCosts.execute({ provider: 'oci', range, granularity: 'HOURLY' });
    await getCosts.execute({
      provider: 'oci',
      range,
      groupBy: ['service', 'region', 'sku'],
    });

    expect(provider.calls).toHaveLength(3);
    expect([...cache.store.keys()]).toEqual([
      'costs:oci:2026-10-01..2026-10-05:DAILY:region+service',
      'costs:oci:2026-10-01..2026-10-05:HOURLY:region+service',
      'costs:oci:2026-10-01..2026-10-05:DAILY:region+service+sku',
    ]);
  });

  it('caches empty results too', async () => {
    const provider = new FakeProvider('oci', []);
    const getCosts = new GetCosts(
      new Map([['oci', provider]]),
      new MemoryCache(),
    );
    const query = {
      provider: 'oci' as const,
      range: DateRange.of('2026-10-01', '2026-10-05'),
    };

    expect(await getCosts.execute(query)).toEqual([]);
    expect(await getCosts.execute(query)).toEqual([]);
    expect(provider.calls).toHaveLength(1);
  });

  it('rejects providers that are not configured', async () => {
    const getCosts = new GetCosts(new Map(), new MemoryCache());

    await expect(
      getCosts.execute({
        provider: 'aws',
        range: DateRange.of('2026-10-01', '2026-10-05'),
      }),
    ).rejects.toThrow(ProviderNotConfiguredError);
  });

  it('propagates provider failures without caching', async () => {
    const failing = {
      id: 'oci' as const,
      fetch: () => Promise.reject(new Error('quota exceeded')),
    };
    const cache = new MemoryCache();
    const getCosts = new GetCosts(new Map([['oci', failing]]), cache);

    await expect(
      getCosts.execute({
        provider: 'oci',
        range: DateRange.of('2026-10-01', '2026-10-05'),
      }),
    ).rejects.toThrow('quota exceeded');
    expect(cache.store.size).toBe(0);
  });
});
