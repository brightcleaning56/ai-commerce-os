import { NextRequest, NextResponse } from "next/server";
import { looksLikeUserToken, verifyUserToken } from "@/lib/userToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sign-in: accept either ADMIN_TOKEN (global) or a u_ per-user invite
 * token (HMAC-signed at /api/invites/[token]/accept). Sets the same
 * aicos_admin session cookie either way — cookie is HttpOnly + Secure +
 * SameSite=lax + 30d for ADMIN_TOKEN, and the token's own exp (90d) for
 * per-user tokens.
 *
 * Rate-limited per-IP to slow down brute-force attempts.
 */
const RATE_LIMIT = 10; // attempts per minute per IP
const RATE_WINDOW_MS = 60_000;
const recent = new Map<string, number[]>();

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const now = Date.now();
  const log = recent.get(ip) ?? [];
  while (log.length && now - log[0] > RATE_WINDOW_MS) log.shift();
  if (log.length >= RATE_LIMIT) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Wait a minute and try again." },
      { status: 429 },
    );
  }
  log.push(now);
  recent.set(ip, log);

  let body: { token?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    // Dev mode — no gating
    return NextResponse.json({ ok: true, mode: "dev" });
  }
  if (!body.token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  // Path 1: matches global ADMIN_TOKEN — owner/dev path.
  if (constantTimeEquals(body.token, expected)) {
    const res = NextResponse.json({ ok: true, mode: "production", as: "admin" });
    res.cookies.set("aicos_admin", body.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });
    return res;
  }

  // Path 2: looks like a per-user token issued at invite acceptance.
  if (looksLikeUserToken(body.token)) {
    const v = await verifyUserToken(body.token);
    if (v.ok) {
      const ttlSec = Math.max(0, v.payload.exp - Math.floor(Date.now() / 1000));
      const res = NextResponse.json({
        ok: true,
        mode: "production",
        as: "user",
        email: v.payload.email,
        role: v.payload.role,
      });
      res.cookies.set("aicos_admin", body.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: ttlSec,
      });
      return res;
    }
    return NextResponse.json(
      { error: `Invalid invite token: ${v.reason}` },
      { status: 401 },
    );
  }

  return NextResponse.json({ error: "Invalid token" }, { status: 401 });
}

/**
 * Sign-out — clear the cookie.
 */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("aicos_admin", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
