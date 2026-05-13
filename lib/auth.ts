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
import { ROLES, type Capability, type Role } from "./capabilities";
import { resolveCapabilities } from "./rolePolicy";

export type AuthResult =
  | { ok: true; mode: "production" | "dev"; user?: UserTokenPayload }
  | { ok: false; status: 401 | 403; reason: string };

export type CapabilityResult =
  | { ok: true; mode: "production" | "dev"; as: "owner" | "user"; user?: UserTokenPayload }
  | { ok: false; status: 401 | 403; reason: string };

export type SupplierAuthResult =
  | { ok: true; mode: "production" | "dev"; supplierId: string; email: string; payload: UserTokenPayload }
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
      if (v.ok) {
        // Supplier tokens are scoped to the /portal surface ONLY. Staff
        // routes (admin / app / etc.) must reject them — otherwise a
        // supplier could mint themselves arbitrary read access. The
        // portal-facing requireSupplier helper accepts them instead.
        if (v.payload.kind === "supplier") {
          return {
            ok: false,
            status: 403,
            reason: "Supplier token can only access /portal routes",
          };
        }
        return { ok: true, mode: "production", user: v.payload };
      }
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
      if (v.ok) {
        if (v.payload.kind === "supplier") {
          return {
            ok: false,
            status: 403,
            reason: "Supplier session can only access /portal routes",
          };
        }
        return { ok: true, mode: "production", user: v.payload };
      }
    }
  }

  return { ok: false, status: 401, reason: "Missing Authorization header or session cookie" };
}

/**
 * Supplier-portal auth gate. Accepts ONLY supplier-kind invite tokens
 * (rejects ADMIN_TOKEN, rejects staff invite tokens). Use this on every
 * /api/portal/* route handler.
 *
 * In dev mode (no ADMIN_TOKEN), there's no portal session to validate
 * — returns 401 so dev environments don't accidentally expose data
 * the production path would scope.
 */
export async function requireSupplier(
  req: { headers: Headers } | Request,
): Promise<SupplierAuthResult> {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return { ok: false, status: 401, reason: "Portal disabled in dev (ADMIN_TOKEN unset)" };
  }

  const candidates: string[] = [];
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) candidates.push(auth.slice("Bearer ".length));
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)aicos_admin=([^;]+)/.exec(cookieHeader);
  if (match) candidates.push(decodeURIComponent(match[1]));

  for (const token of candidates) {
    if (!looksLikeUserToken(token)) continue;
    const v = await verifyUserToken(token);
    if (!v.ok) continue;
    if (v.payload.kind !== "supplier" || !v.payload.supplierId) continue;
    return {
      ok: true,
      mode: "production",
      supplierId: v.payload.supplierId,
      email: v.payload.email,
      payload: v.payload,
    };
  }

  return { ok: false, status: 401, reason: "No valid supplier session" };
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
 * Capability gate. Owner (ADMIN_TOKEN holder) always passes. User-token
 * holders pass only if their role's effective capability set includes
 * `cap`. Anything else → 403 with a reason the caller can surface.
 *
 * Don't call from edge middleware — this hits lib/rolePolicy.ts which
 * imports the store (node-only). Use in route handlers (runtime "nodejs").
 *
 * Failure modes returned:
 *   - 401: not authenticated at all
 *   - 403 "Capability X not granted to role Y": authenticated but role
 *     doesn't have the cap. Useful in the response body so the operator
 *     understands why a teammate hit a wall.
 */
export async function requireCapability(
  req: { headers: Headers } | Request,
  cap: Capability,
): Promise<CapabilityResult> {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth;

  // Owner / dev paths: bypass entirely.
  if (auth.mode === "dev") return { ok: true, mode: "dev", as: "owner" };
  if (!auth.user) return { ok: true, mode: "production", as: "owner" };

  // Per-user token: look up role's effective capabilities.
  const rawRole = auth.user.role;
  if (!isKnownRole(rawRole)) {
    return {
      ok: false,
      status: 403,
      reason: `Unknown role "${rawRole}" — re-issue your sign-in token.`,
    };
  }
  const role: Role = rawRole;
  const caps = await resolveCapabilities(role);
  if (!caps.has(cap)) {
    return {
      ok: false,
      status: 403,
      reason: `Capability "${cap}" is not granted to role "${role}". Ask the workspace owner to enable it on /admin/users.`,
    };
  }
  return { ok: true, mode: "production", as: "user", user: auth.user };
}

function isKnownRole(s: string): s is Role {
  return (ROLES as readonly string[]).includes(s);
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
