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
type ChannelScope = "both" | "email" | "sms";

type Suppression = {
  id: string;
  email: string;
  phone?: string;
  channel?: "email" | "sms";   // undefined = blocks both
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
  counts: {
    bySource: Record<string, number>;
    byChannel: { both: number; email: number; sms: number };
  };
};

const CHANNEL_LABEL: Record<ChannelScope, string> = {
  both: "Blocks both",
  email: "Email only",
  sms: "SMS only",
};

const CHANNEL_TONE: Record<ChannelScope, string> = {
  both: "bg-accent-red/15 text-accent-red",
  email: "bg-accent-blue/15 text-accent-blue",
  sms: "bg-accent-amber/15 text-accent-amber",
};

function channelOf(s: Suppression): ChannelScope {
  return s.channel ?? "both";
}

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
  const [channelFilter, setChannelFilter] = useState<ChannelScope | "">("");

  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newChannel, setNewChannel] = useState<"" | "email" | "sms">("");
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
      if (channelFilter) params.set("channel", channelFilter);
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
  }, [q, sourceFilter, channelFilter]);

  useEffect(() => { load(); }, [load]);

  async function addOne() {
    if ((!newEmail.trim() && !newPhone.trim()) || adding) return;
    setAdding(true);
    try {
      const r = await fetch("/api/admin/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim() || undefined,
          phone: newPhone.trim() || undefined,
          channel: newChannel || undefined,
          reason: newReason.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Add failed (${r.status})`);
      const target = newEmail.trim() || newPhone.trim();
      const scope = newChannel ? ` (${newChannel} only)` : " (both channels)";
      toast(`Added ${target}${scope}`, "success");
      setNewEmail("");
      setNewPhone("");
      setNewChannel("");
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
    // Slice 30: explicit consent reason required by the API. Prompt
    // for it via window.prompt -- short + sufficient for ops review.
    const target = sup.email || sup.phone || sup.id;
    const reason = window.prompt(
      `Remove ${target} from suppression list?\n\n` +
      "CAN-SPAM § 7704 requires explicit recipient consent before re-enabling outreach. Removing without consent risks $50,120 per email per FTC enforcement.\n\n" +
      "Enter the consent reason (min 10 chars). Examples:\n" +
      "- Replied to email asking to be added back\n" +
      "- Phone confirmation 2024-01-15 from ops\n" +
      "- Web re-opt-in form submission, IP 1.2.3.4\n",
      "",
    );
    if (reason === null) return; // operator cancelled
    if (reason.trim().length < 10) {
      toast("Consent reason must be at least 10 characters", "error");
      return;
    }
    setRemovingId(sup.id);
    try {
      const r = await fetch(`/api/admin/suppressions/${sup.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentReason: reason.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `Remove failed (${r.status})`);
      toast(`Resubscribed ${target} — audit recorded`, "success");
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
              placeholder="email@example.com (optional)"
              className="h-10 rounded-lg border border-bg-border bg-bg-card px-3 text-sm focus:border-brand-500 focus:outline-none"
            />
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              type="tel"
              placeholder="+1 555 555 1234 (optional)"
              className="h-10 rounded-lg border border-bg-border bg-bg-card px-3 text-sm focus:border-brand-500 focus:outline-none"
            />
            <select
              value={newChannel}
              onChange={(e) => setNewChannel(e.target.value as "" | "email" | "sms")}
              className="h-10 rounded-lg border border-bg-border bg-bg-card px-3 text-sm focus:border-brand-500 focus:outline-none"
              title="Channel scope. Both = blocks email AND SMS to this contact."
            >
              <option value="">Block both channels</option>
              <option value="email">Email only</option>
              <option value="sms">SMS only</option>
            </select>
            <input
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="Reason (e.g. 'replied asking to remove')"
              maxLength={200}
              className="h-10 rounded-lg border border-bg-border bg-bg-card px-3 text-sm focus:border-brand-500 focus:outline-none"
            />
            <button
              onClick={addOne}
              disabled={adding || (!newEmail.trim() && !newPhone.trim())}
              className="flex items-center gap-2 rounded-lg bg-gradient-brand px-4 py-2 text-sm font-semibold shadow-glow disabled:opacity-60"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </button>
          </div>
          <p className="mt-2 text-[11px] text-ink-tertiary">
            Provide an email, a phone, or both. Channel scope determines what's blocked: "Both" mirrors auto-mode (default); "Email only" / "SMS only" honor channel-only mode.
          </p>
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
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value as ChannelScope | "")}
          className="h-9 rounded-lg border border-bg-border bg-bg-card px-3 text-sm"
          title="Filter by which channel(s) this suppression blocks"
        >
          <option value="">All channels</option>
          <option value="both">Blocks both ({data?.counts.byChannel.both ?? 0})</option>
          <option value="email">Email only ({data?.counts.byChannel.email ?? 0})</option>
          <option value="sms">SMS only ({data?.counts.byChannel.sms ?? 0})</option>
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
                  <th className="px-5 py-2.5 text-left font-medium">Contact</th>
                  <th className="px-3 py-2.5 text-left font-medium">Channel</th>
                  <th className="px-3 py-2.5 text-left font-medium">Source</th>
                  <th className="px-3 py-2.5 text-left font-medium">Reason</th>
                  <th className="px-3 py-2.5 text-left font-medium">Added</th>
                  <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data?.suppressions ?? []).map((s) => {
                  const scope = channelOf(s);
                  return (
                    <tr key={s.id} className="border-t border-bg-border hover:bg-bg-hover/30">
                      <td className="px-5 py-3">
                        {s.email && <div className="font-mono text-[12px]">{s.email}</div>}
                        {s.phone && (
                          <div className="font-mono text-[11px] text-ink-secondary">
                            {s.phone}
                          </div>
                        )}
                        {(s.contextLeadId || s.contextBusinessId || s.contextDraftId) && (
                          <div className="mt-0.5 text-[10px] text-ink-tertiary">
                            {s.contextLeadId && `lead ${s.contextLeadId}`}
                            {s.contextBusinessId && `${s.contextLeadId ? " · " : ""}biz ${s.contextBusinessId}`}
                            {s.contextDraftId && `${s.contextLeadId || s.contextBusinessId ? " · " : ""}draft ${s.contextDraftId}`}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${CHANNEL_TONE[scope]}`}
                          title={
                            scope === "both"
                              ? "Blocks both email and SMS to this contact"
                              : scope === "email"
                                ? "Blocks email only -- SMS still allowed"
                                : "Blocks SMS only -- email still allowed"
                          }
                        >
                          {CHANNEL_LABEL[scope]}
                        </span>
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
                  );
                })}
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

      {/* Slice 31: resubscribe audit log surface */}
      <ResubscribeAuditPanel />

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

// ─── Resubscribe audit panel (slice 31) ─────────────────────────────

type AuditEntry = {
  id: string;
  action: "remove" | "add" | "import";
  email?: string;
  phone?: string;
  channel?: "email" | "sms";
  actorEmail: string;
  consentReason?: string;
  source?: string;
  at: string;
};

function ResubscribeAuditPanel() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    if (loading) return;
    setLoading(true);
    try {
      const r = await fetch("/api/admin/suppressions/audits?action=remove&limit=200", {
        cache: "no-store",
        credentials: "include",
      });
      if (r.ok) {
        const d = await r.json();
        setEntries(d.audits ?? []);
      }
    } catch {
      // best-effort
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }

  useEffect(() => {
    if (open && !loaded) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-[12px] font-semibold text-ink-secondary hover:bg-bg-hover"
      >
        <span>Resubscribe audit log {entries.length > 0 && `(${entries.length})`}</span>
        <span className="text-[10px] text-ink-tertiary">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="border-t border-bg-border px-4 py-3">
          {loading ? (
            <div className="flex items-center gap-2 text-[11px] text-ink-tertiary">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading audit log...
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center text-[11px] text-ink-tertiary">
              No resubscribes recorded. (Or nothing was removed since the audit log went live in slice 30.)
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                <tr className="border-b border-bg-border">
                  <th className="py-1.5 text-left font-medium">Contact</th>
                  <th className="py-1.5 text-left font-medium">Channel</th>
                  <th className="py-1.5 text-left font-medium">Resubscribed by</th>
                  <th className="py-1.5 text-left font-medium">Consent reason</th>
                  <th className="py-1.5 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-bg-border/40 last:border-0">
                    <td className="py-1.5 font-mono text-[11px]">
                      {e.email}
                      {e.phone && (
                        <span className="ml-1 text-ink-tertiary">· {e.phone}</span>
                      )}
                    </td>
                    <td className="py-1.5 text-[11px] text-ink-secondary">{e.channel ?? "both"}</td>
                    <td className="py-1.5 font-mono text-[11px] text-ink-secondary">{e.actorEmail}</td>
                    <td className="py-1.5 text-[11px] text-ink-secondary max-w-md truncate" title={e.consentReason}>
                      {e.consentReason ?? "—"}
                    </td>
                    <td className="py-1.5 text-right font-mono text-[10px] text-ink-tertiary">
                      {new Date(e.at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
