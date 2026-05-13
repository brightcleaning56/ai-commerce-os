/**
 * Agent presence — who's currently signed in with a registered Twilio
 * Device and ready to receive inbound calls.
 *
 * Backing store: a single JSON blob (`agent-presence.json`) keyed by
 * Twilio Client identity. Each record carries a `lastHeartbeatAt` ISO
 * string. We treat anyone whose last heartbeat is within the TTL as
 * online. Tabs that close gracefully DELETE their record; tabs that
 * crash or lose network simply age out.
 *
 * TTL = 90 seconds. Heartbeat cadence in VoiceProvider = 30 seconds.
 * That gives 3 missed heartbeats before we stop ringing a stale agent.
 * Trade-off: too short = false-offlines from short network blips; too
 * long = inbound rings dead tabs that nobody will pick up.
 *
 * Node-only — uses lib/store.ts. Never call from middleware/edge.
 */
import { getBackend } from "./store";

const PRESENCE_FILE = "agent-presence.json";
export const PRESENCE_TTL_MS = 90_000;

export type AgentPresence = {
  identity: string;          // Twilio Client identity (the user's email)
  email: string;             // same as identity but kept explicit for readability
  role: string;              // "Owner" | "Operator" | "Support" | ...
  lastHeartbeatAt: string;   // ISO
  // The user-agent string lets the operator see "Eric is on Chrome
  // desktop, Sarah is on Safari mobile" when debugging missed rings.
  userAgent?: string;
};

type PresenceMap = Record<string, AgentPresence>;

async function readMap(): Promise<PresenceMap> {
  const raw = await getBackend().read<PresenceMap>(PRESENCE_FILE, {});
  // Defensive: drop any malformed entries.
  const safe: PresenceMap = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v && typeof v === "object" && typeof v.identity === "string" && typeof v.lastHeartbeatAt === "string") {
      safe[k] = v;
    }
  }
  return safe;
}

async function writeMap(m: PresenceMap): Promise<void> {
  await getBackend().write(PRESENCE_FILE, m);
}

/**
 * Mark `identity` online (insert or refresh). Writes back the heartbeat.
 * Idempotent — safe to call on every heartbeat tick.
 */
export async function markOnline(input: {
  identity: string;
  email: string;
  role: string;
  userAgent?: string;
}): Promise<AgentPresence> {
  const map = await readMap();
  const record: AgentPresence = {
    identity: input.identity,
    email: input.email,
    role: input.role,
    lastHeartbeatAt: new Date().toISOString(),
    userAgent: input.userAgent,
  };
  map[input.identity] = record;
  await writeMap(map);
  return record;
}

/**
 * Explicit offline (called when VoiceProvider unmounts cleanly).
 * Silent no-op if the identity isn't in the map.
 */
export async function markOffline(identity: string): Promise<void> {
  const map = await readMap();
  if (!(identity in map)) return;
  delete map[identity];
  await writeMap(map);
}

/**
 * Returns the list of identities whose last heartbeat is within TTL.
 * Side effect: prunes stale entries from the store so it stays small.
 * Used by /api/voice/inbound to build the <Dial><Client> list.
 */
export async function getOnlineAgents(): Promise<AgentPresence[]> {
  const map = await readMap();
  const now = Date.now();
  const fresh: AgentPresence[] = [];
  const stale: string[] = [];
  for (const [k, v] of Object.entries(map)) {
    const age = now - new Date(v.lastHeartbeatAt).getTime();
    if (age <= PRESENCE_TTL_MS) {
      fresh.push(v);
    } else {
      stale.push(k);
    }
  }
  if (stale.length > 0) {
    // Drop stale entries opportunistically. If the write fails the
    // freshness check still works on the next read.
    for (const k of stale) delete map[k];
    await writeMap(map).catch(() => {});
  }
  return fresh;
}
