"use client";
import { Activity, Loader2, Users } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Onboarding completion metrics for /admin/system-health (slice 26).
 *
 * Renders a compact card with:
 *   - completion rate %
 *   - abandon rate %
 *   - avg time to complete (mins)
 *   - per-persona completion bars
 *   - "stuck on" most common active step
 *
 * Self-fetches /api/admin/onboarding-metrics on mount + every 60s.
 * Hides quietly when there are zero sessions (fresh workspace).
 */

type Metrics = {
  total: number;
  completedCount: number;
  abandonedCount: number;
  activeCount: number;
  completionRate: number;
  abandonRate: number;
  avgCompletionMinutes: number;
  byPersona: Array<{
    persona: string;
    total: number;
    completed: number;
    completionRate: number;
  }>;
  stuckSteps: Array<{ persona: string; stepId: string; count: number }>;
};

export default function OnboardingMetricsCard() {
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    function load() {
      setLoading(true);
      fetch("/api/admin/onboarding-metrics", { cache: "no-store", credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled) return;
          if (d) setData(d);
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
    }
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (loading && !data) {
    return (
      <div className="rounded-xl border border-bg-border bg-bg-card p-4">
        <div className="flex items-center gap-2 text-[12px] text-ink-tertiary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading onboarding metrics...
        </div>
      </div>
    );
  }
  if (!data || data.total === 0) return null;

  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-ink-secondary" />
          <h3 className="text-sm font-semibold">Onboarding metrics</h3>
        </div>
        <a
          href="/admin/onboarding-sessions"
          className="text-[11px] text-accent-blue hover:underline"
        >
          Open sessions →
        </a>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Total" value={String(data.total)} />
        <Stat label="Completion" value={pct(data.completionRate)} tone="green" />
        <Stat label="Abandon" value={pct(data.abandonRate)} tone={data.abandonRate > 0.3 ? "red" : "muted"} />
        <Stat label="Avg time (mins)" value={String(data.avgCompletionMinutes)} />
      </div>

      <div className="mt-4">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
          Per-persona
        </div>
        <div className="space-y-1.5">
          {data.byPersona
            .filter((p) => p.total > 0)
            .map((p) => (
              <div key={p.persona} className="flex items-center gap-2 text-[11px]">
                <Users className="h-3 w-3 shrink-0 text-ink-tertiary" />
                <span className="w-20 capitalize text-ink-secondary">{p.persona}</span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-bg-app">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-accent-green"
                    style={{ width: `${p.completionRate * 100}%` }}
                  />
                </div>
                <span className="w-16 text-right font-mono text-[10px] text-ink-tertiary">
                  {p.completed}/{p.total} ({pct(p.completionRate)})
                </span>
              </div>
            ))}
        </div>
      </div>

      {data.stuckSteps.length > 0 && (
        <div className="mt-4 border-t border-bg-border pt-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
            Most-stuck step (active sessions)
          </div>
          <ul className="space-y-1">
            {data.stuckSteps.map((s) => (
              <li
                key={`${s.persona}-${s.stepId}`}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span>
                  <span className="capitalize text-ink-secondary">{s.persona}</span>
                  <span className="text-ink-tertiary"> · </span>
                  <span className="font-mono text-ink-primary">{s.stepId}</span>
                </span>
                <span className="font-mono text-ink-tertiary">
                  {s.count} session{s.count === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red" | "muted";
}) {
  const valueColor =
    tone === "green"
      ? "text-accent-green"
      : tone === "red"
        ? "text-accent-red"
        : "text-ink-primary";
  return (
    <div className="rounded-md border border-bg-border bg-bg-app px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-bold tabular-nums ${valueColor}`}>{value}</div>
    </div>
  );
}
