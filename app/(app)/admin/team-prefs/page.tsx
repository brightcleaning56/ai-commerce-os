"use client";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * /admin/team-prefs — operator view of every teammate's onboarding
 * preferences (slice 3 captured these into team-prefs.json; slice 16
 * surfaces them).
 *
 * Lets the operator:
 *   - See who completed team onboarding + when
 *   - Audit per-teammate AI agent access + permission level
 *   - Review approval limits (slice 21+ enforces these in app code)
 *   - Spot teammates with no preferences set (need to nudge them
 *     through /onboarding/team)
 */

type AiPermission = "draft-only" | "auto-low-risk" | "fully-autonomous";

type Pref = {
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
  raw: { createdAt: string; updatedAt: string; sessionId: string };
};

type Summary = {
  total: number;
  byDepartment: Record<string, number>;
  byPermission: Record<string, number>;
};

const PERMISSION_TONE: Record<AiPermission, string> = {
  "draft-only": "bg-bg-hover text-ink-secondary",
  "auto-low-risk": "bg-accent-blue/15 text-accent-blue",
  "fully-autonomous": "bg-accent-amber/15 text-accent-amber",
};

const PERMISSION_LABEL: Record<AiPermission, string> = {
  "draft-only": "Draft only",
  "auto-low-risk": "Auto low-risk",
  "fully-autonomous": "Fully autonomous",
};

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function fmtMoney(n?: number): string {
  if (n == null) return "—";
  return `$${n.toLocaleString()}`;
}

export default function TeamPrefsPage() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/team-prefs", {
        cache: "no-store",
        credentials: "include",
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Load failed (${r.status})`);
      }
      const d = await r.json();
      setPrefs(d.prefs ?? []);
      setSummary(d.summary ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return prefs;
    const q = search.trim().toLowerCase();
    return prefs.filter(
      (p) =>
        p.email.toLowerCase().includes(q) ||
        p.fullName?.toLowerCase().includes(q) ||
        p.displayName?.toLowerCase().includes(q) ||
        p.department?.toLowerCase().includes(q),
    );
  }, [prefs, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team preferences</h1>
          <p className="text-[12px] text-ink-tertiary">
            Per-teammate onboarding answers — department, AI agent
            access, approval limits, communication channels. Surfaces
            slice-3 onboarding data. Slice 21+ wires limits into app
            enforcement.
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

      {summary && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Tile label="Teammates" value={summary.total} Icon={Users} />
          <Tile
            label="Draft-only"
            value={summary.byPermission["draft-only"] ?? 0}
            Icon={Clock}
          />
          <Tile
            label="Auto low-risk"
            value={summary.byPermission["auto-low-risk"] ?? 0}
            tone="blue"
            Icon={Bot}
          />
          <Tile
            label="Fully autonomous"
            value={summary.byPermission["fully-autonomous"] ?? 0}
            tone="amber"
            Icon={Bot}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-bg-border bg-bg-card p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
          <input
            type="search"
            placeholder="Search email / name / department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-md border border-bg-border bg-bg-app pl-7 pr-2 text-[12px] placeholder:text-ink-tertiary focus:outline-none focus:ring-1 focus:ring-accent-blue/50"
          />
        </div>
        <div className="text-[11px] text-ink-tertiary">
          {filtered.length} of {prefs.length}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {loading && prefs.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-ink-tertiary">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-bg-border bg-bg-card p-10 text-center">
          <Users className="mx-auto mb-3 h-8 w-8 text-ink-tertiary/60" />
          <div className="text-sm font-semibold">
            {prefs.length === 0 ? "No team preferences yet" : "No matches"}
          </div>
          <p className="mt-1 text-[12px] text-ink-tertiary">
            {prefs.length === 0
              ? "Teammates land here after they complete /onboarding/team."
              : "Adjust the search to see more."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <PrefCard key={p.email} pref={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PrefCard({ pref }: { pref: Pref }) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink-primary">
              {pref.fullName || pref.email}
            </span>
            <span className="font-mono text-[10px] text-ink-tertiary">{pref.email}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-tertiary">
            {pref.department && <span>· {pref.department}</span>}
            {pref.timezone && <span>· {pref.timezone}</span>}
            {pref.experience && <span>· {pref.experience}</span>}
            <span>· updated {relTime(pref.raw.updatedAt)}</span>
          </div>
        </div>
        <span
          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${PERMISSION_TONE[pref.aiPermission]}`}
        >
          {PERMISSION_LABEL[pref.aiPermission]}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
            AI agents granted
          </div>
          <div className="mt-1 text-[12px]">
            {pref.agents.length === 0 ? (
              <span className="text-ink-tertiary">None selected — defaults to all</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {pref.agents.map((a) => (
                  <span
                    key={a}
                    className="rounded-full border border-bg-border bg-bg-app px-2 py-0.5 text-[10px] text-ink-secondary"
                  >
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
            Workflows pinned
          </div>
          <div className="mt-1 text-[12px]">
            {pref.primaryWorkflows.length === 0 ? (
              <span className="text-ink-tertiary">None</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {pref.primaryWorkflows.map((w) => (
                  <span
                    key={w}
                    className="rounded-full border border-bg-border bg-bg-app px-2 py-0.5 text-[10px] text-ink-secondary"
                  >
                    {w}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
            Approval limits
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
            <div>
              <span className="text-ink-tertiary">Quote: </span>
              <span className="font-mono">{fmtMoney(pref.quoteApprovalCap)}</span>
            </div>
            <div>
              <span className="text-ink-tertiary">Discount: </span>
              <span className="font-mono">{pref.discountCap != null ? `${pref.discountCap}%` : "—"}</span>
            </div>
            <div>
              <span className="text-ink-tertiary">Refund: </span>
              <span className="font-mono">{fmtMoney(pref.refundCap)}</span>
            </div>
            <div>
              <span className="text-ink-tertiary">Daily touches: </span>
              <span className="font-mono">{pref.outreachVolumeCap ?? "—"}</span>
            </div>
          </div>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
            Communication
          </div>
          <div className="mt-1 text-[11px] text-ink-secondary">
            <div>
              <span className="text-ink-tertiary">Channels: </span>
              {pref.channels.length ? pref.channels.join(", ") : "—"}
            </div>
            <div className="mt-0.5">
              <span className="text-ink-tertiary">Quiet hours: </span>
              {pref.quietHours ?? "—"}
            </div>
            <div className="mt-0.5">
              <span className="text-ink-tertiary">Inbound calls: </span>
              {pref.incomingCallRouting ? (
                <span className="text-accent-green">
                  <CheckCircle2 className="inline h-3 w-3" /> Ring me
                </span>
              ) : (
                <span className="text-ink-tertiary">Off</span>
              )}
            </div>
          </div>
        </div>
      </div>
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
  tone?: "blue" | "amber";
  Icon?: React.ComponentType<{ className?: string }>;
}) {
  const toneClass =
    tone === "blue"
      ? "border-accent-blue/40 bg-accent-blue/5"
      : tone === "amber"
        ? "border-accent-amber/40 bg-accent-amber/5"
        : "border-bg-border bg-bg-card";
  const iconTone = tone === "blue" ? "text-accent-blue" : tone === "amber" ? "text-accent-amber" : "text-ink-tertiary";
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
