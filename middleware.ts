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
];
const PUBLIC_PREFIXES = [
  "/share/",
  "/quote/",
  "/api/share/",
  "/api/quotes/",
  "/api/webhooks/",
  "/api/cron/",
  "/_next/",
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  for (const p of PUBLIC_PREFIXES) {
    if (pathname.startsWith(p)) return true;
  }
  // Static asset extensions
  if (/\.(png|jpe?g|gif|svg|ico|webmanifest|css|js|map|txt)$/i.test(pathname)) return true;
  return false;
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
    return NextResponse.next();
  }

  // Check cookie (browser session)
  const cookie = req.cookies.get("aicos_admin")?.value ?? "";
  if (cookie && constantTimeEquals(cookie, expected)) {
    return NextResponse.next();
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
