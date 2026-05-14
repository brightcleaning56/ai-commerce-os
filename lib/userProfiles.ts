/**
 * Per-user profile records — server-side display data for non-Owner
 * sessions. Lets invitees set their own name + phone instead of being
 * stuck with just an email forever.
 *
 * Why this exists separately from the Invite store:
 *   - Invite is the identity contract (email + role + token claims).
 *     It's signed; we never let users mutate it.
 *   - UserProfile is the editable display layer (name, phone,
 *     avatar color). Mutating it has no security implications because
 *     it's purely cosmetic — the auth subject still comes from the
 *     HMAC-signed token.
 *
 * Key strategy: the token's `sub` (invite id) is the stable join.
 * Email could change in theory; the invite id can't. So profiles are
 * keyed by sub.
 *
 * Owner profile is NOT stored here — that comes from OPERATOR_*
 * env vars via lib/operator.ts and is read-only at runtime.
 *
 * Node-only. Don't call from edge middleware.
 */
import { getBackend } from "./store";

const PROFILES_FILE = "user-profiles.json";

export type UserProfile = {
  /** Token sub (invite id). Stable join key. */
  sub: string;
  /** Email at the time the profile was created, for display fallback. */
  email: string;
  /** What this user wants to be called. Replaces email in the UI when set. */
  displayName?: string;
  /** Optional contact phone — surfaced in admin/users + future CRM. */
  phone?: string;
  /** 2-char initials for avatars (defaults to first 1-2 of displayName/email). */
  initials?: string;
  /** Tailwind-friendly color seed for the avatar background. */
  avatarColor?: string;
  /** ISO. */
  createdAt: string;
  updatedAt: string;
};

type ProfileMap = Record<string, UserProfile>;

async function readMap(): Promise<ProfileMap> {
  const raw = await getBackend().read<ProfileMap>(PROFILES_FILE, {});
  // Defensive: drop entries that don't match the shape (stale schemas).
  const safe: ProfileMap = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v && typeof v === "object" && typeof v.sub === "string" && typeof v.email === "string") {
      safe[k] = v;
    }
  }
  return safe;
}

async function writeMap(m: ProfileMap): Promise<void> {
  await getBackend().write(PROFILES_FILE, m);
}

export const userProfiles = {
  async get(sub: string): Promise<UserProfile | null> {
    if (!sub) return null;
    const map = await readMap();
    return map[sub] ?? null;
  },

  async list(): Promise<UserProfile[]> {
    const map = await readMap();
    return Object.values(map).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  },

  /**
   * Upsert a profile. Validates + sanitizes inputs (length caps, etc.).
   * Always preserves sub + createdAt; bumps updatedAt.
   */
  async upsert(sub: string, email: string, patch: Partial<Omit<UserProfile, "sub" | "createdAt" | "updatedAt">>): Promise<UserProfile> {
    if (!sub) throw new Error("sub is required");
    const map = await readMap();
    const now = new Date().toISOString();
    const existing = map[sub];
    // Spread existing first, then identity fields override, then patch
    // overrides display fields. Identity fields (sub, email, createdAt,
    // updatedAt) MUST come after `...existing` so the explicit values
    // win — otherwise the spread's later properties would shadow them.
    const next: UserProfile = {
      ...existing,
      sub,
      email: email.toLowerCase(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      // Patch wins where defined; falls through to existing where not.
      // Length caps prevent a malicious client from blowing up the JSON.
      displayName: patch.displayName !== undefined
        ? patch.displayName.trim().slice(0, 80) || undefined
        : existing?.displayName,
      phone: patch.phone !== undefined
        ? patch.phone.trim().slice(0, 40) || undefined
        : existing?.phone,
      initials: patch.initials !== undefined
        ? patch.initials.trim().slice(0, 4).toUpperCase() || undefined
        : existing?.initials,
      avatarColor: patch.avatarColor !== undefined
        ? patch.avatarColor.trim().slice(0, 20) || undefined
        : existing?.avatarColor,
    };
    map[sub] = next;
    await writeMap(map);
    return next;
  },
};

/**
 * Compute a sensible default initials value from displayName or email.
 * Used by the API layer when the client doesn't provide one explicitly.
 */
export function defaultInitialsFor(profile: Pick<UserProfile, "displayName" | "email">): string {
  if (profile.displayName) {
    const parts = profile.displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  }
  return (profile.email[0] ?? "?").toUpperCase();
}
