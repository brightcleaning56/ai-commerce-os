import { NextRequest, NextResponse } from "next/server";
import { startEmailVerify } from "@/lib/onboardingVerification";
import { onboardingSessions } from "@/lib/onboardingState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding/verify-email/start — send a 6-digit verification
 * code to the email captured on the onboarding session.
 *
 * Body: { email?: string }
 *   - If omitted, uses session.email captured during /save.
 *   - If provided AND different from session.email, updates the session
 *     (operator typed a different address in the verify step).
 *
 * Cookie-driven (avyn_onboarding session id). Public endpoint.
 *
 * Response: { ok, sent, expiresAt, reason? }
 *   - sent=false when the email adapter failed (e.g. Postmark rejected).
 *     Operator should still be able to enter the code if they got it
 *     out-of-band; the code is stored regardless.
 */
export async function POST(req: NextRequest) {
  const sessionId = req.cookies.get("avyn_onboarding")?.value;
  if (!sessionId) return NextResponse.json({ error: "No onboarding session" }, { status: 404 });
  const session = await onboardingSessions.get(sessionId);
  if (!session) return NextResponse.json({ error: "Session expired" }, { status: 404 });

  let body: { email?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Body optional
  }

  const email = body.email?.trim().toLowerCase() || session.email;
  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "Email required -- enter it in step 1 first" },
      { status: 400 },
    );
  }

  // If the operator typed a different email at verify time, update
  // the session so the rest of the flow uses it.
  if (email !== session.email) {
    await onboardingSessions.patch(sessionId, { email });
  }

  const r = await startEmailVerify({ sessionId, email });
  return NextResponse.json(r);
}
