import type {
  CostRecord,
  ProviderId,
} from '../../domain/entities/cost-record.ts';
import { ProviderNotConfiguredError } from '../errors.ts';
import type { CachePort } from '../ports/cache.ts';
import type { CostProvider, CostQuery } from '../ports/cost-provider.ts';

export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Fetches cost records through a provider port, serving repeated queries
 * from cache.
 *
 * Complexity: O(n) on cache miss (provider round trip + record mapping),
 * O(1) on cache hit. Cache keys encode provider + date range, so entries
 * can never collide across clouds or periods.
 */
export class GetCosts {
  private readonly providers: ReadonlyMap<ProviderId, CostProvider>;
  private readonly cache: CachePort;
  private readonly ttlMs: number;

  constructor(
    providers: ReadonlyMap<ProviderId, CostProvider>,
    cache: CachePort,
    ttlMs: number = DEFAULT_CACHE_TTL_MS,
  ) {
    this.providers = providers;
    this.cache = cache;
    this.ttlMs = ttlMs;
  }

  async execute(query: CostQuery): Promise<CostRecord[]> {
    const provider = this.providers.get(query.provider);
    if (provider === undefined) {
      throw new ProviderNotConfiguredError(query.provider);
    }

    const key = `costs:${query.provider}:${query.range.toString()}`;
    const cached = this.cache.get(key);
    if (Array.isArray(cached)) {
      return cached as CostRecord[];
    }

    const records = await provider.fetch(query);
    this.cache.set(key, records, this.ttlMs);
    return records;
  }
}
