/**
 * Per-session onboarding state -- the resume-later layer.
 *
 * One OnboardingSession per browser cookie. Stores:
 *   - chosen persona
 *   - current step id
 *   - answers (keyed step id -> { questionId -> value })
 *   - verification flags (email verified, docs uploaded -- slice 7)
 *   - completion state
 *
 * Cookie: `avyn_onboarding=<sessionId>`. 30-day TTL. Sessions with
 * status="completed" are kept 90 days for audit; status="active" past
 * 30 days are garbage-collected on the next list() call.
 *
 * Why a separate store rather than reusing Lead: a Lead is a sales
 * artifact ("we should follow up with these humans"), an
 * OnboardingSession is a setup artifact ("this person is configuring
 * their workspace"). Mixing them muddies both surfaces.
 *
 * Node-only.
 */
import crypto from "node:crypto";
import { isPersona, type Persona } from "@/lib/onboarding";
import { getBackend } from "@/lib/store";

const SESSIONS_FILE = "onboarding-sessions.json";
const MAX_RETAINED = 5000;
const ACTIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const COMPLETED_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type OnboardingStatus = "active" | "completed" | "abandoned";

export type OnboardingSession = {
  id: string;                                    // sess_<random>
  persona: Persona | null;                       // chosen on /onboarding/start
  status: OnboardingStatus;
  /** Map of stepId -> { questionId -> value }. Auto-saved per step. */
  answers: Record<string, Record<string, unknown>>;
  /** Step the user is currently on. Lets resume-later jump back. */
  currentStepId: string | null;
  /** Email captured during the flow -- used for magic-link verify. */
  email?: string;
  /** Verification flags (slice 7 wires the actual verifiers). */
  emailVerified?: boolean;
  documentsUploaded?: string[];                  // doc kinds, e.g. ["business-license", "insurance"]
  /** When status -> completed, what user/supplier id we minted. */
  resultUserId?: string;
  resultRole?: string;
  /** IP + UA at create-time for fraud triage. */
  ipHash?: string;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

function isSession(v: unknown): v is OnboardingSession {
  if (!v || typeof v !== "object") return false;
  const s = v as Partial<OnboardingSession>;
  return (
    typeof s.id === "string" &&
    typeof s.status === "string" &&
    typeof s.createdAt === "string"
  );
}

function newId(): string {
  return `sess_${crypto.randomBytes(12).toString("hex")}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export const onboardingSessions = {
  async list(): Promise<OnboardingSession[]> {
    const all = await getBackend().read<OnboardingSession[]>(SESSIONS_FILE, []);
    const safe = all.filter(isSession);
    // Lazy GC: drop expired actives + super-old completes
    const now = Date.now();
    const cleaned = safe.filter((s) => {
      const age = now - new Date(s.updatedAt).getTime();
      if (s.status === "completed") return age < COMPLETED_TTL_MS;
      return age < ACTIVE_TTL_MS;
    });
    if (cleaned.length !== safe.length) {
      await getBackend().write(SESSIONS_FILE, cleaned);
    }
    return cleaned;
  },

  async get(id: string): Promise<OnboardingSession | null> {
    return (await onboardingSessions.list()).find((s) => s.id === id) ?? null;
  },

  async create(input: {
    persona?: Persona | null;
    email?: string;
    ipHash?: string;
    userAgent?: string;
  }): Promise<OnboardingSession> {
    const persona = input.persona && isPersona(input.persona) ? input.persona : null;
    const session: OnboardingSession = {
      id: newId(),
      persona,
      status: "active",
      answers: {},
      currentStepId: null,
      email: input.email?.toLowerCase().trim().slice(0, 200),
      ipHash: input.ipHash,
      userAgent: input.userAgent?.slice(0, 200),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const existing = await onboardingSessions.list();
    const next = [session, ...existing].slice(0, MAX_RETAINED);
    await getBackend().write(SESSIONS_FILE, next);
    return session;
  },

  async patch(
    id: string,
    patch: Partial<Omit<OnboardingSession, "id" | "createdAt">>,
  ): Promise<OnboardingSession | null> {
    const existing = await onboardingSessions.list();
    const idx = existing.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const merged: OnboardingSession = {
      ...existing[idx],
      ...patch,
      id: existing[idx].id,
      createdAt: existing[idx].createdAt,
      updatedAt: nowIso(),
    };
    existing[idx] = merged;
    await getBackend().write(SESSIONS_FILE, existing);
    return merged;
  },

  /**
   * Merge new step answers into the existing answers map. Lets the
   * client send only what changed without overwriting other steps.
   */
  async saveAnswers(
    id: string,
    stepId: string,
    answers: Record<string, unknown>,
  ): Promise<OnboardingSession | null> {
    const session = await onboardingSessions.get(id);
    if (!session) return null;
    const merged = {
      ...session.answers,
      [stepId]: { ...(session.answers[stepId] ?? {}), ...answers },
    };
    return onboardingSessions.patch(id, {
      answers: merged,
      currentStepId: stepId,
    });
  },

  async complete(
    id: string,
    result: { userId?: string; role?: string },
  ): Promise<OnboardingSession | null> {
    return onboardingSessions.patch(id, {
      status: "completed",
      completedAt: nowIso(),
      resultUserId: result.userId,
      resultRole: result.role,
    });
  },

  async remove(id: string): Promise<boolean> {
    const existing = await onboardingSessions.list();
    const next = existing.filter((s) => s.id !== id);
    if (next.length === existing.length) return false;
    await getBackend().write(SESSIONS_FILE, next);
    return true;
  },
};

/**
 * Light helper for IP fingerprinting. Same approach as the existing
 * lead spam-triage path -- hash + truncate so we don't store raw IPs.
 */
export function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}
