"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * Client-side mirror of the server's capability gate.
 *
 * On mount, fetches /api/auth/me once and exposes:
 *   - role: "Owner" | "Admin" | ... | "Viewer"
 *   - capabilities: Set<string>  e.g. "transactions:read"
 *   - isOwner: true if signed in via ADMIN_TOKEN
 *   - can(cap): true if Owner OR cap is in the set
 *   - loading: while the initial /me fetch is in flight
 *
 * Consumers:
 *   - Sidebar uses `can(item.requires)` to filter nav items
 *   - Page components can use `useCapability("voice:write")` to hide
 *     buttons the server will reject
 *
 * Failure semantics: if /me 401s (no session) or 5xxs, capabilities
 * is empty and `can(*)` is false. Sidebar then shows only the
 * Command Center + Settings (no `requires`).
 */

export type MeResponse = {
  role: string;
  email: string;
  name: string | null;
  capabilities: string[];
  isOwner: boolean;
  isDev: boolean;
};

type Ctx = {
  loading: boolean;
  error: string | null;
  me: MeResponse | null;
  can: (cap?: string) => boolean;
  refresh: () => Promise<void>;
};

const CapabilityCtx = createContext<Ctx | null>(null);

export function CapabilityProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/me", { cache: "no-store" });
      if (!r.ok) {
        // 401 = signed out; treat as empty capability set rather than
        // an error banner (middleware will already have redirected the
        // browser if we're on a protected page).
        if (r.status === 401) {
          setMe(null);
          return;
        }
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `me failed (${r.status})`);
      }
      const d = (await r.json()) as MeResponse;
      setMe(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load identity");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const value = useMemo<Ctx>(() => {
    const set = new Set(me?.capabilities ?? []);
    return {
      loading,
      error,
      me,
      // Owner short-circuit: true for any capability check, including
      // unknown ones (forward-compat: new caps default to allowed for
      // Owner without a re-deploy of the client).
      can: (cap?: string) => {
        if (!cap) return true;
        if (me?.isOwner) return true;
        return set.has(cap);
      },
      refresh: load,
    };
  }, [me, loading, error]);

  return <CapabilityCtx.Provider value={value}>{children}</CapabilityCtx.Provider>;
}

export function useCapabilities(): Ctx {
  const v = useContext(CapabilityCtx);
  if (!v) {
    // Defensive default: never throw if used outside the provider.
    // Most pages mount under (app)/layout.tsx which wraps us, but
    // someone might use the hook from a route that doesn't (e.g.
    // an admin tool page mounted at the root).
    return {
      loading: false,
      error: null,
      me: null,
      can: () => false,
      refresh: async () => undefined,
    };
  }
  return v;
}

/**
 * Convenience hook for single-capability checks.
 *   const canVoiceWrite = useCapability("voice:write");
 *   {canVoiceWrite && <PlaceCallButton />}
 */
export function useCapability(cap: string): boolean {
  const { can } = useCapabilities();
  return can(cap);
}
