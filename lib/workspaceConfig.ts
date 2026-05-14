/**
 * Workspace config reader — bridges the admin onboarding answers
 * (slice 2) into actual app behavior (slice 10).
 *
 * The admin onboarding flow saves answers to workspace-config.json
 * via /api/onboarding/complete. Until slice 10, those answers were
 * captured for audit only -- nothing in the app code read them.
 *
 * This module is the read layer. Provides typed access + defaults so
 * call sites don't have to know about the underlying JSON shape and
 * stay safe even when the admin hasn't completed onboarding yet
 * (e.g. fresh dev workspace -- everything falls back to sane defaults).
 *
 * Slice 10 wires three knobs into existing code paths:
 *   - aiTone        -> outreach drafting prompt
 *   - approvalMode  -> cadence runner (auto-send vs queue for approval)
 *   - dailySendCap  -> cadence cron caps daily scheduled items per channel
 *
 * Future slices can read more fields (compliance.unsubscribeMode for
 * the SMS adapter, integrations[] for auto-connect prompts on the
 * dashboard, etc.) without changing this module's surface.
 *
 * Node-only.
 */
import { getBackend } from "@/lib/store";

const WORKSPACE_CONFIG_FILE = "workspace-config.json";

export type AiTone = "warm-friendly" | "professional" | "formal" | "direct";
export type AiAggressiveness = "conservative" | "balanced" | "aggressive";
export type ApprovalMode = "all" | "first-touch" | "high-stakes" | "none";
export type UnsubscribeMode = "auto" | "channel-only";

/**
 * Merged config: stored answers if present, otherwise defaults.
 * Every consumer should hit this rather than reading raw answers.
 */
export type WorkspaceConfig = {
  /** True when the admin actually completed onboarding. False = falling
   *  back to defaults (handy for testing / freshly bootstrapped workspaces). */
  configured: boolean;
  ownerEmail?: string;
  companyName?: string;
  // ── Identity / org ──────────────────────────────────────────────
  businessType?: string;
  headcount?: string;
  departments?: string[];
  primaryGoal?: string;
  // ── AI defaults ─────────────────────────────────────────────────
  aiTone: AiTone;
  aiAggressiveness: AiAggressiveness;
  languages: string[];
  // ── Outreach approval ───────────────────────────────────────────
  approvalMode: ApprovalMode;
  /** 0 = no cap. */
  dailySendCap: number;
  approvalNotify: boolean;
  // ── Compliance ──────────────────────────────────────────────────
  physicalAddress: boolean;
  unsubscribeMode: UnsubscribeMode;
  gdprMode: boolean;
  auditRetentionDays: number;
  // ── Integrations preference ─────────────────────────────────────
  integrations: string[];
  // ── Billing intent ──────────────────────────────────────────────
  plan?: string;
  billingEmail?: string;
  // ── Raw answers (escape hatch) ──────────────────────────────────
  /** Full answers map straight from the onboarding session. Useful
   *  when a future slice wants something we haven't promoted to a
   *  top-level field yet. */
  raw: Record<string, Record<string, unknown>>;
  updatedAt?: string;
};

const DEFAULTS: WorkspaceConfig = {
  configured: false,
  aiTone: "professional",
  aiAggressiveness: "balanced",
  languages: ["en"],
  approvalMode: "first-touch",
  dailySendCap: 0,
  approvalNotify: true,
  physicalAddress: true,
  unsubscribeMode: "auto",
  gdprMode: false,
  auditRetentionDays: 365,
  integrations: [],
  raw: {},
};

type StoredConfig = {
  id: string;
  ownerEmail?: string;
  companyName?: string;
  answers: Record<string, Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
  sessionId: string;
};

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function asArray(v: unknown): string[] | undefined {
  return Array.isArray(v) ? (v as string[]) : undefined;
}
function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v !== "") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  return fallback;
}

