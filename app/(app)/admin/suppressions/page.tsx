"use client";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MailX,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";

type Source = "unsubscribe" | "complaint" | "operator" | "import" | "hard_bounce";

type Suppression = {
  id: string;
  email: string;
  source: Source;
  reason?: string;
  addedAt: string;
  contextLeadId?: string;
  contextBusinessId?: string;
  contextDraftId?: string;
};

type ListPayload = {
  suppressions: Suppression[];
  total: number;
  filteredTotal: number;
  counts: { bySource: Record<string, number> };
};

const SOURCE_TONE: Record<Source, string> = {
  unsubscribe: "bg-bg-hover text-ink-secondary",
  complaint: "bg-accent-red/15 text-accent-red",
  operator: "bg-brand-500/15 text-brand-200",
  import: "bg-accent-blue/15 text-accent-blue",
  hard_bounce: "bg-accent-amber/15 text-accent-amber",
};

const SOURCE_LABEL: Record<Source, string> = {
  unsubscribe: "Unsubscribe link",
  complaint: "Spam complaint",
  operator: "Operator-added",
  import: "Bulk import",
  hard_bounce: "Hard bounce",
};

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 30 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function SuppressionsPage() {
  const [data, setData] = useState<ListPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const [sourceFilter, setSourceFilter] = useState<Source | "">("");

  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newReason, setNewReason] = useState("");
  const [adding, setAdding] = useState(false);

  const [removingId, setRemovingId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (sourceFilter) params.set("source", sourceFilter);
      const r = await fetch(`/api/admin/suppressions?${params}`, { cache: "no-store" });
      if (r.status === 401) {
        setLoadError("Not signed in — visit /signin and try again.");
        return;
      }
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setLoadError(`API returned ${r.status}: ${body.error ?? r.statusText}`);
        return;
      }
      setData(await r.json());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [q, sourceFilter]);

  useEffect(() => { load(); }, [load]);

  async function addOne() {
    if (!newEmail.trim() || adding) return;
    setAdding(true);
    try {
      const r = await fetch("/api/admin/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim(), reason: newReason.trim() || undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Add failed (${r.status})`);
      toast(`Added ${newEmail} to suppression list`, "success");
      setNewEmail("");
      setNewReason("");
      setAddOpen(false);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Add failed", "error");
    } finally {
      setAdding(false);
    }
  }

  async function removeOne(sup: Suppression) {
    const reauth = window.confirm(
      `Remove ${sup.email} from the suppression list?\n\n` +
      "WARNING: Re-enabling outreach to someone who unsubscribed is a CAN-SPAM violation UNLESS you have explicit re-opt-in consent (e.g. they replied asking to be added back).\n\n" +
      "Click OK only if you have that consent on file.",
    );
    if (!reauth) return;
    setRemovingId(sup.id);
    try {
      const r = await fetch(`/api/admin/suppressions/${sup.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`Remove failed (${r.status})`);
      toast(`Removed ${sup.email} — they can receive outreach again`, "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Remove failed", "error");
    } finally {
      setRemovingId(null);
    }
  }

  const tilesData = useMemo(() => {
    const counts = data?.counts.bySource ?? {};
    return [
      { k: "Total suppressed", v: data?.total ?? 0 },
      { k: "Unsubscribes", v: (counts.unsubscribe ?? 0) + (counts.complaint ?? 0), hint: "via email link or complaint" },
      { k: "Hard bounces", v: counts.hard_bounce ?? 0, hint: "invalid address" },
      { k: "Operator-added", v: counts.operator ?? 0 },
    ];
  }, [data]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <MailX className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Email Suppression List</h1>
            <p className="text-xs text-ink-secondary">
              {data?.total === 0
                ? "No suppressions yet — recipients land here when they click the unsubscribe footer"
                : `${data?.filteredTotal ?? 0} of ${data?.total ?? 0} suppressed · sendEmail() short-circuits these before any provider call`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAddOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
          >
            <Plus className="h-4 w-4" /> Add manually
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/5 px-4 py-3">
        <div className="flex items-start gap-3 text-[12px]">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-amber/15">
            <Sparkles className="h-3.5 w-3.5 text-accent-amber" />
          </div>
          <div className="flex-1 text-ink-secondary">
            <span className="font-semibold text-accent-amber">CAN-SPAM compliance gate</span>
            {" "}— every email send checks this list. Recipients who unsubscribed (via footer link
            or hidden List-Unsubscribe header) are added automatically + permanently. Removing
            someone is a manual action requiring re-opt-in consent on file.
          </div>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-accent-red/40 bg-accent-red/5 px-4 py-3 text-xs text-accent-red">
          <strong className="font-semibold">Couldn&apos;t load suppressions:</strong> {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tilesData.map((t) => (
          <div key={t.k} className="rounded-xl border border-bg-border bg-bg-card p-4">
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{t.k}</div>
            <div className="mt-1 text-2xl font-bold">{t.v.toLocaleString()}</div>
            {t.hint && <div className="text-[10px] text-ink-tertiary">{t.hint}</div>}
          </div>
        ))}
      </div>

      {/* Add manually drawer */}
      {addOpen && (
        <div className="rounded-xl border border-brand-500/40 bg-gradient-to-br from-brand-500/5 to-transparent p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Add an email to the suppression list</div>
            <button
              onClick={() => setAddOpen(false)}
              className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1 text-[11px] text-ink-tertiary">
            Use this for prospects who asked to be removed via reply, phone, or other channel
            (where the unsubscribe footer wasn&apos;t clicked). Source will be tagged{" "}
            <code className="rounded bg-bg-hover px-1">operator</code> for audit.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.5fr_auto]">
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              type="email"
              placeholder="email@example.com"
              className="h-10 rounded-lg border border-bg-border bg-bg-card px-3 text-sm focus:border-brand-500 focus:outline-none"
            />
            <input
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="Reason (e.g. 'replied asking to remove')"
              maxLength={200}
              className="h-10 rounded-lg border border-bg-border bg-bg-card px-3 text-sm focus:border-brand-500 focus:outline-none"
            />
            <button
              onClick={addOne}
              disabled={adding || !newEmail.trim()}
              className="flex items-center gap-2 rounded-lg bg-gradient-brand px-4 py-2 text-sm font-semibold shadow-glow disabled:opacity-60"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email or reason…"
            className="h-9 w-full rounded-lg border border-bg-border bg-bg-card pl-9 pr-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as Source | "")}
          className="h-9 rounded-lg border border-bg-border bg-bg-card px-3 text-sm"
        >
          <option value="">All sources</option>
          {(Object.keys(SOURCE_LABEL) as Source[]).map((s) => (
            <option key={s} value={s}>{SOURCE_LABEL[s]} ({data?.counts.bySource[s] ?? 0})</option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
        {data === null && !loadError ? (
          <div className="flex items-center gap-2 px-5 py-8 text-[12px] text-ink-tertiary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : data && data.suppressions.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <MailX className="mx-auto h-8 w-8 text-ink-tertiary" />
            <div className="mt-3 text-base font-semibold">
              {data.total === 0 ? "Nobody suppressed yet" : "No matches"}
            </div>
            <p className="mt-1 max-w-md mx-auto text-xs text-ink-tertiary">
              {data.total === 0
                ? "When recipients click the unsubscribe footer in any outbound email, they land here automatically. Manual adds via the button above are also tagged."
                : "Adjust filters or clear them to see more."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
                <tr className="border-b border-bg-border">
                  <th className="px-5 py-2.5 text-left font-medium">Email</th>
                  <th className="px-3 py-2.5 text-left font-medium">Source</th>
                  <th className="px-3 py-2.5 text-left font-medium">Reason</th>
                  <th className="px-3 py-2.5 text-left font-medium">Added</th>
                  <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data?.suppressions ?? []).map((s) => (
                  <tr key={s.id} className="border-t border-bg-border hover:bg-bg-hover/30">
                    <td className="px-5 py-3">
                      <div className="font-mono text-[12px]">{s.email}</div>
                      {(s.contextLeadId || s.contextBusinessId || s.contextDraftId) && (
                        <div className="mt-0.5 text-[10px] text-ink-tertiary">
                          {s.contextLeadId && `lead ${s.contextLeadId}`}
                          {s.contextBusinessId && `${s.contextLeadId ? " · " : ""}biz ${s.contextBusinessId}`}
                          {s.contextDraftId && `${s.contextLeadId || s.contextBusinessId ? " · " : ""}draft ${s.contextDraftId}`}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${SOURCE_TONE[s.source]}`}>
                        {SOURCE_LABEL[s.source]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[11px] text-ink-secondary max-w-md truncate" title={s.reason}>
                      {s.reason ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-[11px] text-ink-tertiary">{relTime(s.addedAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => removeOne(s)}
                        disabled={removingId === s.id}
                        className="inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-hover/40 px-2 py-1 text-[10px] text-ink-secondary hover:border-accent-amber/40 hover:text-accent-amber disabled:opacity-60"
                        title="Re-enable outreach — only with explicit re-opt-in consent (CAN-SPAM)"
                      >
                        {removingId === s.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data && data.filteredTotal > data.suppressions.length && (
              <div className="border-t border-bg-border px-4 py-2 text-center text-[10px] text-ink-tertiary">
                Showing first {data.suppressions.length} of {data.filteredTotal} matching · refine filters
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-accent-red/30 bg-accent-red/5 px-4 py-3">
        <div className="flex items-start gap-3 text-[12px]">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-red/15">
            <AlertCircle className="h-3.5 w-3.5 text-accent-red" />
          </div>
          <div className="flex-1 text-ink-secondary">
            <span className="font-semibold text-accent-red">Legal reminder</span>
            {" "}— CAN-SPAM § 7704 requires honoring opt-outs within 10 business days. We honor
            immediately + permanently. Removing someone from this list without explicit re-opt-in
            consent (FTC enforcement: $50,120/email/violation) is illegal. The Remove button is
            for genuine re-opt-in cases only.
          </div>
        </div>
      </div>
    </div>
  );
}
