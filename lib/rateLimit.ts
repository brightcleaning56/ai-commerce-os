/**
 * Tiny in-memory rate limiter (slice 73).
 *
 * Public buyer-facing endpoints (e.g. /api/quotes/[id]/freight-preview)
 * have no auth and could be hit indefinitely by a bored buyer or a
 * scraper, which would burn Shippo quota / spam the rate-card with
 * pointless writes (slice 66 stamps a freightPreview on every call).
 *
 * This module provides a fixed-window counter keyed by an arbitrary
 * string. Single-process; not durable across redeploys; not shared
 * across edge replicas. That's fine for the soft "stop a bored buyer"
 * threat model. A real per-IP limit at scale needs Redis / Upstash.
 *
 * Usage:
 *   const r = checkRateLimit(`freight-preview:${quoteId}`, { limit: 20, windowMs: 60_000 });
 *   if (!r.allowed) return new Response("Too many requests", { status: 429, headers: { "Retry-After": String(r.retryAfterSec) } });
 *
 * Node-only.
 */

type Counter = {
  count: number;
  resetAt: number; // ms epoch
};

// Module-level map — survives across requests within a single process.
// Cleared on cold start, which is fine: limits don't need to survive
// a restart, and the worst case is the bored buyer gets one extra
// burst per cold-start.
const counters = new Map<string, Counter>();

// Cap the map size so a unique-key flood can't OOM us. When we cross
// the threshold, sweep anything already past its window. Cheap +
// good enough for the threat model.
const MAX_KEYS = 10_000;

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number; // requests left in the current window (>=0)
  resetAt: number;   // ms epoch when the window resets
  retryAfterSec: number; // seconds until reset (0 when allowed)
};

export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  let counter = counters.get(key);

  // Reset expired windows
  if (!counter || counter.resetAt <= now) {
    counter = { count: 0, resetAt: now + opts.windowMs };
    counters.set(key, counter);
    // Opportunistic sweep -- avoids a per-request scan but keeps the
    // map bounded. Triggers only when we cross the cap.
    if (counters.size > MAX_KEYS) {
      for (const [k, c] of counters.entries()) {
        if (c.resetAt <= now) counters.delete(k);
      }
    }
  }

  counter.count += 1;

  const allowed = counter.count <= opts.limit;
  const remaining = Math.max(0, opts.limit - counter.count);
  const retryAfterSec = allowed ? 0 : Math.ceil((counter.resetAt - now) / 1000);

  return {
    allowed,
    limit: opts.limit,
    remaining,
    resetAt: counter.resetAt,
    retryAfterSec,
  };
}

/** Convenience: build the standard rate-limit response headers. */
export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(r.remaining),
    "X-RateLimit-Reset": String(Math.floor(r.resetAt / 1000)),
    ...(r.allowed ? {} : { "Retry-After": String(r.retryAfterSec) }),
  };
}
