/**
 * Minimal TTL cache port. Implementations must be safe for concurrent
 * access within a single process (O(1) get/set).
 */
export interface CachePort {
  get(key: string): unknown;
  set(key: string, value: unknown, ttlMs: number): void;
}
