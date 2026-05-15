/**
 * Team-member preferences reader -- bridges the team onboarding
 * answers (slice 3) into queryable app code (slice 16+).
 *
 * The team onboarding flow saves answers to team-prefs.json via
 * /api/onboarding/complete keyed by email. Until slice 16, the data
 * was captured but no app code or admin UI surfaced it.
 *
 * This module is the read layer + helpers. Provides typed access +
 * defaults so call sites don't have to know about the underlying JSON
 * shape and stay safe when a teammate hasn't completed onboarding yet.
 *
 * Slice 16 ships the reader + admin viewer.
 * Slice 21 wires `agents[]` into agent-access enforcement.
 *
 * Node-only.
 */
import { getBackend } from "@/lib/store";

const TEAM_PREFS_FILE = "team-prefs.json";

export type AiPermission = "draft-only" | "auto-low-risk" | "fully-autonomous";

export type TeamPref = {
  email: string;
  answers: Record<string, Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
  sessionId: string;
};

export type ResolvedTeamPref = {
  email: string;
  fullName?: string;
  displayName?: string;
  phone?: string;
  timezone?: string;
  department?: string;
  experience?: string;
  primaryWorkflows: string[];
  agents: string[];
  aiPermission: AiPermission;
  quoteApprovalCap?: number;
  discountCap?: number;
  refundCap?: number;
  outreachVolumeCap?: number;
  channels: string[];
  quietHours?: string;
  incomingCallRouting: boolean;
  raw: TeamPref;
};

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}
function asArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}
function asBool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function resolve(pref: TeamPref): ResolvedTeamPref {
  const a = pref.answers ?? {};
  const identity = a.identity ?? {};
  const context = a.context ?? {};
  const aiAgents = a.aiAgents ?? {};
  const limits = a.limits ?? {};
  const comms = a.comms ?? {};
  const aiPermissionRaw = asString(aiAgents.aiPermission);
  return {
    email: pref.email,
    fullName: asString(identity.fullName),
    displayName: asString(identity.displayName),
    phone: asString(identity.phone),
    timezone: asString(identity.timezone),
    department: asString(context.department),
    experience: asString(context.experience),
    primaryWorkflows: asArray(context.primaryWorkflows),
    agents: asArray(aiAgents.agents),
    aiPermission:
      aiPermissionRaw === "draft-only" ||
      aiPermissionRaw === "auto-low-risk" ||
      aiPermissionRaw === "fully-autonomous"
        ? aiPermissionRaw
        : "draft-only",
    quoteApprovalCap: asNumber(limits.quoteApprovalCap),
    discountCap: asNumber(limits.discountCap),
    refundCap: asNumber(limits.refundCap),
    outreachVolumeCap: asNumber(limits.outreachVolumeCap),
    channels: asArray(comms.channels),
    quietHours: asString(comms.quietHours),
    incomingCallRouting: asBool(comms.incomingCallRouting, true),
    raw: pref,
  };
}

export const teamPrefs = {
  async list(): Promise<ResolvedTeamPref[]> {
    const all = await getBackend().read<TeamPref[]>(TEAM_PREFS_FILE, []);
    return all
      .filter((p) => p && typeof p.email === "string")
      .map(resolve)
      .sort((a, b) => a.email.localeCompare(b.email));
  },

  async getByEmail(email: string): Promise<ResolvedTeamPref | null> {
    const norm = email.trim().toLowerCase();
    if (!norm) return null;
    const all = await teamPrefs.list();
    return all.find((p) => p.email.toLowerCase() === norm) ?? null;
  },

  /**
   * Helper for slice 21+: does this teammate have access to a given AI
   * agent kind? Defaults to true (agent allowed) when the teammate
   * hasn't completed onboarding -- onboarding gates ADD restrictions,
   * not REMOVE existing access.
   */
  async hasAgentAccess(email: string, agent: string): Promise<boolean> {
    const pref = await teamPrefs.getByEmail(email);
    if (!pref) return true;
    if (pref.agents.length === 0) return true;
    return pref.agents.includes(agent);
  },
};
