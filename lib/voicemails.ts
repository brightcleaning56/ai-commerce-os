/**
 * Inbound voicemails -- recordings captured by the <Record> verb in
 * /api/voice/inbound when the operator's browser doesn't pick up.
 *
 * Distinct from voiceRecordings.ts (which keys per CallSid for joining
 * with operator-initiated outbound calls). Voicemails have:
 *   - no associated task / attempt
 *   - a `from` we passed through the recording callback URL so we
 *     don't have to query Twilio's REST API for call metadata
 *   - a `read` flag so the operator can mark them done
 *
 * Surfaced on /calls + as an attention item on the home dashboard so
 * missed callers don't disappear.
 */
import { getBackend } from "@/lib/store";

const VOICEMAILS_FILE = "voicemails.json";
const MAX_ENTRIES = 500;

export type Voicemail = {
  id: string;                  // = CallSid (idempotent on webhook retry)
  recordingSid: string;
  recordingUrl: string;        // .mp3, fetched via /api/voice/recording-proxy
  from: string;                // E.164 caller number
  durationSec: number;
  recordedAt: string;          // ISO when webhook fired
  read: boolean;               // operator dismissed it
};

export async function listVoicemails(): Promise<Voicemail[]> {
  return getBackend().read<Voicemail[]>(VOICEMAILS_FILE, []);
}

export async function saveVoicemail(vm: Voicemail): Promise<void> {
  const existing = await listVoicemails();
  // Idempotent on CallSid -- Twilio retries failed webhooks and we don't
  // want duplicate entries cluttering the inbox.
  const filtered = existing.filter((v) => v.id !== vm.id);
  const next = [vm, ...filtered].slice(0, MAX_ENTRIES);
  await getBackend().write(VOICEMAILS_FILE, next);
}

export async function markVoicemailRead(id: string, read: boolean): Promise<Voicemail | null> {
  const all = await listVoicemails();
  const idx = all.findIndex((v) => v.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], read };
  await getBackend().write(VOICEMAILS_FILE, all);
  return all[idx];
}

export async function unreadVoicemailCount(): Promise<number> {
  const all = await listVoicemails();
  return all.filter((v) => !v.read).length;
}
