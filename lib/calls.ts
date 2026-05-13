/**
 * Server-side call log.
 *
 * Previously /calls aggregated call attempts from localStorage tasks
 * (per-browser, can't be shared across agents). This module is the
 * shared source of truth: every placeOutboundCall via VoiceProvider
 * registers a Call record on start and patches it on disconnect.
 * Recording webhook attaches the recordingSid by CallSid. /calls
 * page reads from /api/calls + the existing voicemails + recordings
 * stores.
 *
 * Phased migration: /tasks still writes attempts to localStorage for
 * the call-session drawer's local state. /calls page MERGES the
 * server-side records with the legacy localStorage attempts so the
 * operator doesn't lose history while we cut over. Once the team is
 * fully on the server-side log, /tasks can drop its localStorage
 * write path.
 *
 * Node-only. Imports lib/store.ts.
 */
import crypto from "node:crypto";
import { getBackend } from "./store";

const CALLS_FILE = "calls.json";
const MAX_RETAINED = 2000;  // ring buffer; old calls drop off the end

export type CallDirection = "outbound" | "inbound";
export type CallOutcome =
  | "connected"
  | "voicemail"
  | "no-answer"
  | "wrong-number"
  | "callback-scheduled"
  | "missed"
  | "failed";

export type Call = {
  id: string;                  // call_<random>
  direction: CallDirection;
  callSid: string | null;      // Twilio CallSid (null until Device.connect resolves)
  agentEmail: string;          // who placed (outbound) or answered (inbound)
  agentRole: string;           // role at the time of the call -- snapshot, not live
  toNumber: string;            // E.164 phone or "client:foo" for in-app
  toContact?: string;          // optional display name (lead, buyer, etc.)
  startedAt: string;           // ISO
  endedAt?: string;            // ISO
  durationSec?: number;
  outcome?: CallOutcome;
  notes?: string;
  recordingSid?: string;       // set by recording-status webhook
  // The page the call was placed from, so analytics can answer
  // "where do most calls originate" without inferring.
  source?: "tasks" | "calls" | "system-health" | "lead-detail" | "other";
};

function isCallShape(v: unknown): v is Call {
  if (!v || typeof v !== "object") return false;
  const c = v as Partial<Call>;
  return (
    typeof c.id === "string" &&
    (c.direction === "outbound" || c.direction === "inbound") &&
    typeof c.agentEmail === "string" &&
    typeof c.toNumber === "string" &&
    typeof c.startedAt === "string"
  );
}

export const callsStore = {
  async list(filter?: {
    sinceIso?: string;
    untilIso?: string;
    agentEmail?: string;
    outcome?: CallOutcome;
    limit?: number;
  }): Promise<Call[]> {
    const raw = await getBackend().read<Call[]>(CALLS_FILE, []);
    const safe = raw.filter(isCallShape);
    let out = safe;
    if (filter?.sinceIso) {
      const since = new Date(filter.sinceIso).getTime();
      out = out.filter((c) => new Date(c.startedAt).getTime() >= since);
    }
    if (filter?.untilIso) {
      const until = new Date(filter.untilIso).getTime();
      out = out.filter((c) => new Date(c.startedAt).getTime() <= until);
    }
    if (filter?.agentEmail) {
      out = out.filter((c) => c.agentEmail === filter.agentEmail);
    }
    if (filter?.outcome) {
      out = out.filter((c) => c.outcome === filter.outcome);
    }
    // Newest first.
    out.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    if (filter?.limit) out = out.slice(0, filter.limit);
    return out;
  },

  async get(id: string): Promise<Call | null> {
    const all = await callsStore.list();
    return all.find((c) => c.id === id) ?? null;
  },

  async getByCallSid(callSid: string): Promise<Call | null> {
    const all = await callsStore.list();
    return all.find((c) => c.callSid === callSid) ?? null;
  },

  async create(input: Omit<Call, "id" | "startedAt"> & Partial<Pick<Call, "startedAt">>): Promise<Call> {
    const existing = (await getBackend().read<Call[]>(CALLS_FILE, [])).filter(isCallShape);
    const call: Call = {
      ...input,
      id: `call_${crypto.randomBytes(8).toString("hex")}`,
      startedAt: input.startedAt ?? new Date().toISOString(),
    };
    const next = [call, ...existing].slice(0, MAX_RETAINED);
    await getBackend().write(CALLS_FILE, next);
    return call;
  },

  async update(id: string, patch: Partial<Omit<Call, "id">>): Promise<Call | null> {
    const existing = (await getBackend().read<Call[]>(CALLS_FILE, [])).filter(isCallShape);
    const idx = existing.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    // If patch sets endedAt without durationSec, compute it.
    const merged: Call = { ...existing[idx], ...patch, id: existing[idx].id };
    if (merged.endedAt && merged.durationSec == null) {
      const dur = Math.max(
        0,
        Math.round((new Date(merged.endedAt).getTime() - new Date(merged.startedAt).getTime()) / 1000),
      );
      merged.durationSec = dur;
    }
    existing[idx] = merged;
    await getBackend().write(CALLS_FILE, existing);
    return merged;
  },

  /**
   * Attach a Twilio CallSid to a call by matching on the most recent
   * outbound call from this agent that's still callSid-less. Used
   * because Device.connect() resolves AFTER our POST /api/calls has
   * already created the record — there's a small window where we have
   * the call record but not its SID.
   */
  async attachCallSidToLatest(input: {
    agentEmail: string;
    callSid: string;
  }): Promise<Call | null> {
    const existing = (await getBackend().read<Call[]>(CALLS_FILE, [])).filter(isCallShape);
    // Newest first; find this agent's most recent outbound without a SID.
    existing.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    const target = existing.find(
      (c) => c.agentEmail === input.agentEmail && c.direction === "outbound" && !c.callSid,
    );
    if (!target) return null;
    return callsStore.update(target.id, { callSid: input.callSid });
  },
};
