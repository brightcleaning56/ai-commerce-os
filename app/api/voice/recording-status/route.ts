import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { getOperator } from "@/lib/operator";
import { saveVoicemail } from "@/lib/voicemails";
import { saveVoiceRecording } from "@/lib/voiceRecordings";
import { verifyTwilioSignature } from "@/lib/twilioVoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/voice/recording-status — Twilio webhook target.
 *
 * When recording completes for a call, Twilio POSTs here with:
 *   - CallSid           the original call's id (used to match a CallAttempt)
 *   - RecordingSid      the recording's id
 *   - RecordingUrl      .json/.mp3 (we store the .mp3 form)
 *   - RecordingDuration seconds (string)
 *   - RecordingChannels 1 (mono) or 2 (dual)
 *   - RecordingStatus   "completed" | "failed"
 *
 * We only persist on RecordingStatus=completed. Other statuses log
 * but don't write so half-baked recordings don't show in the UI.
 *
 * SECURITY: every request is signature-verified using TWILIO_AUTH_TOKEN.
 * Without that, anyone could spam fake recording URLs into the store.
 *
 * Wire this URL: built dynamically by /api/voice/twiml from the request
 * origin -- nothing to set in Twilio Console manually. The Dial verb
 * already includes recordingStatusCallback="<this URL>".
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return new NextResponse("Bad request", { status: 400 });
  }

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
  if (!valid) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  if (formParams.RecordingStatus !== "completed") {
    // Log + 200 so Twilio doesn't retry, but don't persist a half-baked
    // record. Operator sees "no recording" until/unless completion fires.
    console.info(
      `[voice/recording-status] non-completed status: ${formParams.RecordingStatus} for CallSid ${formParams.CallSid}`,
    );
    return NextResponse.json({ ok: true, persisted: false });
  }

  const callSid = formParams.CallSid;
  const recordingSid = formParams.RecordingSid;
  const recordingUrl = formParams.RecordingUrl;
  if (!callSid || !recordingSid || !recordingUrl) {
    return NextResponse.json(
      { error: "Missing CallSid / RecordingSid / RecordingUrl" },
      { status: 400 },
    );
  }

  // Twilio sends RecordingUrl WITHOUT the .mp3 extension by default.
  // Append it explicitly so the <audio> element in /tasks can play it.
  const mp3Url = recordingUrl.endsWith(".mp3") ? recordingUrl : `${recordingUrl}.mp3`;
  const durationSec = parseInt(formParams.RecordingDuration ?? "0", 10) || 0;
  const recordedAt = new Date().toISOString();

  // Voicemail branch -- /api/voice/inbound's <Record> verb appends
  // ?source=voicemail&from=<E.164> to its callback so we route inbound
  // voicemails into a separate store + notify the operator. Outbound
  // call recordings (no source param) flow through the original path.
  const url = new URL(req.url);
  const source = url.searchParams.get("source");
  if (source === "voicemail") {
    const from = url.searchParams.get("from") ?? "unknown";
    await saveVoicemail({
      id: callSid,
      recordingSid,
      recordingUrl: mp3Url,
      from,
      durationSec,
      recordedAt,
      read: false,
    });

    // Operator notification -- voicemails are time-sensitive (somebody
    // tried to reach you and got the answering machine). Email is the
    // existing channel and won't block on Postmark hiccups.
    const op = getOperator();
    if (op.email) {
      sendEmail({
        to: op.email,
        subject: `📞 New voicemail from ${from} (${durationSec}s)`,
        textBody: [
          `${from} left a ${durationSec}s voicemail at ${recordedAt}.`,
          ``,
          `Listen + manage at:`,
          `${process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://avyncommerce.com"}/calls`,
        ].join("\n"),
        skipFooter: true,
        metadata: { kind: "voicemail-notification", call_sid: callSid },
      }).catch((err) => {
        console.warn(`[voicemail] operator notify failed:`, err);
      });
    }

    // Also save to the recording store so the recording-proxy still
    // works (it validates against listVoiceRecordings before serving).
    await saveVoiceRecording({
      callSid,
      recordingSid,
      recordingUrl: mp3Url,
      durationSec,
      recordedAt,
      channels: parseInt(formParams.RecordingChannels ?? "1", 10) || 1,
    });

    return NextResponse.json({ ok: true, persisted: true, kind: "voicemail" });
  }

  // Default: outbound (or inbound that bridged to operator) call recording
  await saveVoiceRecording({
    callSid,
    recordingSid,
    recordingUrl: mp3Url,
    durationSec,
    recordedAt,
    channels: parseInt(formParams.RecordingChannels ?? "1", 10) || 1,
  });

  return NextResponse.json({ ok: true, persisted: true });
}
