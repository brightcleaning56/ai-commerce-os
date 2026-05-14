"use client";
import {
  ArrowRight,
  Building2,
  Factory,
  Loader2,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  PERSONA_DESCRIPTION,
  PERSONA_LABEL,
  PERSONAS,
  type Persona,
} from "@/lib/onboarding";

/**
 * /onboarding/start — persona chooser.
 *
 * Replaces "fill out our 3-step lead form" with "tell us who you are
 * so we can hand you the right setup track." Five tracks:
 *   admin -> /onboarding/admin       (slice 2)
 *   team -> /onboarding/team         (slice 3)
 *   buyer -> /onboarding/buyer       (slice 4)
 *   supplier -> /onboarding/supplier (slice 5)
 *   distributor -> /onboarding/distributor (slice 6)
 *
 * Slice 1 ships the chooser + a placeholder destination per persona
 * (engine renders one stub step per flow). Slices 2-6 fill in the
 * real question banks.
 *
 * On selection: POSTs /api/onboarding/start with {persona}, gets back
 * a session cookie, then routes to /onboarding/<persona>.
 */

const PERSONA_ICON: Record<Persona, typeof Building2> = {
  admin: Building2,
  team: Users,
  buyer: ShoppingCart,
  supplier: Factory,
  distributor: Truck,
};

const PERSONA_TONE: Record<Persona, string> = {
  admin: "from-violet-500/10 to-violet-500/0 border-violet-500/30 hover:border-violet-500/60",
  team: "from-blue-500/10 to-blue-500/0 border-blue-500/30 hover:border-blue-500/60",
  buyer: "from-emerald-500/10 to-emerald-500/0 border-emerald-500/30 hover:border-emerald-500/60",
  supplier: "from-amber-500/10 to-amber-500/0 border-amber-500/30 hover:border-amber-500/60",
  distributor: "from-cyan-500/10 to-cyan-500/0 border-cyan-500/30 hover:border-cyan-500/60",
};

export default function OnboardingStartPage() {
  const router = useRouter();
  const [picking, setPicking] = useState<Persona | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(persona: Persona) {
    setPicking(persona);
    setError(null);
    try {
      const r = await fetch("/api/onboarding/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Couldn't start onboarding (${r.status})`);
      }
      router.push(`/onboarding/${persona}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start onboarding");
      setPicking(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
          Setup · Step 1 of 2
        </div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Set up your AI business infrastructure
        </h1>
        <p className="mt-2 text-sm text-ink-secondary">
          Pick the role that fits — we'll tailor the setup track and skip
          questions that don't apply. You can always change your mind
          later.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {PERSONAS.map((p) => {
          const Icon = PERSONA_ICON[p];
          const tone = PERSONA_TONE[p];
          const busy = picking === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => void pick(p)}
              disabled={picking !== null}
              className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br p-5 text-left transition-all hover:shadow-lg disabled:opacity-50 ${tone}`}
            >
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-bg-app">
                  <Icon className="h-5 w-5 text-ink-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-ink-primary">
                      {PERSONA_LABEL[p]}
                    </span>
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-tertiary" />
                    ) : (
                      <ArrowRight className="h-3.5 w-3.5 -translate-x-1 text-ink-tertiary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                    )}
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-secondary">
                    {PERSONA_DESCRIPTION[p]}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-8 text-center text-[11px] text-ink-tertiary">
        Already have an invite link from your team?{" "}
        <span className="text-ink-secondary">
          Open the link in your email — you'll skip this step.
        </span>
      </p>
    </div>
  );
}