function mergeFromAnswers(
  raw: Record<string, Record<string, unknown>>,
): Partial<WorkspaceConfig> {
  const identity = raw.identity ?? {};
  const company = raw.company ?? {};
  const structure = raw.structure ?? {};
  const aiDefaults = raw.aiDefaults ?? {};
  const approval = raw.outreachApproval ?? {};
  const compliance = raw.compliance ?? {};
  const integrationsStep = raw.integrations ?? {};
  const billing = raw.billing ?? {};

  const tone = asString(aiDefaults.aiTone);
  const aggressiveness = asString(aiDefaults.aiAggressiveness);
  const approvalMode = asString(approval.approvalMode);
  const unsub = asString(compliance.unsubscribeMode);

  return {
    ownerEmail: asString(identity.email),
    companyName: asString(company.companyName),
    businessType: asString(company.businessType),
    headcount: asString(company.headcount),
    departments: asArray(structure.departments),
    primaryGoal: asString(structure.primaryGoal),
    aiTone:
      tone === "warm-friendly" || tone === "professional" || tone === "formal" || tone === "direct"
        ? tone
        : undefined,
    aiAggressiveness:
      aggressiveness === "conservative" || aggressiveness === "balanced" || aggressiveness === "aggressive"
        ? aggressiveness
        : undefined,
    languages: asArray(aiDefaults.languages),
    approvalMode:
      approvalMode === "all" || approvalMode === "first-touch" || approvalMode === "high-stakes" || approvalMode === "none"
        ? approvalMode
        : undefined,
    dailySendCap: asNumber(approval.dailySendCap),
    approvalNotify: asBool(approval.approvalNotify, DEFAULTS.approvalNotify),
    physicalAddress: asBool(compliance.physicalAddress, DEFAULTS.physicalAddress),
    unsubscribeMode: unsub === "auto" || unsub === "channel-only" ? unsub : undefined,
    gdprMode: asBool(compliance.gdprMode, DEFAULTS.gdprMode),
    auditRetentionDays: asNumber(compliance.auditRetentionDays),
    integrations: asArray(integrationsStep.integrations),
    plan: asString(billing.plan),
    billingEmail: asString(billing.billingEmail),
  };
}

// Light in-process cache so hot paths (every cadence tick, every
// outreach draft) don't repeatedly hit the store. 60s TTL is short
// enough that operator config edits feel snappy + long enough to
// matter at scale.
let _cache: { config: WorkspaceConfig; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function getWorkspaceConfig(): Promise<WorkspaceConfig> {
  if (_cache && Date.now() < _cache.expiresAt) return _cache.config;

  const all = await getBackend().read<StoredConfig[]>(WORKSPACE_CONFIG_FILE, []);
  const primary = all.find((c) => c.id === "primary");
  if (!primary) {
    _cache = { config: DEFAULTS, expiresAt: Date.now() + CACHE_TTL_MS };
    return DEFAULTS;
  }
  const merged = mergeFromAnswers(primary.answers ?? {});
  const config: WorkspaceConfig = {
    ...DEFAULTS,
    ...Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined)),
    configured: true,
    ownerEmail: primary.ownerEmail ?? merged.ownerEmail,
    companyName: primary.companyName ?? merged.companyName,
    raw: primary.answers ?? {},
    updatedAt: primary.updatedAt,
  } as WorkspaceConfig;
  _cache = { config, expiresAt: Date.now() + CACHE_TTL_MS };
  return config;
}

/**
 * Patch one or more workspace-config fields without re-running the
 * onboarding flow. Used by /admin/workspace-config to let the operator
 * tweak settings post-onboarding.
 *
 * Writes back to workspace-config.json by patching the stored answers
 * map at the matching step+question id (so re-reads see the change
 * via the same mergeFromAnswers code path).
 */
