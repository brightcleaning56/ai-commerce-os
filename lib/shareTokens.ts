/**
 * 24-char hex token (96 bits of entropy).
 * Long enough that brute-forcing the URL-space is infeasible at any reasonable scale.
 */
export function genShareToken(): string {
  return Array.from({ length: 24 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
}

/**
 * Compute a per-link expiry timestamp. ttlHours <= 0 means "never expires" — we
 * encode that as a far-future ISO so downstream "now > expiresAt" checks behave
 * uniformly. Older runs may have undefined expiry, which is treated as never-expires.
 */
export function expiryFromTtlHours(ttlHours: number | undefined): string {
  const safe = typeof ttlHours === "number" ? ttlHours : 168; // default 7d
  const ms =
    safe > 0
      ? Date.now() + safe * 60 * 60 * 1000
      : Date.now() + 100 * 365 * 24 * 60 * 60 * 1000; // ~100 years
  return new Date(ms).toISOString();
}
