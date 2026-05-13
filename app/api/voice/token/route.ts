import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { mintAccessToken } from "@/lib/twilioVoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/voice/token â€” admin-only.
 *
 * Returns a short-lived (1h) Twilio Voice Access Token the browser
 * @twilio/voice-sdk Device uses to authenticate. Identity is the
 * operator's email so inbound calls can be routed back to the right
 * person if/when we wire incoming.
 *
 * Client should fetch a fresh token on Device init AND when the
 * existing one approaches expiry (Device.on("tokenWillExpire")).
 *
 * If env isn't fully wired (any of TWILIO_ACCOUNT_SID + TWILIO_API_KEY +
 * TWILIO_API_SECRET + TWILIO_TWIML_APP_SID is missing), returns 503
 * with a clear message so the client can fall back to tel: links.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const op = getOperator();
  // Identity falls back to "operator" if no email is configured -- still
  // produces a valid token, just less informative for incoming routing.
  const identity = op.email || op.name || "operator";
  const result = mintAccessToken({ identity });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.errorMessage ?? "Token mint failed" },
      { status: 503 },
    );
  }

  return NextResponse.json({
    token: result.token,
    identity: result.identity,
    expiresAt: result.expiresAt,
  });
}
