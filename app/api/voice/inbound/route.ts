import { NextRequest, NextResponse } from "next/server";
import { getOperator } from "@/lib/operator";
import { verifyTwilioSignature } from "@/lib/twilioVoice";
import { getOnlineAgents } from "@/lib/agentPresence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/voice/inbound — Twilio webhook for INCOMING calls.
 *
 * Wire this URL on your Twilio phone number's Voice Configuration:
 *   Phone Numbers > Manage > <your-number> > Voice Configuration
 *   "A call comes in" → Webhook → https://YOUR-DOMAIN/api/voice/inbound (POST)
 *
 * Multi-agent routing: we look up every agent currently online (their
 * VoiceProvider is registered + heartbeating against /api/voice/presence)
 * and emit one <Client> per agent inside a single <Dial>. Twilio rings
 * them all simultaneously, the first to pick up wins, the rest stop
 * ringing automatically.
 *
 * The operator's Client identity is ALWAYS included as a fallback even
 * when their browser isn't currently registered — this preserves the
 * "owner can always be reached" property while a teammate is on-call.
 * If the operator IS already in the online list, the dedupe step
 * collapses the duplicate <Client> entry.
 *
 * If nobody's online and the owner's Device also isn't reachable
 * within 25s, the call falls through to <Record> for voicemail.
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

  // Build the set of Client identities to ring in parallel. Owner is
  // always included (so the operator can always be reached, even when
  // their tab isn't currently registered), plus every agent currently
  // marked online in lib/agentPresence.
  const op = getOperator();
  const ownerIdentity = (op.email || op.name || "operator").replace(/[^a-zA-Z0-9@._+-]/g, "");

  const online = await getOnlineAgents().catch(() => []);
  const identitySet = new Set<string>();
  identitySet.add(ownerIdentity);
  for (const a of online) {
    const safe = a.identity.replace(/[^a-zA-Z0-9@._+-]/g, "");
    if (safe) identitySet.add(safe);
  }
  const dialClients = Array.from(identitySet)
    .map((id) => `    <Client>${id}</Client>`)
    .join("\n");

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

  // Voicemail transcription -- Twilio runs free English transcription
  // on every Record verb when transcribe="true". Webhook fires separately
  // from the recording webhook (typically 30s-2min after the call ends).
  // Quality is mediocre but useful for scanning vs listening to each one.
  const transcribeCallbackUrl = new URL(`${url.protocol}//${url.host}/api/voice/transcription-status`);
  transcribeCallbackUrl.searchParams.set("source", "voicemail");
  transcribeCallbackUrl.searchParams.set("from", callerId);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="25" answerOnBridge="true" callerId="${callerId}"${recordAttrs}>
${dialClients}
  </Dial>
  <Say voice="Polly.Joanna">${escapeXml(greeting)}</Say>
  <Record maxLength="120" recordingStatusCallback="${escapeXmlAttr(voicemailCallbackUrl.toString())}" recordingStatusCallbackEvent="completed" transcribe="true" transcribeCallback="${escapeXmlAttr(transcribeCallbackUrl.toString())}" />
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
