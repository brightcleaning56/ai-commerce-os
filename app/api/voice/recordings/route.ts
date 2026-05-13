import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { getVoiceRecordingsByCallSids } from "@/lib/voiceRecordings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/voice/recordings?callSids=sid1,sid2,sid3 â€” admin-only.
 *
 * Joins client-side CallAttempts (which carry the CallSid we captured
 * from the SDK at call time) with server-side recording metadata
 * (deposited by the /api/voice/recording-status webhook). Used by
 * /tasks to render audio players on past attempts.
 *
 * Recordings are themselves Twilio-hosted .mp3s -- they require Twilio
 * Basic Auth (account SID + auth token) to fetch directly. The browser
 * <audio src="..."> tag won't have those credentials, so the URL we
 * return is consumed via a separate proxy endpoint (TBD slice 2:
 * /api/voice/recording-proxy/[recordingSid]) when the operator hits
 * play. For now we surface the URL so operators with the Twilio
 * console open can click through and listen.
 *
 * Returns: { recordings: { [callSid]: VoiceRecording } }
 *
 * Empty input -> empty result. Unknown SIDs are silently omitted.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "voice:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const url = new URL(req.url);
  const csv = url.searchParams.get("callSids") ?? "";
  const callSids = csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200); // bounded so a malicious caller can't request millions

  if (callSids.length === 0) {
    return NextResponse.json({ recordings: {} });
  }

  const recordings = await getVoiceRecordingsByCallSids(callSids);
  return NextResponse.json({ recordings });
}
