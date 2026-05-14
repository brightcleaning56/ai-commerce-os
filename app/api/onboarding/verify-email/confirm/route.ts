import { NextRequest, NextResponse } from "next/server";
import { confirmEmailVerify } from "@/lib/onboardingVerification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding/verify-email/confirm — submit the 6-digit code.
 *
 * Body: { code: string }
 * Returns: { ok, verified?, reason? }
 *
 * Side effects on success:
 *   - session.emailVerified -> true
 *   - the code record is deleted (single-use)
 *
 * Failure modes:
 *   - 5 wrong attempts -> code locked, must request new one
 *   - 10-minute TTL expired -> request new one
 *   - No code on file -> request new one
 */
export async function POST(req: NextRequest) {
  const sessionId = req.cookies.get("avyn_onboarding")?.value;
  if (!sessionId) return NextResponse.json({ error: "No onboarding session" }, { status: 404 });

  let body: { code?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.code || typeof body.code !== "string") {
    return NextResponse.json({ error: "code required" }, { status: 400 });
  }

  const r = await confirmEmailVerify({ sessionId, code: body.code });
  if (!r.ok) return NextResponse.json(r, { status: 400 });
  return NextResponse.json(r);
}
