import { NextRequest, NextResponse } from "next/server";
import { callsStore } from "@/lib/calls";
import { sendEmail } from "@/lib/email";
import { getOperator } from "@/lib/operator";
import { store } from "@/lib/store";
import { verifyTwilioSignature } from "@/lib/twilioVoice";
import { patchVoicemailTranscript } from "@/lib/voicemails";
import { patchVoiceRecordingTranscript } from "@/lib/voiceRecordings";

/** Strip non-digits + suffix-match phones (last 10 chars). Same
 *  heuristic used by IncomingCallWidget for cross-format matching. */
function phonesMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const na = a.replace(/\D/g, "");
  const nb = b.replace(/\D/g, "");
  if (!na || !nb) return false;
  if (na === nb) return true;
  const len = Math.min(na.length, nb.length, 10);
  return na.slice(-len) === nb.slice(-len);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/voice/transcription-status -- Twilio webhook for the
 * voicemail transcription completion event.
 *
 * Wired automatically: /api/voice/inbound's <Record transcribe="true"
 * transcribeCallback="..."> attribute points here. No operator setup
 * in Twilio Console required.
 *
 * Body params (form-encoded):
 *   - RecordingSid          ties the transcript back to the recording
 *   - TranscriptionSid
 *   - TranscriptionText     the actual text (English only, ~95% accuracy
 *                           for clear speech, falls off fast for noisy)
 *   - TranscriptionStatus   "completed" | "failed"
 *
 * We look up the matching Voicemail by RecordingSid (since
 * recordingStatusCallback wrote that on the original capture), patch
 * the transcript field, and optionally re-email the operator with the
 * transcript inlined so they can scan from their inbox without opening
 * the app.
 *
 * Signature-verified the same way as recording-status.
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

  const recordingSid = formParams.RecordingSid;
  const text = formParams.TranscriptionText ?? "";
  const status = formParams.TranscriptionStatus === "completed" ? "completed" : "failed";

  if (!recordingSid) {
    return NextResponse.json({ error: "Missing RecordingSid" }, { status: 400 });
  }

  // Slice 52: route by ?source=outbound vs the existing voicemail
  // path. The recording-status webhook sets ?source=outbound on its
  // transcribeCallback URL; voicemails leave it unset.
  const sourceParam = req.nextUrl.searchParams.get("source");
  if (sourceParam === "outbound") {
    const updated = await patchVoiceRecordingTranscript({
      recordingSid,
      transcription: text,
      status,
      transcriptionSid: formParams.TranscriptionSid,
    });
    if (!updated) {
      console.info(
        `[voice/transcription-status] no outbound recording for RecordingSid ${recordingSid} -- "${text.slice(0, 80)}"`,
      );
      return NextResponse.json({ ok: true, persisted: false, kind: "outbound" });
    }

    // ── Slice 60: auto-attach to lead thread ─────────────────────
    // Look up the Call by callSid (slice 52 stamps the recording
    // with the originating callSid in the URL params + persists on
    // VoiceRecording). Match the call's toNumber against any lead's
    // phone using the suffix-match helper. When matched, append a
    // callTranscripts[] entry on the lead so the conversation
    // history shows in /leads detail rail alongside inboundSms.
    if (status === "completed" && text) {
      try {
        const callSidParam = req.nextUrl.searchParams.get("callSid") ?? updated.callSid;
        if (callSidParam) {
          const call = await callsStore.getByCallSid(callSidParam).catch(() => null);
          const targetPhone = call?.toNumber;
          if (targetPhone) {
            const leads = await store.getLeads();
            const lead = leads.find((l) => phonesMatch(l.phone, targetPhone));
            if (lead) {
              const entry = {
                at: new Date().toISOString(),
                callSid: callSidParam,
                durationSec: updated.durationSec ?? 0,
                text: text.slice(0, 4000),
                direction: (call?.direction === "inbound" ? "inbound" : "outbound") as
                  | "outbound"
                  | "inbound",
              };
              const existing = lead.callTranscripts ?? [];
              // Idempotent on callSid -- Twilio retries the
              // transcribeCallback occasionally.
              const deduped = existing.filter((t) => t.callSid !== callSidParam);
              await store.updateLead(lead.id, {
                callTranscripts: [...deduped, entry],
              });
            }
          }
        }
      } catch (e) {
        console.warn(
          `[voice/transcription-status] lead auto-attach failed:`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    // Don't email -- outbound transcripts aren't novelty events for
    // the operator the way an unread voicemail is. They become
    // searchable via /api/voice/transcripts/search.
    return NextResponse.json({
      ok: true,
      persisted: true,
      kind: "outbound",
      textLength: text.length,
    });
  }

  const updated = await patchVoicemailTranscript({
    recordingSid,
    transcription: text,
    status,
  });

  if (!updated) {
    // No matching voicemail. Probably an out-of-order webhook race where
    // the transcript landed before the recording. Log + 200 so Twilio
    // doesn't retry indefinitely.
    console.info(
      `[voice/transcription-status] no voicemail for RecordingSid ${recordingSid} -- "${text.slice(0, 80)}"`,
    );
    return NextResponse.json({ ok: true, persisted: false });
  }

  // Re-email the operator with the transcript inlined so they can scan
  // from their inbox. Only fire for the completed case so the initial
  // "📞 New voicemail from ..." email from /api/voice/recording-status
  // isn't immediately followed by a "Transcription failed" follow-up.
  if (status === "completed" && text) {
    const op = getOperator();
    if (op.email) {
      sendEmail({
        to: op.email,
        subject: `📞 Voicemail transcript from ${updated.from}`,
        textBody: [
          `${updated.from} left a voicemail. Twilio's transcription:`,
          ``,
          `"${text}"`,
          ``,
          `(Quality is automated — listen to the recording if anything reads off.)`,
          ``,
          `Listen + call back:`,
          `${process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://avyncommerce.com"}/calls`,
        ].join("\n"),
        skipFooter: true,
        metadata: {
          kind: "voicemail-transcript",
          recording_sid: recordingSid,
          call_sid: updated.id,
        },
      }).catch((err) => {
        console.warn(`[voice/transcription-status] transcript notify failed:`, err);
      });
    }
  }

  return NextResponse.json({
    ok: true,
    persisted: true,
    status,
    textLength: text.length,
  });
}
