"use client";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  DollarSign,
  Eye,
  FileText,
  Flame,
  Loader2,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Priority = "critical" | "high" | "medium" | "low";
type Source = "negotiation" | "engagement" | "followup" | "quote" | "risk";

type Suggestion = {
  id: string;
  source: Source;
  priority: Priority;
  ts: string;
  title: string;
  detail: string;
  action: string;
  href?: string;
  draftId?: string;
  quoteId?: string;
  riskId?: string;
};

type Response = {
  suggestions: Suggestion[];
  counts: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    bySource: Record<Source, number>;
  };
};

const PRIORITY_TONE: Record<Priority, string> = {
  critical: "border-accent-red/30 bg-accent-red/5",
  high: "border-accent-amber/30 bg-accent-amber/5",
  medium: "border-brand-500/30 bg-brand-500/5",
  low: "border-bg-border bg-bg-card",
};

const PRIORITY_BADGE: Record<Priority, string> = {
  critical: "bg-accent-red/15 text-accent-red",
  high: "bg-accent-amber/15 text-accent-amber",
  medium: "bg-brand-500/15 text-brand-200",
  low: "bg-bg-hover text-ink-secondary",
};

const SOURCE_ICON: Record<Source, React.ComponentType<{ className?: string }>> = {
  negotiation: Bot,
  engagement: Flame,
  followup: Send,
  quote: DollarSign,
  risk: ShieldAlert,
};

export default function SuggestionsPage() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Priority | Source>("all");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  async function load() {
    try {
      const res = await fetch("/api/suggestions");
      if (res.ok) setData(await res.json());
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  // Persist dismissals in localStorage so the queue is "actionable" across reloads
  useEffect(() => {
    try {
      const raw = localStorage.getItem("aicos:suggestions-dismissed");
      if (raw) setDismissed(new Set(JSON.parse(raw)));
    } catch {}
  }, []);

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem("aicos:suggestions-dismissed", JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  }

  function unhide() {
    setDismissed(new Set());
    try {
      localStorage.removeItem("aicos:suggestions-dismissed");
    } catch {}
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.suggestions.filter((s) => {
      if (dismissed.has(s.id)) return false;
      if (filter === "all") return true;
      if (filter === "critical" || filter === "high" || filter === "medium" || filter === "low") {
        return s.priority === filter;
      }
      return s.source === filter;
    });
  }, [data, filter, dismissed]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Suggested actions</h1>
            <p className="text-xs text-ink-secondary">
              Unified queue of every AI recommendation across drafts, quotes, engagement, and risk
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dismissed.size > 0 && (
            <button
              onClick={unhide}
              className="text-[11px] text-ink-tertiary hover:text-ink-primary"
            >
              Unhide ({dismissed.size})
            </button>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card px-2.5 py-1.5 text-xs hover:bg-bg-hover disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PriorityCard label="Critical" v={data?.counts.critical ?? 0} tone="red" />
        <PriorityCard label="High" v={data?.counts.high ?? 0} tone="amber" />
        <PriorityCard label="Medium" v={data?.counts.medium ?? 0} tone="brand" />
        <PriorityCard label="Low" v={data?.counts.low ?? 0} />
      </div>

      <div className="rounded-xl border border-bg-border bg-bg-card p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ["all", `All (${data?.counts.total ?? 0})`],
              ["critical", "Critical"],
              ["high", "High"],
              ["medium", "Medium"],
              ["low", "Low"],
              ["negotiation", `Negotiation (${data?.counts.bySource.negotiation ?? 0})`],
              ["engagement", `Engagement (${data?.counts.bySource.engagement ?? 0})`],
              ["followup", `Follow-up (${data?.counts.bySource.followup ?? 0})`],
              ["quote", `Quote (${data?.counts.bySource.quote ?? 0})`],
              ["risk", `Risk (${data?.counts.bySource.risk ?? 0})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key as typeof filter)}
              className={`rounded-md px-2.5 py-1 text-[11px] capitalize ${
                filter === key
                  ? "bg-brand-500/15 text-brand-200"
                  : "bg-bg-hover/40 text-ink-secondary hover:bg-bg-hover"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-bg-border bg-bg-card px-5 py-12 text-center text-sm text-ink-tertiary">
            {data?.counts.total === 0
              ? "Inbox zero. Nothing to action right now."
              : "No suggestions match this filter. Try \"All\" or check the dismissed list."}
          </div>
        )}
        {filtered.map((s) => {
          const Icon = SOURCE_ICON[s.source];
          return (
            <div
              key={s.id}
              className={`rounded-xl border p-4 ${PRIORITY_TONE[s.priority]}`}
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bg-card">
                  <Icon className="h-4 w-4 text-brand-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink-primary">{s.title}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PRIORITY_BADGE[s.priority]}`}
                    >
                      {s.priority}
                    </span>
                    <span className="rounded bg-bg-hover/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-tertiary">
                      {s.source}
                    </span>
                    <span className="text-[11px] text-ink-tertiary">{relTime(s.ts)}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-secondary">{s.detail}</p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {s.href && (
                      <Link
                        href={s.href}
                        className="flex items-center gap-1.5 rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow"
                      >
                        {s.action} <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                    <button
                      onClick={() => dismiss(s.id)}
                      className="rounded-md border border-bg-border bg-bg-card px-2.5 py-1.5 text-[11px] text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PriorityCard({
  label,
  v,
  tone,
}: {
  label: string;
  v: number;
  tone?: "red" | "amber" | "brand";
}) {
  const toneClass =
    tone === "red"
      ? "border-accent-red/30 bg-accent-red/5"
      : tone === "amber"
      ? "border-accent-amber/30 bg-accent-amber/5"
      : tone === "brand"
      ? "border-brand-500/30 bg-brand-500/5"
      : "border-bg-border bg-bg-card";
  const numTone =
    tone === "red"
      ? "text-accent-red"
      : tone === "amber"
      ? "text-accent-amber"
      : tone === "brand"
      ? "text-brand-200"
      : "";
  return (
    <div className={`rounded-xl border ${toneClass} p-4`}>
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${numTone}`}>{v}</div>
    </div>
  );
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}