export async function patchWorkspaceConfig(
  patch: Partial<{
    aiTone: AiTone;
    aiAggressiveness: AiAggressiveness;
    approvalMode: ApprovalMode;
    dailySendCap: number;
    approvalNotify: boolean;
    unsubscribeMode: UnsubscribeMode;
    gdprMode: boolean;
    auditRetentionDays: number;
  }>,
): Promise<WorkspaceConfig> {
  const all = await getBackend().read<StoredConfig[]>(WORKSPACE_CONFIG_FILE, []);
  const idx = all.findIndex((c) => c.id === "primary");

  // Resolve a stored config or bootstrap a minimal one for fresh workspaces
  const now = new Date().toISOString();
  const base: StoredConfig = idx === -1
    ? {
        id: "primary",
        answers: {},
        createdAt: now,
        updatedAt: now,
        sessionId: "operator-edit",
      }
    : all[idx];

  // Map each patched key back to its (step, question) location in the
  // onboarding answer map so getWorkspaceConfig() picks it up unchanged.
  const newAnswers = JSON.parse(JSON.stringify(base.answers)) as Record<string, Record<string, unknown>>;
  function set(stepId: string, qid: string, v: unknown) {
    if (!newAnswers[stepId]) newAnswers[stepId] = {};
    newAnswers[stepId][qid] = v;
  }
  if (patch.aiTone !== undefined) set("aiDefaults", "aiTone", patch.aiTone);
  if (patch.aiAggressiveness !== undefined) set("aiDefaults", "aiAggressiveness", patch.aiAggressiveness);
  if (patch.approvalMode !== undefined) set("outreachApproval", "approvalMode", patch.approvalMode);
  if (patch.dailySendCap !== undefined) set("outreachApproval", "dailySendCap", patch.dailySendCap);
  if (patch.approvalNotify !== undefined) set("outreachApproval", "approvalNotify", patch.approvalNotify);
  if (patch.unsubscribeMode !== undefined) set("compliance", "unsubscribeMode", patch.unsubscribeMode);
  if (patch.gdprMode !== undefined) set("compliance", "gdprMode", patch.gdprMode);
  if (patch.auditRetentionDays !== undefined) set("compliance", "auditRetentionDays", patch.auditRetentionDays);

  const updated: StoredConfig = {
    ...base,
    answers: newAnswers,
    updatedAt: now,
  };
  const next = idx === -1 ? [updated, ...all] : all.map((c, i) => (i === idx ? updated : c));
  await getBackend().write(WORKSPACE_CONFIG_FILE, next);
  // Bust cache so the next read returns the new value
  _cache = null;
  return getWorkspaceConfig();
}

/**
 * Translate the AI tone enum into the prompt-tone instruction line
 * that gets injected into outreach + agent prompts.
 *
 * Why a function rather than a static map: lets us evolve the wording
 * (e.g. add language preferences from config.languages) in one place
 * without touching every prompt builder.
 */
export function toneInstructionFor(config: WorkspaceConfig): string {
  switch (config.aiTone) {
    case "warm-friendly":
      return "Use a warm, conversational tone. First-name basis. Light emoji sparingly (one max). Sound like a friendly founder reaching out, not a sales pitch.";
    case "professional":
      return "Use a polished but not stiff tone. Business casual. No emoji. Conversational verbs.";
    case "formal":
      return "Use a formal, enterprise tone. Last names unless reciprocated. No contractions. No emoji. Precise word choice.";
    case "direct":
      return "Be direct and concise. Two sentences max per paragraph. No hedging language ('I think', 'maybe', 'just'). Get to the ask immediately.";
  }
}

/**
 * Whether a given outreach touch should land in the approvals queue
 * (status="draft" -- operator must hit Send) vs auto-send.
 *
 * Decision matrix:
 *   approvalMode="all"          -> always require approval
 *   approvalMode="none"         -> never require approval
 *   approvalMode="first-touch"  -> require approval on first touch only;
 *                                  follow-ups (cadence step > 0) auto-send
 *   approvalMode="high-stakes"  -> require approval when buyerRevenueTier
 *                                  is large; small buyers auto-send
 */
export function requiresApproval(args: {
  config: WorkspaceConfig;
  isFirstTouch: boolean;
  buyerRevenueTier?: "small" | "medium" | "large";
}): boolean {
  switch (args.config.approvalMode) {
    case "all":
      return true;
    case "none":
      return false;
    case "first-touch":
      return args.isFirstTouch;
    case "high-stakes":
      return args.buyerRevenueTier === "large";
  }
}
