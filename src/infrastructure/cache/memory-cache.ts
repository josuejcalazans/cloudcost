import type { CachePort } from '../../application/ports/cache.ts';

interface Entry {
  value: unknown;
  expiresAt: number;
}

/**
 * In-process TTL cache backed by a hash map.
 *
 * Complexity: O(1) average for get/set; expired entries are evicted
 * lazily on read to keep writes allocation-free.
 */
export class MemoryCache implements CachePort {
  private readonly store = new Map<string, Entry>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  get(key: string): unknown {
    const entry = this.store.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: this.now() + ttlMs });
  }
}
