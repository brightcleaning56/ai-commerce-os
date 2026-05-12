/**
 * Server-authoritative global agent kill switch.
 *
 * Until this was wired, the kill-switch button on /admin only set a
 * localStorage flag that one client-side code path checked (the manual
 * "Run pipeline" button on /pipeline). Every server-side agent entry --
 * crons, lead auto-reply, retry-stuck, bulk outreach jobs, brand
 * alternatives -- ignored it completely. That meant clicking the switch
 * created a false sense of safety: the operator thought everything was
 * paused while the daily follow-up cron was still firing.
 *
 * Now: this module is the single source of truth. State lives in Netlify
 * Blobs (kill-switch.json) so it survives lambda restarts and applies
 * workspace-wide. Every agent entry point calls assertNotKilled() at the
 * top; if active, the call throws KillSwitchActiveError which the caller
 * either:
 *   - Returns as a 503 with a clear message (API routes)
 *   - Logs and skips (crons -- skip is the correct behavior, not error)
 *
 * Callers should never bypass this. If you need to add a new agent
 * entry point, add an assertNotKilled() call at the top of the handler.
 */

import { getBackend } from "@/lib/store";

const KILL_SWITCH_FILE = "kill-switch.json";

export type KillSwitchState = {
  active: boolean;
  activatedAt: string | null; // ISO
  activatedBy: string | null; // operator name / identifier
  reason: string | null;      // optional free-text
};

const DEFAULT_STATE: KillSwitchState = {
  active: false,
  activatedAt: null,
  activatedBy: null,
  reason: null,
};

export async function getKillSwitch(): Promise<KillSwitchState> {
  return getBackend().read<KillSwitchState>(KILL_SWITCH_FILE, DEFAULT_STATE);
}

export async function setKillSwitch(args: {
  active: boolean;
  activatedBy?: string | null;
  reason?: string | null;
}): Promise<KillSwitchState> {
  const next: KillSwitchState = {
    active: args.active,
    activatedAt: args.active ? new Date().toISOString() : null,
    activatedBy: args.active ? (args.activatedBy ?? "operator") : null,
    reason: args.active ? (args.reason ?? null) : null,
  };
  await getBackend().write(KILL_SWITCH_FILE, next);
  return next;
}

export class KillSwitchActiveError extends Error {
  readonly state: KillSwitchState;
  constructor(state: KillSwitchState) {
    super(
      `Global kill switch is active${state.reason ? ` (${state.reason})` : ""}. ` +
        `Deactivate at /admin to resume agents.`,
    );
    this.name = "KillSwitchActiveError";
    this.state = state;
  }
}

/**
 * Throw KillSwitchActiveError if the global kill switch is currently active.
 * Call this at the TOP of every agent entry point (API route or cron handler)
 * that initiates LLM calls, outbound email/SMS, or any work the operator
 * might want to halt during an incident.
 */
export async function assertNotKilled(): Promise<void> {
  const state = await getKillSwitch();
  if (state.active) throw new KillSwitchActiveError(state);
}

/**
 * Non-throwing variant for paths that prefer to skip silently (e.g. crons
 * that should log + no-op rather than error). Returns the state object
 * so the caller can decide what to do with it.
 */
export async function checkKillSwitch(): Promise<{
  killed: boolean;
  state: KillSwitchState;
}> {
  const state = await getKillSwitch();
  return { killed: state.active, state };
}
