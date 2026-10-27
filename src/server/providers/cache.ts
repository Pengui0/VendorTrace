/**
 * Low-Volatility Registry Cache with Documented TTL
 *
 * CACHING POLICY:
 * - Corporate Registry Master Data (CIN / LLPIN / GSTIN profiles): TTL = 24 Hours (86,400,000 ms).
 * - Multi-Candidate Search Queries: TTL = 1 Hour (3,600,000 ms).
 * - STRICT INVARIANT: Authentication failures (401/403), quota/billing failures (402),
 *   rate-limits (429), or 5xx transient errors are NEVER cached.
 */

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
}

export class RegistryCache {
  private store = new Map<string, CacheEntry<any>>();
  private hitCount = 0;
  private missCount = 0;

  // Documented default TTL: 24 hours for canonical company registry profiles
  public static readonly DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
  // Documented search TTL: 1 hour for dynamic search queries
  public static readonly SEARCH_TTL_MS = 60 * 60 * 1000;

  public get<T>(key: string): { data: T; cachedAt: string } | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.missCount++;
      return null;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.store.delete(key);
      this.missCount++;
      return null;
    }

    this.hitCount++;
    return {
      data: entry.data,
      cachedAt: new Date(entry.cachedAt).toISOString(),
    };
  }

  public set<T>(key: string, data: T, ttlMs = RegistryCache.DEFAULT_TTL_MS): void {
    if (!data) return;
    const now = Date.now();
    this.store.set(key, {
      data,
      cachedAt: now,
      expiresAt: now + ttlMs,
    });
  }

  public delete(key: string): boolean {
    return this.store.delete(key);
  }

  public clear(): void {
    this.store.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  public getStats() {
    return {
      size: this.store.size,
      hits: this.hitCount,
      misses: this.missCount,
      defaultTtlHours: 24,
      searchTtlHours: 1,
    };
  }
}

export const registryCache = new RegistryCache();
