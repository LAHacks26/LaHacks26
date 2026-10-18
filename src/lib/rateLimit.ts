// In-memory sliding-window rate limiter. Pure, with no "server-only", so tests can import it.
// State lives in one process, which is fine for the single Vultr VM (PRD §10 step 6).

export type RateLimitResult = { ok: boolean; retryAfterSec: number };

export type RateLimiter = {
  /** Records a hit for `key` when it is allowed. A rejected hit is not recorded. */
  check(key: string): RateLimitResult;
  /** Number of keys still tracked. Used by tests to confirm old keys are pruned. */
  size(): number;
};

/** Allows at most `limit` hits per `key` in any `windowMs` span. */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }): RateLimiter {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be a whole number of at least 1");
  if (!(windowMs > 0)) throw new RangeError("windowMs must be positive");

  const hits = new Map<string, number[]>();
  let lastSweep = Date.now();

  // Drops timestamps that left the window, and keys with none left. Runs at most once per window.
  function sweep(now: number): void {
    for (const [key, stamps] of hits) {
      const live = stamps.filter((t) => now - t < windowMs);
      if (live.length === 0) hits.delete(key);
      else hits.set(key, live);
    }
    lastSweep = now;
  }

  return {
    check(key) {
      const now = Date.now();
      if (now - lastSweep >= windowMs) sweep(now);

      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        const retryAt = recent[0] + windowMs;
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((retryAt - now) / 1000)) };
      }

      recent.push(now);
      hits.set(key, recent);
      return { ok: true, retryAfterSec: 0 };
    },
    size: () => hits.size,
  };
}

/** Shared budget for AI routes: 60 requests per 10 minutes per client. */
// Cached on globalThis so every route bundle (and dev hot reloads) share one budget.
const globalForLimiter = globalThis as unknown as {
  __saffronAiRateLimiter?: ReturnType<typeof createRateLimiter>;
};
export const aiRateLimiter = (globalForLimiter.__saffronAiRateLimiter ??= createRateLimiter({
  limit: 60,
  windowMs: 10 * 60 * 1000,
}));
