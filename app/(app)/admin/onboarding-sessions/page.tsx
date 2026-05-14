"use client";
import {
  Building2,
  CheckCircle2,
  Circle,
  Clock,
  Factory,
  FileText,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  ShoppingCart,
  Truck,
  Users,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * /admin/onboarding-sessions — operator-facing real-time view of
 * every onboarding session.
 *
 * Lets the operator:
 *   - See who's in flight + who's stuck on which step
 *   - Drill into a single session to inspect answers + uploaded docs
 *   - Spot completed sessions that still need verification follow-up
 *   - Delete spam / test sessions
 *
 * Auto-refreshes every 30s so a teammate's flow shows up live.
 */

type Persona = "admin" | "team" | "buyer" | "supplier" | "distributor";
type Status = "active" | "completed" | "abandoned";

type EnrichedSession = {
  id: string;
  persona: Persona | null;
  status: Status;
  email?: string;
  currentStepId: string | null;
  emailVerified: boolean;
  documentCount: number;
  documentKinds: string[];
  stepCount: number;
  answerCount: number;
  resultUserId?: string;
  resultRole?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

type Summary = {
  total: number;
  active: number;
  completed: number;
  abandoned: number;
  byPersona: Record<Persona, number>;
};

const PERSONA_ICON: Record<Persona, typeof Building2> = {
  admin: Building2,
  team: Users,
  buyer: ShoppingCart,
  supplier: Factory,
  distributor: Truck,
};

const PERSONA_LABEL: Record<Persona, string> = {
  admin: "Admin",
  team: "Team",
  buyer: "Buyer",
  supplier: "Supplier",
  distributor: "Distributor",
};

const STATUS_TONE: Record<Status, string> = {
  active: "bg-accent-blue/15 text-accent-blue",
  completed: "bg-accent-green/15 text-accent-green",
  abandoned: "bg-bg-hover text-ink-tertiary",
};

const STATUS_ICON: Record<Status, typeof Circle> = {
  active: Clock,
  completed: CheckCircle2,
  abandoned: XCircle,
};

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function OnboardingSessionsPage() {
  const [sessions, setSessions] = useState<EnrichedSession[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [personaFilter, setPersonaFilter] = useState<Persona | "all">("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (personaFilter !== "all") params.set("persona", personaFilter);
      const r = await fetch(`/api/admin/onboarding-sessions?${params}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Load failed (${r.status})`);
      }
      const d = await r.json();
      setSessions(d.sessions ?? []);
      setSummary(d.summary ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load sessions");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, personaFilter]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.trim().toLowerCase();
    return sessions.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.persona?.toLowerCase().includes(q) ||
        s.currentStepId?.toLowerCase().includes(q),
    );
  }, [sessions, search]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Onboarding sessions</h1>
          <p className="text-[12px] text-ink-tertiary">
            Real-time view of who's onboarding right now, who completed, and who bailed.
            Auto-refreshes every 30s.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-card px-2.5 py-1.5 text-[12px] text-ink-secondary hover:bg-bg-hover disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Headline tiles */}
      {summary && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Tile label="Total" value={summary.total} />
          <Tile label="Active" value={summary.active} tone="blue" Icon={Clock} />
          <Tile label="Completed" value={summary.completed} tone="green" Icon={CheckCircle2} />
          <Tile label="Abandoned" value={summary.abandoned} tone="muted" Icon={XCircle} />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-bg-border bg-bg-card p-3">
        <Pill label="All" active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
        <Pill label={`Active${summary ? ` (${summary.active})` : ""}`} active={statusFilter === "active"} onClick={() => setStatusFilter("active")} />
        <Pill label={`Completed${summary ? ` (${summary.completed})` : ""}`} active={statusFilter === "completed"} onClick={() => setStatusFilter("completed")} />
        <Pill label={`Abandoned${summary ? ` (${summary.abandoned})` : ""}`} active={statusFilter === "abandoned"} onClick={() => setStatusFilter("abandoned")} />
        <span className="mx-1 h-5 w-px bg-bg-border" />
        <Pill label="All personas" active={personaFilter === "all"} onClick={() => setPersonaFilter("all")} />
        {(["admin", "team", "buyer", "supplier", "distributor"] as Persona[]).map((p) => {
          const Icon = PERSONA_ICON[p];
          return (
            <Pill
              key={p}
              label={`${PERSONA_LABEL[p]}${summary ? ` (${summary.byPersona[p]})` : ""}`}
              Icon={Icon}
              active={personaFilter === p}
              onClick={() => setPersonaFilter(p)}
            />
          );
        })}
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
          <input
            type="search"
            placeholder="Search id / email / step..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-64 rounded-md border border-bg-border bg-bg-app pl-7 pr-2 text-[12px] placeholder:text-ink-tertiary focus:outline-none focus:ring-1 focus:ring-accent-blue/50"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          {error}
        </div>
      )}

      {/* List */}
      {loading && sessions.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-ink-tertiary">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading sessions...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-bg-border bg-bg-card p-10 text-center">
          <Mail className="mx-auto mb-3 h-8 w-8 text-ink-tertiary/60" />
          <div className="text-sm font-semibold">No sessions match</div>
          <p className="mt-1 text-[12px] text-ink-tertiary">
            {sessions.length > 0
              ? "All sessions hidden by current filters."
              : "No one has hit /onboarding/start yet."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
          <table className="w-full text-[12px]">
            <thead className="border-b border-bg-border bg-bg-app/40 text-[10px] uppercase tracking-wider text-ink-tertiary">
              <tr>
                <th className="px-3 py-2 text-left">Persona</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Last step</th>
                <th className="px-3 py-2 text-right">Verify</th>
                <th className="px-3 py-2 text-right">Docs</th>
                <th className="px-3 py-2 text-right">Answers</th>
                <th className="px-3 py-2 text-right">Updated</th>
                <th className="px-3 py-2 text-right">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const StatusIcon = STATUS_ICON[s.status];
                const Icon = s.persona ? PERSONA_ICON[s.persona] : Circle;
                return (
                  <tr key={s.id} className="border-b border-bg-border/40 last:border-0 hover:bg-bg-hover">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-ink-secondary" />
                        <span>{s.persona ? PERSONA_LABEL[s.persona] : "—"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-secondary">
                      {s.email ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_TONE[s.status]}`}>
                        <StatusIcon className="h-3 w-3" />
                        {s.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-ink-tertiary">
                      {s.currentStepId ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {s.emailVerified ? (
                        <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-accent-green" />
                      ) : (
                        <Circle className="ml-auto h-3.5 w-3.5 text-ink-tertiary" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {s.documentCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-ink-secondary">
                          <FileText className="h-3 w-3" />
                          {s.documentCount}
                        </span>
                      ) : (
                        <span className="text-ink-tertiary">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">
                      {s.answerCount}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[10px] text-ink-tertiary">
                      {relTime(s.updatedAt)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/onboarding-sessions/${s.id}`}
                        className="rounded-md border border-bg-border bg-bg-app px-2 py-0.5 text-[11px] text-ink-secondary hover:bg-bg-hover"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
  Icon,
}: {
  label: string;
  value: number;
  tone?: "blue" | "green" | "muted";
  Icon?: React.ComponentType<{ className?: string }>;
}) {
  const toneClass =
    tone === "blue"
      ? "border-accent-blue/40 bg-accent-blue/5"
      : tone === "green"
      ? "border-accent-green/40 bg-accent-green/5"
      : tone === "muted"
      ? "border-bg-border bg-bg-card"
      : "border-bg-border bg-bg-card";
  const iconTone =
    tone === "blue" ? "text-accent-blue" : tone === "green" ? "text-accent-green" : "text-ink-tertiary";
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 ${toneClass}`}>
      {Icon && <Icon className={`h-4 w-4 ${iconTone}`} />}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">{label}</div>
        <div className="text-lg font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function Pill({
  label,
  Icon,
  active,
  onClick,
}: {
  label: string;
  Icon?: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? "border-accent-blue/50 bg-accent-blue/10 text-accent-blue"
          : "border-bg-border bg-bg-app text-ink-secondary hover:bg-bg-hover"
      }`}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {label}
    </button>
  );
}
