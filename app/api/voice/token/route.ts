import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { mintAccessToken } from "@/lib/twilioVoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/voice/token — issue a Twilio Voice Access Token for the
 * signed-in user.
 *
 * The token's `identity` field MUST be the signed-in user's email
 * (their unique Twilio Client identity). When /api/voice/inbound
 * builds <Dial><Client>{identity}</Client></Dial> the Client lookup
 * at Twilio's edge needs to land on this user's specific Device.
 *
 *   - Owner (signed in via ADMIN_TOKEN) → identity = OPERATOR_EMAIL
 *   - Per-user invite token              → identity = auth.user.email
 *
 * Previously hardcoded to op.email, which meant every signed-in agent
 * registered as the SAME client identity. Inbound rang the first
 * Device to register and missed all the others. With this change
 * every agent registers separately and inbound can fan out.
 *
 * Capability gate: voice:write. Token issuance = "can this user
 * make outbound + receive inbound". voice:read alone (Analyst,
 * Viewer) doesn't grant a Device.
 *
 * If env isn't fully wired (any of TWILIO_ACCOUNT_SID + TWILIO_API_KEY
 * + TWILIO_API_SECRET + TWILIO_TWIML_APP_SID is missing), returns 503
 * with a clear message so the client can show "voice not configured"
 * instead of crashing.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "voice:write");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  // Resolve identity: owner uses operator email, per-user tokens use
  // their own email. The fallback to "operator" only triggers in dev
  // mode (no ADMIN_TOKEN, no real user) so we still produce a valid
  // token without erroring locally.
  const op = getOperator();
  const isOwner = auth.mode === "production" ? !auth.user : true;
  const email = isOwner ? op.email : auth.user!.email;
  const identity = email || op.name || "operator";
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
    isOwner,
    role: isOwner ? "Owner" : auth.user!.role,
  });
}
