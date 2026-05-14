import { NextRequest, NextResponse } from "next/server";
import { isPersona } from "@/lib/onboarding";
import { hashIp, onboardingSessions } from "@/lib/onboardingState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding/start — mint a new onboarding session.
 *
 * Body: { persona?: Persona, email?: string }
 *   - Both optional. Persona can be set on /onboarding/start by the
 *     chooser, or filled in later by PATCH /api/onboarding/save.
 *   - Email is captured here for the magic-link verifier (slice 7);
 *     not required at start time.
 *
 * Returns: { session, cookie }
 *   - cookie is set on the response (`avyn_onboarding`, 30-day TTL,
 *     httpOnly, sameSite=Lax). The client doesn't need to handle it
 *     explicitly -- the browser sends it back on subsequent requests.
 *
 * Public endpoint -- no auth required (this is the entrypoint).
 * Rate-limit: relies on Netlify-level rate limiting + the per-IP hash
 * we store on the session (lets us detect abuse later).
 */
export async function POST(req: NextRequest) {
  let body: { persona?: string; email?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional -- chooser may post {} just to mint a session
  }

  const persona = isPersona(body.persona) ? body.persona : null;
  const email = typeof body.email === "string" ? body.email : undefined;

  // Fingerprint -- best-effort, no enforcement yet
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0].trim();
  const ipHash = ip ? hashIp(ip) : undefined;
  const ua = req.headers.get("user-agent") ?? undefined;

  const session = await onboardingSessions.create({
    persona,
    email,
    ipHash,
    userAgent: ua ?? undefined,
  });

  const res = NextResponse.json({ session });
  res.cookies.set({
    name: "avyn_onboarding",
    value: session.id,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
