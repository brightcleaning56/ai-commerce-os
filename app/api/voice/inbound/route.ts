import { NextRequest, NextResponse } from "next/server";
import { getOperator } from "@/lib/operator";
import { verifyTwilioSignature } from "@/lib/twilioVoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/voice/inbound — Twilio webhook for INCOMING calls.
 *
 * Wire this URL on your Twilio phone number's Voice Configuration:
 *   Phone Numbers > Manage > <your-number> > Voice Configuration
 *   "A call comes in" → Webhook → https://YOUR-DOMAIN/api/voice/inbound (POST)
 *
 * When someone dials your Twilio number, Twilio POSTs here. We respond
 * with TwiML that dials the operator's Client identity (their email),
 * which causes the @twilio/voice-sdk Device in their browser to fire
 * Device.on("incoming") with an answerable Call object.
 *
 * If the operator doesn't pick up within 25s OR no Device is currently
 * registered (browser closed), Twilio falls through to <Record> for
 * voicemail. Voicemail recordings land via the same recording-status
 * webhook as outbound calls, so they show in the call-history UI with
 * an inline player.
 *
 * SECURITY: every request is signature-verified using TWILIO_AUTH_TOKEN.
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  if (!formData) return new NextResponse("Bad request", { status: 400 });

  const formParams: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    formParams[k] = typeof v === "string" ? v : "";
  }

  const sig = req.headers.get("x-twilio-signature");
  const valid = verifyTwilioSignature({
    signatureHeader: sig,
    url: req.url,
    formParams,
  });
  if (!valid) return new NextResponse("Invalid signature", { status: 403 });

  // Identity must match the one mintAccessToken used when issuing the
  // operator's JWT (we use op.email). If they're different the inbound
  // bridge will hit "no client registered" and fall through to voicemail.
  const op = getOperator();
  const clientIdentity = op.email || op.name || "operator";
  const safeIdentity = clientIdentity.replace(/[^a-zA-Z0-9@._+-]/g, "");

  // Recording: opt-in via env, same flag as outbound. URL is built from
  // this request so the webhook path resolves regardless of deploy host.
  const url = new URL(req.url);
  const recordEnabled = process.env.TWILIO_RECORD_CALLS === "true";
  const recordingStatusUrl = `${url.protocol}//${url.host}/api/voice/recording-status`;
  const recordAttrs = recordEnabled
    ? ` record="record-from-answer-dual" recordingStatusCallback="${recordingStatusUrl}" recordingStatusCallbackEvent="completed"`
    : "";

  const callerId = (formParams.From ?? "unknown").replace(/[^+\d]/g, "");

  // Voicemail recording callback gets ?source=voicemail&from=<E.164> so
  // /api/voice/recording-status can route it to the voicemails store.
  // Without these params the recording would land as a generic CallSid
  // -> URL entry that no UI surfaces (since there's no task to match).
  const voicemailCallbackUrl = new URL(recordingStatusUrl);
  voicemailCallbackUrl.searchParams.set("source", "voicemail");
  voicemailCallbackUrl.searchParams.set("from", callerId);

  // Try the operator's browser for 25s. If no answer, drop to voicemail
  // (prerecorded greeting + 2-min recording window).
  const greeting =
    process.env.VOICEMAIL_GREETING ||
    `${op.company || op.name || "AVYN"} can't take your call right now. Leave a message after the tone.`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="25" answerOnBridge="true" callerId="${callerId}"${recordAttrs}>
    <Client>${safeIdentity}</Client>
  </Dial>
  <Say voice="Polly.Joanna">${escapeXml(greeting)}</Say>
  <Record maxLength="120" recordingStatusCallback="${escapeXmlAttr(voicemailCallbackUrl.toString())}" recordingStatusCallbackEvent="completed" />
  <Say voice="Polly.Joanna">Thanks. Goodbye.</Say>
</Response>`;

  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function escapeXml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Stricter version for attribute values (no need to escape ' since we
// use double-quoted attributes). Used for URLs with query strings
// where & needs to become &amp; or the XML parser breaks.
function escapeXmlAttr(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
