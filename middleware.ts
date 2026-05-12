import { NextRequest, NextResponse } from "next/server";

/**
 * Edge middleware — gates the authenticated app + admin APIs.
 *
 * Behavior depends on env:
 *   - ADMIN_TOKEN unset:
 *       Dev mode. Everything passes. Logs a warning in production builds.
 *
 *   - ADMIN_TOKEN set + cookie `aicos_admin=<TOKEN>` matches:
 *       Authenticated. Pass.
 *
 *   - ADMIN_TOKEN set + presented cookie missing/wrong, accessing /signin:
 *       Pass (so the user can submit credentials).
 *
 *   - ADMIN_TOKEN set + presented cookie missing/wrong, accessing protected:
 *       Redirect to /signin?next=<original-path>.
 *
 *   - ADMIN_TOKEN set + Authorization: Bearer <TOKEN> header (for API access):
 *       Authenticated. Pass.
 *
 * Public paths (no gate):
 *   - /share/[id]    public viewer (token-gated by route)
 *   - /quote/[id]    public viewer (token-gated by route)
 *   - /welcome       marketing landing
 *   - /signin        sign-in form
 *   - /api/share/*   public viewer API
 *   - /api/quotes/*  public viewer API
 *   - /api/webhooks/* external services
 *   - /api/cron/*    cron-secret-gated separately
 *   - /_next/*       static assets
 *   - /favicon.ico, /robots.txt, etc.
 */

const PUBLIC_PATHS = [
  "/welcome",
  "/signin",
  "/signup",
  "/login",
  "/demo",
  "/contact",
  "/privacy",
  "/terms",
  "/api/operator",          // public profile (name+email — same info we sign emails with)
  "/api/auth/signin",       // sign-in form submits here
  "/api/signin-summary",    // public aggregate stats for the sign-in right panel
  "/api/leads",             // public POST from /contact form (handler gates GET via requireAdmin)
];
const PUBLIC_PREFIXES = [
  "/share/",
  "/quote/",
  "/invite/",                // /invite/[token] — token IS the auth
  "/api/share/",
  "/api/quotes/",
  "/api/invites/",           // /api/invites/[token] + /accept — token-gated
  "/api/webhooks/",
  "/api/cron/",
  "/api/v1/",                // /api/v1/* — Bearer API-key auth via lib/apiAuth
  "/_next/",
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  for (const p of PUBLIC_PREFIXES) {
    if (pathname.startsWith(p)) return true;
  }
  // Stripe Connect refresh endpoints — Stripe redirects the supplier here
  // when an AccountLink expires. We mint a fresh link and 302 them back.
  // Path shape: /api/transactions/<txnId>/connect-supplier/refresh
  if (/^\/api\/transactions\/[^/]+\/connect-supplier\/refresh\/?$/.test(pathname)) {
    return true;
  }
  // Static asset extensions
  if (/\.(png|jpe?g|gif|svg|ico|webmanifest|css|js|map|txt)$/i.test(pathname)) return true;
  return false;
}

/**
 * Mark a response as private/no-cache. Critical for authenticated routes:
 * Netlify's edge CDN was caching `/leads` (and any (app) page) for ~50min
 * with a cache key that didn't vary on the aicos_admin cookie, so
 * authenticated users could see stale snapshots from earlier requests.
 * private + no-store + must-revalidate keeps every authenticated render
 * fresh and never reusable across users.
 *
 * Also sends Clear-Site-Data: "cache" once per request — this tells the
 * BROWSER to purge any locally-cached HTTP responses for this origin
 * before processing the new one. Without it, an existing browser cache
 * from before this fix shipped would keep serving stale /leads HTML
 * (with the old buggy JS bundle that silently failed cookie auth) for
 * up to its original TTL. Clear-Site-Data forces a clean slate per
 * authenticated request, at the small cost of an extra cache miss.
 */
function withNoCDNCache(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("CDN-Cache-Control", "no-store");
  res.headers.set("Netlify-CDN-Cache-Control", "no-store");
  res.headers.set("Clear-Site-Data", '"cache"');
  return res;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const expected = process.env.ADMIN_TOKEN;

  // Dev mode — no token configured, everything open
  if (!expected) {
    return NextResponse.next();
  }

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Check Authorization header (programmatic API access)
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (bearer && constantTimeEquals(bearer, expected)) {
    return withNoCDNCache(NextResponse.next());
  }

  // Check cookie (browser session)
  const cookie = req.cookies.get("aicos_admin")?.value ?? "";
  if (cookie && constantTimeEquals(cookie, expected)) {
    return withNoCDNCache(NextResponse.next());
  }

  // API requests get 401, browser requests redirect to signin
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const signinUrl = new URL("/signin", req.url);
  signinUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(signinUrl);
}

export const config = {
  // Match everything except Next.js internal paths.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
