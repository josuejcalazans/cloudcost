import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryCache } from '../../src/infrastructure/cache/memory-cache.ts';

describe('MemoryCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips values before the TTL expires', () => {
    const cache = new MemoryCache();
    cache.set('a', [1, 2, 3], 60_000);

    expect(cache.get('a')).toEqual([1, 2, 3]);
  });

  it('expires entries once the TTL elapses', () => {
    const cache = new MemoryCache();
    cache.set('a', 'value', 60_000);

    vi.advanceTimersByTime(59_999);
    expect(cache.get('a')).toBe('value');

    vi.advanceTimersByTime(1);
    expect(cache.get('a')).toBeUndefined();
  });

  it('overwrites values and resets the TTL', () => {
    const cache = new MemoryCache();
    cache.set('a', 'first', 60_000);
    vi.advanceTimersByTime(50_000);
    cache.set('a', 'second', 60_000);

    vi.advanceTimersByTime(20_000);
    expect(cache.get('a')).toBe('second');
  });

  it('keeps keys isolated', () => {
    const cache = new MemoryCache();
    cache.set('costs:oci:2026-10-01..2026-10-05', 'oci', 60_000);
    cache.set('costs:aws:2026-10-01..2026-10-05', 'aws', 60_000);

    expect(cache.get('costs:oci:2026-10-01..2026-10-05')).toBe('oci');
    expect(cache.get('costs:aws:2026-10-01..2026-10-05')).toBe('aws');
    expect(cache.get('costs:gcp:2026-10-01..2026-10-05')).toBeUndefined();
  });

  it('returns undefined for unknown keys', () => {
    expect(new MemoryCache().get('missing')).toBeUndefined();
  });

  it('treats a zero TTL as immediately expired', () => {
    const cache = new MemoryCache();
    cache.set('a', 'value', 0);

    expect(cache.get('a')).toBeUndefined();
  });
});
