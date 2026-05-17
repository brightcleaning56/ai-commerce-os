import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { getVoiceProvider } from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/voice/outbound — slice 111.
 *
 * Backs the OutboundCallModal. The modal collects:
 *   - to (E.164)
 *   - campaign (string id)
 *   - script (string id)
 *   - callerId (E.164 of the from-number)
 *   - agent ("sales" | "callback")
 *
 * Real outbound paths (Vapi / Retell / Twilio) are NOT implemented in
 * this slice -- the response shape is shared so the modal works
 * identically against a future real adapter or the mock today. The
 * mock returns a fake call_id and a clear "config-needed" banner the
 * UI surfaces verbatim, mirroring the avyn.vercel.app reference UX.
 *
 * Returns:
 *   {
 *     ok: true,
 *     mock: boolean,        // true when no real provider configured
 *     callId: string,       // "mock_xxx" for mock, provider id otherwise
 *     dialingTo: string,
 *     provider: "vapi" | "retell" | "twilio" | "mock",
 *     configHint?: string,  // shown when mock=true so operator knows
 *                           // exactly which env vars unlock real dials
 *   }
 */
export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "voice:write");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const body = await req.json().catch(() => ({}));
  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!to) {
    return NextResponse.json({ error: "to (E.164) required" }, { status: 400 });
  }
  // Light normalization: must start with + and have at least 8 digits
  if (!/^\+\d{8,15}$/.test(to)) {
    return NextResponse.json(
      { error: "to must be E.164 (e.g. +14692678472)" },
      { status: 400 },
    );
  }
  const campaign = typeof body.campaign === "string" ? body.campaign : "default";
  const script = typeof body.script === "string" ? body.script : "default";
  const callerId = typeof body.callerId === "string" ? body.callerId : "";
  const agent: "sales" | "callback" =
    body.agent === "callback" ? "callback" : "sales";

  // Detect available real providers. Vapi + Retell are AI-driven; we
  // accept either real or fall back to mock. Twilio voice (browser
  // dialer) is a different path -- it doesn't apply to a campaign+
  // script "AI agent calls a number" flow.
  const vapiConfigured =
    !!(process.env.VAPI_PRIVATE_KEY || process.env.VAPI_API_KEY) &&
    !!process.env.VAPI_PHONE_NUMBER_ID;
  const retellConfigured = !!process.env.RETELL_API_KEY;
  const voiceInfo = getVoiceProvider();

  // Real dial would happen here. Slice 111 only ships UI + mock; a
  // future slice wires placeViaVapi / placeViaRetell that actually
  // hit the provider APIs. Mark-and-return for now.
  if (vapiConfigured || retellConfigured) {
    // We don't actually place the call yet -- this slice keeps the
    // response shape identical so the modal works today and the real
    // adapter slides in transparently later. Return mock=false so the
    // UI knows the operator's config is correct, even though we
    // haven't dialed yet.
    return NextResponse.json({
      ok: true,
      mock: true, // still mock at the adapter layer
      adapterReady: true, // env is set, just no dial code yet
      callId: `pending_${crypto.randomBytes(6).toString("hex")}`,
      dialingTo: to,
      campaign,
      script,
      callerId: callerId || null,
      agent,
      provider: vapiConfigured ? "vapi" : "retell",
      configHint:
        "Provider env is set but the real-dial adapter ships in a follow-up slice. This call did NOT actually dial.",
    });
  }

  // No provider configured -- pure mock path
  return NextResponse.json({
    ok: true,
    mock: true,
    adapterReady: false,
    callId: `mock_${crypto.randomBytes(6).toString("hex")}`,
    dialingTo: to,
    campaign,
    script,
    callerId: callerId || null,
    agent,
    provider: "mock",
    voiceProviderHint: voiceInfo.provider,
    configHint:
      "VAPI_API_KEY (or VAPI_PRIVATE_KEY) + VAPI_PHONE_NUMBER_ID -- OR -- RETELL_API_KEY not set. Configure one in env to dial real phones.",
  });
}
