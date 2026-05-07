/**
 * Auth scaffold — production hardening.
 *
 * Two enforcement modes:
 *   1. ADMIN_TOKEN env var set → routes calling requireAdmin() check for
 *      `Authorization: Bearer <ADMIN_TOKEN>`. Matches → ok. Else 401.
 *   2. ADMIN_TOKEN unset → DEV MODE. requireAdmin() always returns ok.
 *      Logs a warning so you don't ship without setting it.
 *
 * Production path: set ADMIN_TOKEN to a secret (`openssl rand -hex 32`).
 * For multi-user / multi-workspace, swap this for Clerk / NextAuth — the
 * call sites already centralize through requireAdmin() so it's one file.
 *
 * Public routes that should NOT be admin-gated:
 *   - /share/[id]  + /api/share/[id]  → token-gated (public viewer)
 *   - /quote/[id]  + /api/quotes/[id] → token-gated (public viewer)
 *   - /api/webhooks/* → external services (Postmark, Twilio) — gated separately
 *   - /api/cron/*  → cron-secret-gated (Vercel cron header)
 *   - / (welcome)  → marketing landing
 *
 * Everything else (the (app) route group + admin APIs) should call requireAdmin().
 */

export type AuthResult =
  | { ok: true; mode: "production" | "dev" }
  | { ok: false; status: 401 | 403; reason: string };

/**
 * Validate the request as coming from an authenticated admin/operator.
 * Centralized so swapping to Clerk / NextAuth is a single-file change.
 *
 * Accepts either a Request or a Next-style { headers: Headers } shape so
 * route handlers can pass `req` directly.
 */
export function requireAdmin(req: { headers: Headers } | Request): AuthResult {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[auth] ADMIN_TOKEN is not set in production. ALL admin routes are open. " +
          "Set ADMIN_TOKEN immediately or swap requireAdmin() for a real auth provider.",
      );
    }
    return { ok: true, mode: "dev" };
  }

  const auth = req.headers.get("authorization") ?? "";
  // Support both "Bearer X" and bare "X" forms
  const presented = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : auth;
  if (!presented) {
    return { ok: false, status: 401, reason: "Missing Authorization header" };
  }
  if (!constantTimeEquals(presented, expected)) {
    return { ok: false, status: 401, reason: "Invalid admin token" };
  }
  return { ok: true, mode: "production" };
}

/**
 * Constant-time string comparison to prevent timing attacks on token compare.
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Validate a cron request as coming from Vercel's scheduler.
 * Vercel attaches `Authorization: Bearer <CRON_SECRET>` if you've set the
 * secret on the project. In dev (no CRON_SECRET) calls are accepted.
 */
export function requireCron(req: { headers: Headers } | Request): AuthResult {
  const expected = process.env.CRON_SECRET;
  if (!expected) return { ok: true, mode: "dev" };
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return { ok: false, status: 401, reason: "Invalid cron secret" };
  }
  return { ok: true, mode: "production" };
}
