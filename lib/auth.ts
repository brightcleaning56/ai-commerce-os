/**
 * Auth scaffold — production hardening.
 *
 * Enforcement modes:
 *   1. ADMIN_TOKEN env var set → routes calling requireAdmin() check for
 *      either:
 *        a. `Authorization: Bearer <ADMIN_TOKEN>` (global admin)
 *        b. `Authorization: Bearer u_...` (per-user invite token — see
 *           lib/userToken.ts)
 *        c. Cookie aicos_admin=<one of the above>
 *      Matches → ok. Else 401.
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
 *
 * requireAdmin is async because per-user token verification uses Web
 * Crypto subtle.verify which is async. All call sites pass `await`.
 */
import { looksLikeUserToken, verifyUserToken, type UserTokenPayload } from "./userToken";

export type AuthResult =
  | { ok: true; mode: "production" | "dev"; user?: UserTokenPayload }
  | { ok: false; status: 401 | 403; reason: string };

/**
 * Validate the request as coming from an authenticated admin/operator.
 * Centralized so swapping to Clerk / NextAuth is a single-file change.
 *
 * Accepts either a Request or a Next-style { headers: Headers } shape so
 * route handlers can pass `req` directly.
 *
 * If matched on a per-user token, the returned AuthResult includes the
 * decoded payload (`user`) so call sites can read the role/email later.
 */
export async function requireAdmin(
  req: { headers: Headers } | Request,
): Promise<AuthResult> {
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

  // 1. Authorization header (programmatic API access)
  const auth = req.headers.get("authorization") ?? "";
  const headerToken = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : auth;
  if (headerToken) {
    if (constantTimeEquals(headerToken, expected)) return { ok: true, mode: "production" };
    if (looksLikeUserToken(headerToken)) {
      const v = await verifyUserToken(headerToken);
      if (v.ok) return { ok: true, mode: "production", user: v.payload };
      return { ok: false, status: 401, reason: `Invalid user token: ${v.reason}` };
    }
    return { ok: false, status: 401, reason: "Invalid admin token" };
  }

  // 2. Fall back to the session cookie (browser fetch from an authenticated page).
  // Middleware already validated this cookie at the edge to route the request
  // here, but route handlers re-validate as defense-in-depth — this also makes
  // it work in environments where middleware is bypassed (e.g. local tests).
  // Without this branch, cookie-authenticated browsers got 401 from every
  // route that called requireAdmin (leads, admin/health, transactions/stats…)
  // and pages would silently render as if the data were empty.
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)aicos_admin=([^;]+)/.exec(cookieHeader);
  const cookieToken = match ? decodeURIComponent(match[1]) : "";
  if (cookieToken) {
    if (constantTimeEquals(cookieToken, expected)) {
      return { ok: true, mode: "production" };
    }
    if (looksLikeUserToken(cookieToken)) {
      const v = await verifyUserToken(cookieToken);
      if (v.ok) return { ok: true, mode: "production", user: v.payload };
    }
  }

  return { ok: false, status: 401, reason: "Missing Authorization header or session cookie" };
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
