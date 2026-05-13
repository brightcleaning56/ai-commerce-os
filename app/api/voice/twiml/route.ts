import { NextRequest, NextResponse } from "next/server";
import { buildOutboundTwiml, verifyTwilioSignature } from "@/lib/twilioVoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/voice/twiml — Twilio webhook target.
 *
 * When the browser-side Voice SDK calls Device.connect({ params: { To } }),
 * Twilio's edge POSTs to THIS url with form-encoded body containing the
 * connect params + standard call metadata (CallSid, From, etc).
 *
 * We respond with TwiML that says "dial the To number from our verified
 * caller-id". The browser's audio stream gets bridged to the called party.
 *
 * SECURITY: every request is verified via X-Twilio-Signature using
 * TWILIO_AUTH_TOKEN. Without that check, anyone who knows the URL could
 * make our Twilio account place calls. dev mode (no token set) bypasses
 * with a console warning -- production deploys MUST have TWILIO_AUTH_TOKEN.
 *
 * Wire this URL in Twilio Console:
 *   Voice → TwiML → Apps → <your-app> → Voice Configuration
 *   Request URL: https://YOUR-DOMAIN/api/voice/twiml  (HTTP POST)
 *   Then put that App SID in TWILIO_TWIML_APP_SID env.
 */
export async function POST(req: NextRequest) {
  // Twilio sends form-encoded bodies, not JSON
  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return new NextResponse("Bad request", { status: 400 });
  }

  // Build the params record for signature verification + To extraction
  const formParams: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    formParams[k] = typeof v === "string" ? v : "";
  }

  // Twilio computes the signature over the FULL request URL (including
  // protocol). req.url is correct on Vercel/Netlify production; behind
  // an L7 proxy you may need to reconstruct from forwarded headers.
  const sig = req.headers.get("x-twilio-signature");
  const valid = verifyTwilioSignature({
    signatureHeader: sig,
    url: req.url,
    formParams,
  });
  if (!valid) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  const to = formParams.To?.trim();
  if (!to) {
    return new NextResponse("Missing To parameter", { status: 400 });
  }

  // Optional callerId override — pass when the operator wants to dial
  // from a specific Twilio number (e.g. local presence per region).
  // Most callers omit this and we use TWILIO_FROM by default.
  const callerOverride = formParams.CallerId?.trim() || undefined;

  // Build the recording-status webhook URL from this request's origin
  // so it works on any deploy (Netlify preview, prod, local ngrok)
  // without needing NEXT_PUBLIC_APP_ORIGIN set.
  const url = new URL(req.url);
  const recordingStatusUrl = `${url.protocol}//${url.host}/api/voice/recording-status`;

  const twiml = buildOutboundTwiml({
    toNumber: to,
    callerIdOverride: callerOverride,
    recordingStatusUrl,
  });
  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

// Twilio also supports GET for some webhook configs. Mirror behavior so
// either works; production should use POST (default) for body privacy.
export async function GET(req: NextRequest) {
  return POST(req);
}
