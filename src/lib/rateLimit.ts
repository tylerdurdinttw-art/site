/**
 * Rate-limit со скользящим окном в одну минуту.
 * На первом этапе — in-memory (одна нода). Под кластер заменяется на Redis
 * (INCR + EXPIRE на ключе `rl:{key}:{minuteBucket}`) без изменения сигнатуры.
 */

const WINDOW_MS = 60_000;

interface Bucket {
  hits: number[];
}

const globalForRateLimit = globalThis as unknown as {
  __ynazicottvRateLimit?: Map<string, Bucket>;
};

const buckets: Map<string, Bucket> =
  globalForRateLimit.__ynazicottvRateLimit ?? new Map();
globalForRateLimit.__ynazicottvRateLimit = buckets;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string, limitPerMin: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };

  bucket.hits = bucket.hits.filter((t) => now - t < WINDOW_MS);

  if (bucket.hits.length >= limitPerMin) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0];
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)),
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);

  return {
    allowed: true,
    remaining: limitPerMin - bucket.hits.length,
    retryAfterSec: 0,
  };
}
