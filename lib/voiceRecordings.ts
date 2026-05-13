/**
 * Server-side store for Twilio call recording metadata.
 *
 * Tasks (and their per-attempt CallSids) live in browser localStorage,
 * so the Twilio webhook can't write directly to the task record. Instead
 * we keep a thin server map: CallSid → { recordingUrl, durationSec, ... }.
 *
 * The /tasks page polls /api/voice/recordings?callSids=<csv> when it
 * has attempts with sids but no recording URL yet, and joins the
 * results into the rendered call history.
 *
 * Retention: capped at 1000 most-recent entries to bound the blob
 * size. At ~100 calls/day that's ~10 days of history -- enough for
 * the operator to see fresh recordings inline. Old recordings still
 * exist in Twilio (their retention policy applies) and could be
 * fetched via the Twilio REST API later if needed for archival.
 */

import { getBackend } from "@/lib/store";

const VOICE_RECORDINGS_FILE = "voice-recordings.json";
const MAX_ENTRIES = 1000;

export type VoiceRecording = {
  callSid: string;            // Twilio CallSid -- unique per call
  recordingSid: string;        // Twilio RecordingSid
  recordingUrl: string;        // .mp3 URL (Twilio-hosted, requires auth)
  durationSec: number;
  recordedAt: string;          // ISO -- when the webhook fired
  channels: number;            // 1 (mono) or 2 (dual-channel)
};

export async function listVoiceRecordings(): Promise<VoiceRecording[]> {
  return getBackend().read<VoiceRecording[]>(VOICE_RECORDINGS_FILE, []);
}

export async function getVoiceRecordingByCallSid(
  callSid: string,
): Promise<VoiceRecording | null> {
  const all = await listVoiceRecordings();
  return all.find((r) => r.callSid === callSid) ?? null;
}

export async function getVoiceRecordingsByCallSids(
  callSids: string[],
): Promise<Record<string, VoiceRecording>> {
  if (callSids.length === 0) return {};
  const all = await listVoiceRecordings();
  const wanted = new Set(callSids);
  const out: Record<string, VoiceRecording> = {};
  for (const r of all) {
    if (wanted.has(r.callSid)) out[r.callSid] = r;
  }
  return out;
}

export async function saveVoiceRecording(rec: VoiceRecording): Promise<void> {
  const existing = await listVoiceRecordings();
  // Idempotent: replace if a record for this CallSid already exists
  const filtered = existing.filter((r) => r.callSid !== rec.callSid);
  const next = [rec, ...filtered].slice(0, MAX_ENTRIES);
  await getBackend().write(VOICE_RECORDINGS_FILE, next);
}
