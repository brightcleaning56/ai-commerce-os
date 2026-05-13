import { NextRequest, NextResponse } from "next/server";
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
  // (Twilio also accepts .wav; .mp3 is smaller + universally supported.)
  const mp3Url = recordingUrl.endsWith(".mp3")
    ? recordingUrl
    : `${recordingUrl}.mp3`;

  await saveVoiceRecording({
    callSid,
    recordingSid,
    recordingUrl: mp3Url,
    durationSec: parseInt(formParams.RecordingDuration ?? "0", 10) || 0,
    recordedAt: new Date().toISOString(),
    channels: parseInt(formParams.RecordingChannels ?? "1", 10) || 1,
  });

  return NextResponse.json({ ok: true, persisted: true });
}
