"use client";
import {
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * /admin/cadence-items — full audit trail of every cadence-scheduled
 * queue item across all cadences. Filterable by status / approval /
 * audit / retry state.
 *
 * Slice 22 surfaces what's stored in cadence-queue-items.json:
 *   - Approval audit (approvedBy + approvedAt) per item
 *   - Retry count (slice 19) per item
 *   - Outcome + completion timestamps
 *   - Cross-cadence visibility
 */

type Status = "pending" | "done" | "skipped" | "failed";
type Channel = "call" | "email" | "sms";

type Item = {
  id: string;
  enrollmentId: string;
  cadenceId: string;
  cadenceName: string;
  stepIndex: number;
  channel: Channel;
  buyerId: string;
  buyerName: string;
  buyerCompany: string;
  to?: string;
  subject?: string;
  body?: string;
  dueAt: string;
  status: Status;
  requiresApproval?: boolean;
  approvedBy?: string;
  approvedAt?: string;
  retryCount?: number;
  lastRetryAt?: string;
  outcome?: string;
  doneAt?: string;
  createdAt: string;
  updatedAt: string;
};

type Summary = {
  total: number;
  byStatus: Record<Status, number>;
  requiresApproval: number;
  withApprovalAudit: number;
  retried: number;
};

const CHANNEL_ICON: Record<Channel, typeof Phone> = {
  call: Phone,
  email: Mail,
  sms: MessageSquare,
};

const STATUS_TONE: Record<Status, string> = {
  pending: "bg-accent-blue/15 text-accent-blue",
  done: "bg-accent-green/15 text-accent-green",
  skipped: "bg-bg-hover text-ink-tertiary",
  failed: "bg-accent-red/15 text-accent-red",
};

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function CadenceItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Status | "">("");
  const [approvalFilter, setApprovalFilter] = useState<"" | "needs" | "approved" | "no-approval">("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (approvalFilter === "needs") params.set("requiresApproval", "true");
      if (approvalFilter === "approved") params.set("withApprovalAudit", "true");
      if (approvalFilter === "no-approval") params.set("requiresApproval", "false");
      const r = await fetch(`/api/admin/cadence-items?${params}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Load failed (${r.status})`);
      }
      const d = await r.json();
      setItems(d.items ?? []);
      setSummary(d.summary ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, approvalFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        i.buyerName?.toLowerCase().includes(q) ||
        i.buyerCompany?.toLowerCase().includes(q) ||
        i.cadenceName?.toLowerCase().includes(q) ||
        i.approvedBy?.toLowerCase().includes(q) ||
        i.to?.toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cadence items audit</h1>
          <p className="text-[12px] text-ink-tertiary">
            Every cadence-scheduled queue item across cadences + statuses.
            Includes approval audit (who + when), retry counters, completion
            outcomes. Read-only.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CleanupButton onCleaned={load} />
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
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Tile label="Total" value={summary.total} />
          <Tile label="Pending" value={summary.byStatus.pending} tone="blue" Icon={Clock} />
          <Tile label="Done" value={summary.byStatus.done} tone="green" Icon={CheckCircle2} />
          <Tile label="Failed" value={summary.byStatus.failed} tone="red" Icon={XCircle} />
          <Tile label="Approved" value={summary.withApprovalAudit} tone="blue" Icon={ShieldCheck} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-bg-border bg-bg-card p-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Status | "")}
          className="h-8 rounded-md border border-bg-border bg-bg-app px-2 text-[12px]"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="done">Done</option>
          <option value="skipped">Skipped</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={approvalFilter}
          onChange={(e) => setApprovalFilter(e.target.value as typeof approvalFilter)}
          className="h-8 rounded-md border border-bg-border bg-bg-app px-2 text-[12px]"
        >
          <option value="">All approval scopes</option>
          <option value="needs">Requires approval</option>
          <option value="approved">Approved (audit stamp)</option>
          <option value="no-approval">No approval needed</option>
        </select>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
          <input
            type="search"
            placeholder="Search buyer / cadence / approver..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-72 rounded-md border border-bg-border bg-bg-app pl-7 pr-2 text-[12px] placeholder:text-ink-tertiary focus:outline-none focus:ring-1 focus:ring-accent-blue/50"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-ink-tertiary">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-bg-border bg-bg-card p-10 text-center text-[12px] text-ink-tertiary">
          No items match.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
          <table className="w-full text-[12px]">
            <thead className="border-b border-bg-border bg-bg-app/40 text-[10px] uppercase tracking-wider text-ink-tertiary">
              <tr>
                <th className="px-3 py-2 text-left">Buyer</th>
                <th className="px-3 py-2 text-left">Cadence · Step</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Outcome</th>
                <th className="px-3 py-2 text-left">Approval audit</th>
                <th className="px-3 py-2 text-right">Retries</th>
                <th className="px-3 py-2 text-right">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const Icon = CHANNEL_ICON[i.channel];
                return (
                  <tr key={i.id} className="border-b border-bg-border/40 last:border-0 hover:bg-bg-hover/30">
                    <td className="px-3 py-2">
                      <div className="font-medium">{i.buyerName}</div>
                      <div className="text-[10px] text-ink-tertiary">{i.buyerCompany}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Icon className="h-3 w-3 text-ink-secondary" />
                        <span>{i.cadenceName}</span>
                        <span className="text-ink-tertiary">· {i.stepIndex + 1}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_TONE[i.status]}`}
                      >
                        {i.status}
                      </span>
                      {i.requiresApproval && (
                        <span className="ml-1 inline-flex items-center gap-0.5 rounded-full border border-accent-amber/40 bg-accent-amber/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent-amber">
                          <ShieldCheck className="h-2.5 w-2.5" />
                          approval
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-ink-secondary max-w-xs truncate">
                      {i.outcome ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-[11px]">
                      {i.approvedBy ? (
                        <div>
                          <div className="font-mono text-accent-blue">{i.approvedBy}</div>
                          {i.approvedAt && (
                            <div className="text-[10px] text-ink-tertiary">
                              {relTime(i.approvedAt)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-ink-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {(i.retryCount ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-accent-amber">
                          <RotateCcw className="h-3 w-3" />
                          {i.retryCount}
                        </span>
                      ) : (
                        <span className="text-ink-tertiary">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[10px] text-ink-tertiary">
                      {relTime(i.updatedAt)}
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
  tone?: "blue" | "green" | "red";
  Icon?: React.ComponentType<{ className?: string }>;
}) {
  const toneClass =
    tone === "blue"
      ? "border-accent-blue/40 bg-accent-blue/5"
      : tone === "green"
        ? "border-accent-green/40 bg-accent-green/5"
        : tone === "red"
          ? "border-accent-red/40 bg-accent-red/5"
          : "border-bg-border bg-bg-card";
  const iconTone =
    tone === "blue"
      ? "text-accent-blue"
      : tone === "green"
        ? "text-accent-green"
        : tone === "red"
          ? "text-accent-red"
          : "text-ink-tertiary";
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

// ─── CleanupButton (slice 37) ──────────────────────────────────────

function CleanupButton({ onCleaned }: { onCleaned: () => void }) {
  const [busy, setBusy] = useState(false);

  async function run() {
    const days = window.prompt(
      "Drop done / skipped / failed cadence items older than how many days?\n\n" +
        "Pending items are NEVER touched.\n" +
        "Default: 30 (most operators run this quarterly).",
      "30",
    );
    if (days === null) return;
    const n = Number.parseInt(days, 10);
    if (!Number.isFinite(n) || n < 0) {
      alert("Enter a non-negative number");
      return;
    }
    if (!window.confirm(`Drop done/skipped/failed items older than ${n} days?\n\nThis cannot be undone.`)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/cadence-items/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          statuses: ["done", "skipped", "failed"],
          olderThanDays: n,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Cleanup failed (${r.status})`);
      alert(`Removed ${d.removed} item${d.removed === 1 ? "" : "s"}`);
      onCleaned();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Cleanup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={busy}
      className="inline-flex items-center gap-1 rounded-md border border-accent-red/30 bg-accent-red/5 px-2.5 py-1.5 text-[12px] text-accent-red hover:bg-accent-red/15 disabled:opacity-50"
      title="Drop completed items older than N days. Pending items not affected."
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      Cleanup
    </button>
  );
}
