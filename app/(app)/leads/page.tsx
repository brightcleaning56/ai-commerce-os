"use client";
import {
  Building2,
  CheckCircle2,
  Clock,
  Flame,
  Inbox,
  Mail,
  Phone,
  RefreshCw,
  Search,
  Snowflake,
  ThermometerSun,
  UserPlus,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { scoreLead, type LeadTier } from "@/lib/leadScore";

type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost";
type AiReply = {
  status: "pending" | "sent" | "skipped" | "error";
  at: string;
  subject?: string;
  body?: string;
  smsBody?: string;
  smsSentTo?: string;
  channel?: ("email" | "sms")[];
  model?: string;
  estCostUsd?: number;
  errorMessage?: string;
};
type AiFollowup = {
  at: string;
  daysSinceCreated: number;
  status: "sent" | "skipped" | "error";
  subject?: string;
  body?: string;
  model?: string;
  estCostUsd?: number;
  errorMessage?: string;
};
type Resubmission = {
  at: string;
  source: "contact-form" | "signup-form";
  changedFields: string[];
  newMessage?: string;
  triggeredAiReply: boolean;
};
type Lead = {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  email: string;
  company: string;
  phone?: string;
  companySize?: string;
  industry?: string;
  useCases: string[];
  timeline?: string;
  budget?: string;
  message?: string;
  source: "contact-form" | "signup-form";
  status: LeadStatus;
  notes?: string;
  aiReply?: AiReply;
  aiFollowups?: AiFollowup[];
  resubmissions?: Resubmission[];
  lastSubmittedAt?: string;
  promotedToBuyerId?: string;
  promotedAt?: string;
  promotedBy?: "operator" | "auto";
};

const STATUS_TONE: Record<LeadStatus, { bg: string; text: string }> = {
  new:        { bg: "bg-brand-500/15",       text: "text-brand-200" },
  contacted:  { bg: "bg-accent-blue/15",     text: "text-accent-blue" },
  qualified:  { bg: "bg-accent-amber/15",    text: "text-accent-amber" },
  won:        { bg: "bg-accent-green/15",    text: "text-accent-green" },
  lost:       { bg: "bg-bg-hover",           text: "text-ink-tertiary" },
};

const STATUS_ORDER: LeadStatus[] = ["new", "contacted", "qualified", "won", "lost"];

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | LeadStatus>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Lead | null>(null);
  const { toast } = useToast();

  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch("/api/leads", { cache: "no-store", credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setLeads(d.leads ?? []);
        return;
      }
      // 401 means cookie is missing/expired/wrong — bounce to /signin so user
      // can re-auth instead of staring at a silent "No leads yet".
      if (r.status === 401) {
        const next = encodeURIComponent("/leads");
        window.location.href = `/signin?next=${next}`;
        return;
      }
      const body = await r.json().catch(() => ({}));
      setLoadError(`API returned ${r.status}: ${body.error ?? r.statusText}`);
      setLeads((p) => p ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error");
      setLeads((p) => p ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<LeadStatus, number> & { all: number } = {
      all: 0, new: 0, contacted: 0, qualified: 0, won: 0, lost: 0,
    };
    for (const l of leads ?? []) { c.all += 1; c[l.status] += 1; }
    return c;
  }, [leads]);

  // Pre-compute score for every lead once, so sorting + tier badges share
  // the same underlying value and we don't recompute per render of each row.
  const scored = useMemo(() => {
    if (!leads) return [];
    return leads.map((l) => ({ ...l, _score: scoreLead(l) }));
  }, [leads]);

  const [sortBy, setSortBy] = useState<"score" | "date">("score");

  const tierCounts = useMemo(() => {
    const c: Record<LeadTier, number> = { hot: 0, warm: 0, cold: 0 };
    for (const l of scored) c[l._score.tier] += 1;
    return c;
  }, [scored]);

  const visible = useMemo(() => {
    return scored
      .filter((l) => {
        if (filter !== "all" && l.status !== filter) return false;
        if (query) {
          const q = query.toLowerCase();
          if (
            !l.name.toLowerCase().includes(q) &&
            !l.email.toLowerCase().includes(q) &&
            !l.company.toLowerCase().includes(q)
          ) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "score") return b._score.total - a._score.total;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [scored, filter, query, sortBy]);

  async function setStatus(lead: Lead, next: LeadStatus) {
    try {
      const r = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!r.ok) throw new Error(`PATCH failed (${r.status})`);
      const d = await r.json();
      setLeads((all) => (all ?? []).map((l) => (l.id === lead.id ? d.lead : l)));
      if (selected?.id === lead.id) setSelected(d.lead);
      toast(`Marked ${next}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed", "error");
    }
  }

  const [promoting, setPromoting] = useState<string | null>(null);

  async function promoteToBuyer(lead: Lead) {
    if (lead.promotedToBuyerId) {
      toast(`Already promoted (buyer ${lead.promotedToBuyerId})`, "info");
      return;
    }
    setPromoting(lead.id);
    try {
      const r = await fetch(`/api/leads/${lead.id}/promote`, { method: "POST" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `Promote failed (${r.status})`);
      }
      const d = await r.json();
      setLeads((all) => (all ?? []).map((l) => (l.id === lead.id ? d.lead : l)));
      if (selected?.id === lead.id) setSelected(d.lead);
      toast(
        d.alreadyPromoted
          ? `Already promoted — opened existing buyer record`
          : `Promoted to buyer · Outreach Agent will start drafting for ${d.buyer?.company ?? "them"}`,
        "success",
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Promote failed", "error");
    } finally {
      setPromoting(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Inbox className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Leads</h1>
            <p className="text-xs text-ink-secondary">
              {counts.all} total · {counts.new} new · {counts.contacted} contacted · {counts.qualified} qualified · {counts.won} won · captured from /contact
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Tier breakdown — at-a-glance triage */}
      {scored.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-accent-red/30 bg-accent-red/5 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-accent-red">
              <Flame className="h-3 w-3" /> Hot
            </div>
            <div className="mt-1 text-2xl font-bold text-accent-red">{tierCounts.hot}</div>
            <div className="text-[10px] text-ink-tertiary">act today</div>
          </div>
          <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/5 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-accent-amber">
              <ThermometerSun className="h-3 w-3" /> Warm
            </div>
            <div className="mt-1 text-2xl font-bold text-accent-amber">{tierCounts.warm}</div>
            <div className="text-[10px] text-ink-tertiary">act this week</div>
          </div>
          <div className="rounded-xl border border-bg-border bg-bg-card p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-ink-tertiary">
              <Snowflake className="h-3 w-3" /> Cold
            </div>
            <div className="mt-1 text-2xl font-bold text-ink-secondary">{tierCounts.cold}</div>
            <div className="text-[10px] text-ink-tertiary">trickle / sequence</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, or company…"
            className="h-9 w-full rounded-lg border border-bg-border bg-bg-card pl-9 pr-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-bg-border bg-bg-card p-1 text-xs">
          {(["all", ...STATUS_ORDER] as const).map((k) => {
            const n = k === "all" ? counts.all : counts[k];
            return (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${
                  filter === k ? "bg-brand-500/15 text-brand-200" : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
                }`}
              >
                {k === "all" ? "All" : k.charAt(0).toUpperCase() + k.slice(1)}
                <span className={`rounded ${filter === k ? "bg-brand-500/20" : "bg-bg-hover"} px-1.5 text-[10px]`}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-bg-border bg-bg-card p-1 text-xs">
          {(["score", "date"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setSortBy(k)}
              className={`rounded-md px-2.5 py-1.5 ${
                sortBy === k ? "bg-brand-500/15 text-brand-200" : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
              }`}
              title={k === "score" ? "Sort hottest first" : "Sort newest first"}
            >
              {k === "score" ? "Score" : "Date"}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-accent-red/40 bg-accent-red/5 px-4 py-3 text-xs text-accent-red">
          <strong className="font-semibold">Couldn&apos;t load leads:</strong> {loadError}
          <span className="ml-2 text-ink-tertiary">— click Refresh, or sign in again at <a className="underline" href="/signin">/signin</a></span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
          {leads === null ? (
            <div className="px-5 py-12 text-center text-xs text-ink-tertiary">Loading…</div>
          ) : leads.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Inbox className="mx-auto h-8 w-8 text-ink-tertiary" />
              <div className="mt-3 text-base font-semibold">No leads yet</div>
              <p className="mt-1 text-xs text-ink-tertiary">
                Submissions from <code className="rounded bg-bg-hover px-1">/contact</code> will appear here.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <div className="px-5 py-12 text-center text-xs text-ink-tertiary">No leads match your filters.</div>
          ) : (
            <ul className="divide-y divide-bg-border">
              {visible.map((l) => {
                const tone = STATUS_TONE[l.status];
                const active = selected?.id === l.id;
                return (
                  <li key={l.id}>
                    <button
                      onClick={() => setSelected(l)}
                      className={`w-full px-5 py-3 text-left transition hover:bg-bg-hover/40 ${active ? "bg-bg-hover/40" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold">{l.name}</span>
                            <span className="text-[11px] text-ink-tertiary">·</span>
                            <span className="truncate text-[12px] text-ink-secondary">{l.company}</span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-tertiary">
                            <Mail className="h-3 w-3" /> {l.email}
                            {l.phone && (<><span>·</span><Phone className="h-3 w-3" /> {l.phone}</>)}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <div className="flex items-center gap-1">
                            <span
                              className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                                l._score.tier === "hot"
                                  ? "bg-accent-red/15 text-accent-red"
                                  : l._score.tier === "warm"
                                    ? "bg-accent-amber/15 text-accent-amber"
                                    : "bg-bg-hover text-ink-tertiary"
                              }`}
                              title={l._score.factors.map((f) => `${f.label}: ${f.weight > 0 ? "+" : ""}${f.weight}`).join("\n")}
                            >
                              {l._score.tier === "hot" ? <Flame className="h-2.5 w-2.5" /> : l._score.tier === "warm" ? <ThermometerSun className="h-2.5 w-2.5" /> : <Snowflake className="h-2.5 w-2.5" />}
                              {l._score.total}
                            </span>
                            <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${tone.bg} ${tone.text}`}>
                              {l.status}
                            </span>
                          </div>
                          <span className="text-[10px] text-ink-tertiary">{relativeTime(l.createdAt)}</span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="rounded-xl border border-bg-border bg-bg-card p-5">
          {selected ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Lead</div>
                  {(() => {
                    const s = scoreLead(selected);
                    return (
                      <span
                        className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          s.tier === "hot"
                            ? "bg-accent-red/15 text-accent-red"
                            : s.tier === "warm"
                              ? "bg-accent-amber/15 text-accent-amber"
                              : "bg-bg-hover text-ink-tertiary"
                        }`}
                      >
                        {s.tier === "hot" ? <Flame className="h-3 w-3" /> : s.tier === "warm" ? <ThermometerSun className="h-3 w-3" /> : <Snowflake className="h-3 w-3" />}
                        {s.tier} · {s.total}
                      </span>
                    );
                  })()}
                </div>
                <div className="text-lg font-bold">{selected.name}</div>
                <div className="text-xs text-ink-secondary">
                  <Building2 className="mr-1 inline h-3 w-3" /> {selected.company}
                  {selected.industry && <span className="text-ink-tertiary"> · {selected.industry}</span>}
                  {selected.companySize && <span className="text-ink-tertiary"> · {selected.companySize}</span>}
                </div>
              </div>

              <div className="space-y-1.5 rounded-lg border border-bg-border bg-bg-hover/30 p-3 text-xs">
                <a href={`mailto:${selected.email}`} className="flex items-center gap-2 text-brand-300 hover:text-brand-200">
                  <Mail className="h-3 w-3" /> {selected.email}
                </a>
                {selected.phone && (
                  <a href={`tel:${selected.phone}`} className="flex items-center gap-2 text-brand-300 hover:text-brand-200">
                    <Phone className="h-3 w-3" /> {selected.phone}
                  </a>
                )}
                <div className="flex items-center gap-2 text-ink-tertiary">
                  <Clock className="h-3 w-3" /> received {relativeTime(selected.createdAt)}
                </div>
              </div>

              {selected.useCases.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Interested in</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selected.useCases.map((u) => (
                      <span key={u} className="rounded-md bg-bg-hover px-2 py-0.5 text-[11px] text-ink-secondary">
                        {u}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(selected.timeline || selected.budget) && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {selected.timeline && (
                    <div className="rounded-md border border-bg-border bg-bg-hover/30 p-2">
                      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Timeline</div>
                      <div className="mt-0.5 font-medium">{selected.timeline}</div>
                    </div>
                  )}
                  {selected.budget && (
                    <div className="rounded-md border border-bg-border bg-bg-hover/30 p-2">
                      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Budget</div>
                      <div className="mt-0.5 font-medium">{selected.budget}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Score breakdown — show every factor that contributed */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Score breakdown</div>
                <div className="mt-1 space-y-1 rounded-md border border-bg-border bg-bg-hover/20 p-2 text-[11px]">
                  {scoreLead(selected).factors.length === 0 ? (
                    <div className="text-ink-tertiary">No scored signals (just contact info).</div>
                  ) : (
                    scoreLead(selected).factors.map((f, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="text-ink-secondary">{f.label}</span>
                        <span className={`font-mono font-semibold ${f.weight > 0 ? "text-accent-green" : "text-accent-red"}`}>
                          {f.weight > 0 ? "+" : ""}{f.weight}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {selected.message && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Message</div>
                  <div className="mt-1 whitespace-pre-wrap rounded-md border border-bg-border bg-bg-hover/20 p-3 text-xs text-ink-secondary">
                    {selected.message}
                  </div>
                </div>
              )}

              {selected.aiReply && (
                <div>
                  <div className="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-ink-tertiary">
                    AI Auto-Reply
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        selected.aiReply.status === "sent"
                          ? "bg-accent-green/15 text-accent-green"
                          : selected.aiReply.status === "pending"
                            ? "bg-accent-amber/15 text-accent-amber"
                            : selected.aiReply.status === "error"
                              ? "bg-accent-red/15 text-accent-red"
                              : "bg-bg-hover text-ink-tertiary"
                      }`}
                    >
                      {selected.aiReply.status}
                    </span>
                    {selected.aiReply.channel && selected.aiReply.channel.length > 0 && (
                      <span className="text-[10px] text-ink-tertiary">
                        via {selected.aiReply.channel.join(" + ")}
                      </span>
                    )}
                    <span className="text-[10px] text-ink-tertiary">{relativeTime(selected.aiReply.at)}</span>
                  </div>
                  {selected.aiReply.subject && (
                    <div className="rounded-md border border-bg-border bg-bg-hover/20 p-3 text-xs">
                      <div className="font-semibold text-ink-primary">Subject: {selected.aiReply.subject}</div>
                      {selected.aiReply.body && (
                        <div className="mt-2 whitespace-pre-wrap text-ink-secondary">
                          {selected.aiReply.body}
                        </div>
                      )}
                      {selected.aiReply.smsBody && (
                        <div className="mt-3 border-t border-bg-border pt-2">
                          <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">SMS sent to {selected.aiReply.smsSentTo}</div>
                          <div className="mt-1 text-ink-secondary">{selected.aiReply.smsBody}</div>
                        </div>
                      )}
                      <div className="mt-2 text-[10px] text-ink-tertiary">
                        {selected.aiReply.model}
                        {selected.aiReply.estCostUsd != null && (
                          <span> · ${selected.aiReply.estCostUsd.toFixed(4)}</span>
                        )}
                      </div>
                    </div>
                  )}
                  {selected.aiReply.errorMessage && (
                    <div className="mt-1 text-[11px] text-accent-red">
                      Error: {selected.aiReply.errorMessage}
                    </div>
                  )}
                </div>
              )}

              {selected.aiFollowups && selected.aiFollowups.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-ink-tertiary">
                    Auto-Followups
                    <span className="rounded-md bg-bg-hover px-1.5 py-0.5 text-[10px] font-semibold text-ink-secondary">
                      {selected.aiFollowups.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {selected.aiFollowups.map((f, i) => (
                      <div key={i} className="rounded-md border border-bg-border bg-bg-hover/20 p-3 text-xs">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-ink-tertiary">#{i + 2} · day {f.daysSinceCreated}</span>
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                              f.status === "sent"
                                ? "bg-accent-green/15 text-accent-green"
                                : f.status === "skipped"
                                  ? "bg-accent-amber/15 text-accent-amber"
                                  : "bg-accent-red/15 text-accent-red"
                            }`}
                          >
                            {f.status}
                          </span>
                          <span className="ml-auto text-[10px] text-ink-tertiary">{relativeTime(f.at)}</span>
                        </div>
                        {f.subject && <div className="font-semibold text-ink-primary">Subject: {f.subject}</div>}
                        {f.body && (
                          <div className="mt-1 whitespace-pre-wrap text-ink-secondary">{f.body}</div>
                        )}
                        {f.errorMessage && <div className="mt-1 text-[11px] text-accent-red">Error: {f.errorMessage}</div>}
                        <div className="mt-1 text-[10px] text-ink-tertiary">
                          {f.model}{f.estCostUsd != null && <> · ${f.estCostUsd.toFixed(4)}</>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selected.resubmissions && selected.resubmissions.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-ink-tertiary">
                    Re-submitted
                    <span className="rounded-md bg-accent-amber/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-amber">
                      {selected.resubmissions.length}× returning
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {selected.resubmissions.map((r, i) => (
                      <div key={i} className="rounded-md border border-accent-amber/20 bg-accent-amber/5 p-2.5 text-xs">
                        <div className="flex items-center gap-2 text-[11px] text-ink-secondary">
                          <span className="rounded bg-bg-hover px-1.5 py-0.5 text-[10px] font-semibold">
                            {r.source}
                          </span>
                          <span className="text-ink-tertiary">·</span>
                          <span>{relativeTime(r.at)}</span>
                          {r.triggeredAiReply && (
                            <span className="ml-auto rounded bg-accent-green/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-green">
                              AI re-fired
                            </span>
                          )}
                        </div>
                        {r.changedFields.length > 0 && (
                          <div className="mt-1 text-[11px] text-ink-tertiary">
                            New info on: <span className="text-ink-secondary">{r.changedFields.join(", ")}</span>
                          </div>
                        )}
                        {r.newMessage && r.newMessage !== selected.message && (
                          <div className="mt-1 whitespace-pre-wrap text-[11px] text-ink-secondary">
                            “{r.newMessage}”
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="mb-1.5 text-[10px] uppercase tracking-wider text-ink-tertiary">Promote</div>
                {selected.promotedToBuyerId ? (
                  <div className="flex items-center justify-between rounded-lg border border-accent-green/30 bg-accent-green/5 px-3 py-2 text-[11px]">
                    <div>
                      <div className="flex items-center gap-1.5 font-semibold text-accent-green">
                        Promoted to buyer
                        {selected.promotedBy === "auto" && (
                          <span
                            className="rounded bg-accent-green/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wider"
                            title="Auto-promoted because lead score crossed AUTO_PROMOTE_LEAD_SCORE (default 70)"
                          >
                            Auto
                          </span>
                        )}
                      </div>
                      <div className="text-ink-tertiary">
                        {selected.promotedToBuyerId}
                        {selected.promotedAt && (
                          <span className="ml-1.5">· {relativeTime(selected.promotedAt)}</span>
                        )}
                      </div>
                    </div>
                    <a
                      href="/buyers"
                      className="rounded-md border border-accent-green/40 bg-accent-green/10 px-2 py-1 text-[10px] font-semibold text-accent-green hover:bg-accent-green/20"
                    >
                      Open buyer
                    </a>
                  </div>
                ) : (
                  <button
                    onClick={() => promoteToBuyer(selected)}
                    disabled={promoting === selected.id}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-2 text-[11px] font-semibold text-brand-200 transition hover:bg-brand-500/20 disabled:opacity-60"
                    title="Mint a Buyer record so the Outreach Agent starts drafting for this company"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    {promoting === selected.id ? "Promoting…" : "Promote to Buyer"}
                  </button>
                )}
              </div>

              <div>
                <div className="mb-1.5 text-[10px] uppercase tracking-wider text-ink-tertiary">Status</div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_ORDER.map((s) => {
                    const tone = STATUS_TONE[s];
                    const active = selected.status === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setStatus(selected, s)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                          active ? `${tone.bg} ${tone.text}` : "border border-bg-border bg-bg-hover/40 text-ink-secondary hover:bg-bg-hover"
                        }`}
                      >
                        {s === "won" && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                        {s === "lost" && <XCircle className="mr-1 inline h-3 w-3" />}
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid h-full place-items-center px-3 py-12 text-center text-xs text-ink-tertiary">
              Select a lead to see the full intake and update status.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
