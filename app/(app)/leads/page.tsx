"use client";
import {
  Bot,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Flame,
  Inbox,
  Loader2,
  Mail,
  Phone,
  PhoneCall,
  Plus,
  RefreshCw,
  Search,
  Send,
  Snowflake,
  Sparkles,
  ThermometerSun,
  UserPlus,
  X,
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
  source: "contact-form" | "signup-form" | "operator-add";
  changedFields: string[];
  newMessage?: string;
  triggeredAiReply: boolean;
};
type InboundSms = {
  at: string;
  from: string;
  body: string;
  messageSid?: string;
};
type CallTranscript = {
  at: string;
  callSid: string;
  durationSec: number;
  text: string;
  direction: "outbound" | "inbound";
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
  source: "contact-form" | "signup-form" | "operator-add";
  status: LeadStatus;
  notes?: string;
  aiReply?: AiReply;
  aiFollowups?: AiFollowup[];
  resubmissions?: Resubmission[];
  inboundSms?: InboundSms[];
  callTranscripts?: CallTranscript[];
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

  // ─── Operator notes ─────────────────────────────────────────────────
  // Local draft buffer so typing is responsive; PATCH fires on blur (or
  // explicit Cmd/Ctrl+S). Server side already accepts notes via the same
  // PATCH endpoint -- this just exposes the field in the UI.
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesDirty, setNotesDirty] = useState(false);
  // Reset the draft when the operator picks a different lead.
  useEffect(() => {
    setNotesDraft(selected?.notes ?? "");
    setNotesDirty(false);
  }, [selected?.id, selected?.notes]);

  async function saveNotes() {
    if (!selected) return;
    if (!notesDirty) return;
    setNotesSaving(true);
    try {
      const r = await fetch(`/api/leads/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `PATCH failed (${r.status})`);
      }
      const d = await r.json();
      setLeads((all) => (all ?? []).map((l) => (l.id === selected.id ? d.lead : l)));
      setSelected(d.lead);
      setNotesDirty(false);
      toast("Notes saved");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setNotesSaving(false);
    }
  }

  const [promoting, setPromoting] = useState<string | null>(null);
  const [firingAi, setFiringAi] = useState<string | null>(null);

  /**
   * Manually trigger AI outreach for a lead. The server picks first-touch
   * vs followup based on aiReply state — operator just clicks one button.
   * Useful when the auto-trigger failed (Postmark not approved yet,
   * transient Anthropic error) or when the operator wants to send an
   * extra nudge between cron windows.
   */
  async function fireAiReply(lead: Lead) {
    setFiringAi(lead.id);
    try {
      const r = await fetch(`/api/leads/${lead.id}/ai-reply`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(d.error ?? `AI reply failed (${r.status})`);
      }
      // Server returns the updated lead so we can refresh without a 2nd GET.
      if (d.lead) {
        setLeads((all) => (all ?? []).map((l) => (l.id === lead.id ? d.lead : l)));
        if (selected?.id === lead.id) setSelected(d.lead);
      }
      const kindLabel = d.kind === "followup" ? "followup" : "first-touch reply";
      if (d.status === "sent") {
        toast(`AI ${kindLabel} sent`, "success");
      } else if (d.status === "skipped") {
        toast(
          `AI ${kindLabel} generated but email skipped${d.errorMessage ? ` — ${d.errorMessage}` : ""}`,
          "info",
        );
      } else {
        toast(`AI ${kindLabel} failed${d.errorMessage ? ` — ${d.errorMessage}` : ""}`, "error");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "AI reply failed", "error");
    } finally {
      setFiringAi(null);
    }
  }

  const [bulkRetrying, setBulkRetrying] = useState(false);

  // ─── Manual add lead ──────────────────────────────────────────────
  // When the operator gets a phone-call referral, captures someone at
  // an event, etc. Posts to /api/admin/leads which mirrors the public
  // submit endpoint but tags source="operator-add" and lets the operator
  // choose whether to fire the AI welcome.
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    industry: "",
    timeline: "",
    budget: "",
    message: "",
    triggerAiReply: true,
  });
  function resetAddForm() {
    setAddForm({
      name: "",
      email: "",
      company: "",
      phone: "",
      industry: "",
      timeline: "",
      budget: "",
      message: "",
      triggerAiReply: true,
    });
  }
  async function submitAddLead() {
    if (!addForm.name.trim() || !addForm.email.trim() || !addForm.company.trim()) {
      toast("name, email, and company are required", "error");
      return;
    }
    setAdding(true);
    try {
      const r = await fetch("/api/admin/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(d.error ?? `Add failed (${r.status})`);
      }
      // Refresh list so the new lead shows up + select it so the operator
      // can immediately add notes / promote / etc.
      await load();
      if (d.lead) setSelected(d.lead);
      const aiNote = addForm.triggerAiReply
        ? d.aiReply?.status === "sent"
          ? " · AI welcome sent"
          : d.aiReply?.status === "skipped"
            ? " · AI welcome skipped (provider issue)"
            : ""
        : " · skipped AI welcome";
      const dedupeNote = d.deduped
        ? ` · merged into existing lead${d.changedFields?.length ? ` (added ${d.changedFields.join(", ")})` : ""}`
        : "";
      const promoteNote = d.autoPromoted ? " · auto-promoted to buyer" : "";
      toast(`Lead saved${aiNote}${dedupeNote}${promoteNote}`, "success");
      setAddOpen(false);
      resetAddForm();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Add failed", "error");
    } finally {
      setAdding(false);
    }
  }

  /**
   * Drain the "stuck" queue — every lead in "new" status whose aiReply is
   * missing / errored / skipped / pending. Server processes 20 per click
   * to stay inside the platform function timeout; operator clicks again
   * to keep draining. Useful right after Postmark approval lands.
   */
  async function bulkRetryStuck() {
    setBulkRetrying(true);
    try {
      const r = await fetch("/api/leads/retry-stuck", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(d.error ?? `Retry failed (${r.status})`);
      }
      // Refresh the list so updated aiReply states show
      await load();
      const parts: string[] = [];
      if (d.sent > 0) parts.push(`${d.sent} sent`);
      if (d.skipped > 0) parts.push(`${d.skipped} skipped`);
      if (d.errored > 0) parts.push(`${d.errored} errored`);
      const summary = parts.length > 0 ? parts.join(" · ") : "no candidates";
      if (d.processed === 0) {
        toast("No stuck leads to retry", "info");
      } else if (d.remaining > 0) {
        toast(`${summary} · ${d.remaining} still queued — click again to drain`, "info");
      } else {
        toast(summary, "success");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Bulk retry failed", "error");
    } finally {
      setBulkRetrying(false);
    }
  }

  /**
   * Count of leads that would be processed by bulkRetryStuck. Drives the
   * button label so the operator knows what they're about to do.
   */
  const stuckCount = useMemo(() => {
    if (!leads) return 0;
    return leads.filter((l) => {
      if (l.status !== "new") return false;
      if (!l.aiReply) return true;
      const s = l.aiReply.status;
      return s === "error" || s === "skipped" || s === "pending";
    }).length;
  }, [leads]);

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
        <div className="flex items-center gap-2">
          {stuckCount > 0 && (
            <button
              onClick={bulkRetryStuck}
              disabled={bulkRetrying}
              title="Drain the queue of leads whose AI auto-reply never landed (missing / errored / skipped / pending). Processes 20 per click — re-click to drain."
              className="flex items-center gap-2 rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-2 text-sm font-semibold text-brand-200 hover:bg-brand-500/20 disabled:opacity-60"
            >
              {bulkRetrying ? (
                <><Sparkles className="h-4 w-4 animate-pulse" /> Retrying…</>
              ) : (
                <><Sparkles className="h-4 w-4" /> Retry AI for {stuckCount} stuck</>
              )}
            </button>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            onClick={() => setAddOpen(true)}
            title="Add a lead from a phone call, referral, or trade-show capture"
            className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow"
          >
            <Plus className="h-4 w-4" /> Add lead
          </button>
        </div>
      </div>

      {/* Manual add lead — inline form panel. Same shape as /api/leads
          POST minus IP rate limit + with operator opt-out for the AI
          welcome. Required fields: name, email, company. */}
      {addOpen && (
        <div className="rounded-xl border border-brand-500/40 bg-gradient-to-br from-brand-500/5 to-transparent p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <UserPlus className="h-4 w-4 text-brand-200" /> Add a lead manually
            </div>
            <button
              onClick={() => { setAddOpen(false); resetAddForm(); }}
              className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
              aria-label="Close add form"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1 text-[11px] text-ink-tertiary">
            For phone-call referrals, trade-show captures, or anyone the public form didn&apos;t catch.
            Tagged <code className="rounded bg-bg-hover px-1">source: operator-add</code>. Same dedupe + auto-promote rules as a public submission.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <AddField label="Name *" value={addForm.name} onChange={(v) => setAddForm((f) => ({ ...f, name: v }))} />
            <AddField label="Email *" value={addForm.email} onChange={(v) => setAddForm((f) => ({ ...f, email: v }))} type="email" />
            <AddField label="Company *" value={addForm.company} onChange={(v) => setAddForm((f) => ({ ...f, company: v }))} />
            <AddField label="Phone" value={addForm.phone} onChange={(v) => setAddForm((f) => ({ ...f, phone: v }))} type="tel" />
            <AddField label="Industry" value={addForm.industry} onChange={(v) => setAddForm((f) => ({ ...f, industry: v }))} />
            <AddField label="Timeline" value={addForm.timeline} onChange={(v) => setAddForm((f) => ({ ...f, timeline: v }))} placeholder="e.g. within 2 weeks" />
            <AddField label="Budget" value={addForm.budget} onChange={(v) => setAddForm((f) => ({ ...f, budget: v }))} placeholder="e.g. $5K–$25K" />
          </div>
          <div className="mt-2">
            <label className="text-[10px] uppercase tracking-wider text-ink-tertiary">Message / context</label>
            <textarea
              value={addForm.message}
              onChange={(e) => setAddForm((f) => ({ ...f, message: e.target.value }))}
              placeholder="What did they say? What do they want? Internal context welcome — feeds the AI welcome if you fire it."
              rows={3}
              maxLength={5000}
              className="mt-1 w-full resize-y rounded-md border border-bg-border bg-bg-card p-2 text-xs placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-ink-secondary">
              <input
                type="checkbox"
                checked={addForm.triggerAiReply}
                onChange={(e) => setAddForm((f) => ({ ...f, triggerAiReply: e.target.checked }))}
                className="h-3.5 w-3.5 accent-brand-500"
              />
              Fire AI welcome email (uncheck if you&apos;ll personally reach out)
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => { setAddOpen(false); resetAddForm(); }}
                className="rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-xs hover:bg-bg-hover"
              >
                Cancel
              </button>
              <button
                onClick={submitAddLead}
                disabled={adding}
                className="flex items-center gap-1.5 rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow disabled:opacity-60"
              >
                {adding ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
                ) : (
                  <><Plus className="h-3 w-3" /> Save lead</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* How AI outreach to leads works — explainer banner. Operators land
          here from a "Inbound Leads · LIVE" nav badge and need to know what
          the system does automatically vs what they have to click. */}
      <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-500/15">
            <Bot className="h-4 w-4 text-brand-200" />
          </div>
          <div className="flex-1 text-[12px] text-ink-secondary">
            <div className="font-semibold text-brand-200">How AI outreach to leads works</div>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
              <li>
                <span className="font-semibold text-ink-primary">T+0</span> — lead submits <code className="rounded bg-bg-hover px-1">/contact</code>; AI auto-replies via email
                {" "}(+ SMS if phone given). You get a notification email at the same time.
              </li>
              <li>
                <span className="font-semibold text-ink-primary">If score ≥ 70</span>, the lead is auto-promoted to a Buyer and the Outreach Agent
                {" "}starts drafting product-specific pitches in <a href="/outreach" className="text-brand-300 underline">/outreach</a>.
              </li>
              <li>
                <span className="font-semibold text-ink-primary">Day +3, +6, +9</span> — daily cron fires shorter follow-up nudges if the lead is still in <code className="rounded bg-bg-hover px-1">new</code>.
              </li>
              <li>
                <span className="font-semibold text-ink-primary">Manual override</span> — open any lead below and click <span className="font-semibold text-brand-200">Send AI reply now</span> to retry / nudge on demand.
              </li>
            </ol>
          </div>
        </div>
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

              {/* Inbound SMS replies — populated by /api/webhooks/twilio/sms.
                  Newest first. Each reply triggers an operator email + lands
                  here so the operator sees the conversation in context with
                  the AI auto-reply / followup history above. */}
              {selected.inboundSms && selected.inboundSms.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-ink-tertiary">
                    Inbound SMS replies
                    <span className="rounded-md bg-accent-green/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-green">
                      {selected.inboundSms.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {selected.inboundSms.slice().reverse().map((m, i) => (
                      <div key={m.messageSid ?? i} className="rounded-md border border-accent-green/30 bg-accent-green/5 p-3 text-xs">
                        <div className="flex items-center gap-2 text-[11px] text-ink-tertiary">
                          <Phone className="h-3 w-3 text-accent-green" />
                          <span className="font-mono">{m.from}</span>
                          <span>·</span>
                          <span>{relativeTime(m.at)}</span>
                        </div>
                        <div className="mt-1 whitespace-pre-wrap text-ink-primary">{m.body}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Call transcripts (slice 60 + 63) — Twilio voice
                  transcribeCallback writes here when the call's
                  toNumber matches this lead's phone (suffix-match).
                  Both inbound and outbound legs surface here so the
                  operator sees the full conversation history alongside
                  SMS + AI followups. Text is capped at 4000 chars
                  upstream. */}
              {selected.callTranscripts && selected.callTranscripts.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-ink-tertiary">
                    Call transcripts
                    <span className="rounded-md bg-accent-blue/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-blue">
                      {selected.callTranscripts.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {selected.callTranscripts
                      .slice()
                      .sort((a, b) => +new Date(b.at) - +new Date(a.at))
                      .map((c) => (
                        <div
                          key={c.callSid}
                          className="rounded-md border border-accent-blue/30 bg-accent-blue/5 p-3 text-xs"
                        >
                          <div className="flex items-center gap-2 text-[11px] text-ink-tertiary">
                            <PhoneCall className="h-3 w-3 text-accent-blue" />
                            <span className="rounded bg-bg-hover px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                              {c.direction}
                            </span>
                            {c.durationSec > 0 && (
                              <>
                                <span>·</span>
                                <span>
                                  {Math.floor(c.durationSec / 60)}m {c.durationSec % 60}s
                                </span>
                              </>
                            )}
                            <span>·</span>
                            <span>{relativeTime(c.at)}</span>
                            <span className="ml-auto font-mono text-[10px]">
                              {c.callSid.slice(-8)}
                            </span>
                          </div>
                          <div className="mt-1.5 whitespace-pre-wrap text-ink-primary">{c.text}</div>
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

              {/* Operator notes — free-text annotations. Persists via PATCH
                  /api/leads/[id]. Saves on blur (or Cmd/Ctrl+S); editing UX
                  matches the Settings page so the pattern is familiar. */}
              <div>
                <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-ink-tertiary">
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" /> Notes
                  </span>
                  <span className="flex items-center gap-2">
                    {notesDirty && !notesSaving && (
                      <span className="text-accent-amber normal-case tracking-normal">unsaved</span>
                    )}
                    {notesSaving && (
                      <span className="flex items-center gap-1 normal-case tracking-normal">
                        <Loader2 className="h-3 w-3 animate-spin" /> saving
                      </span>
                    )}
                  </span>
                </div>
                <textarea
                  value={notesDraft}
                  onChange={(e) => {
                    setNotesDraft(e.target.value);
                    setNotesDirty(e.target.value !== (selected.notes ?? ""));
                  }}
                  onBlur={saveNotes}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                      e.preventDefault();
                      saveNotes();
                    }
                  }}
                  placeholder="Why this lead matters, who introduced them, what they actually want…"
                  rows={3}
                  maxLength={5000}
                  className="w-full resize-y rounded-md border border-bg-border bg-bg-card p-2 text-xs placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
                />
                <div className="mt-1 flex items-center justify-between text-[10px] text-ink-tertiary">
                  <span>Saves on blur · ⌘S to save now</span>
                  <span>{notesDraft.length}/5000</span>
                </div>
              </div>

              {/* Manual AI outreach trigger — server picks first-touch vs
                  followup based on aiReply state. Always available so the
                  operator can retry when Postmark is suppressed / un-approved
                  or send an extra nudge between cron windows. */}
              <div>
                <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-ink-tertiary">
                  <span>AI outreach</span>
                  {selected.aiReply?.status === "sent" && (
                    <span className="rounded bg-accent-green/15 px-1.5 py-0.5 text-[9px] font-semibold text-accent-green">
                      first reply sent
                    </span>
                  )}
                  {selected.aiReply?.status === "error" && (
                    <span className="rounded bg-accent-red/15 px-1.5 py-0.5 text-[9px] font-semibold text-accent-red">
                      auto-reply errored
                    </span>
                  )}
                  {selected.aiReply?.status === "skipped" && (
                    <span className="rounded bg-accent-amber/15 px-1.5 py-0.5 text-[9px] font-semibold text-accent-amber">
                      auto-reply skipped
                    </span>
                  )}
                  {!selected.aiReply && (
                    <span className="rounded bg-bg-hover px-1.5 py-0.5 text-[9px] font-semibold text-ink-tertiary">
                      never run
                    </span>
                  )}
                </div>
                <button
                  onClick={() => fireAiReply(selected)}
                  disabled={firingAi === selected.id}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-2 text-[11px] font-semibold text-brand-200 transition hover:bg-brand-500/20 disabled:opacity-60"
                  title={
                    selected.aiReply?.status === "sent"
                      ? "Send a fresh follow-up nudge to this lead now"
                      : "Generate + send the first-touch AI reply now"
                  }
                >
                  {firingAi === selected.id ? (
                    <><Sparkles className="h-3.5 w-3.5 animate-pulse" /> Generating…</>
                  ) : selected.aiReply?.status === "sent" ? (
                    <><Send className="h-3.5 w-3.5" /> Send AI followup now</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5" /> Send AI reply now</>
                  )}
                </button>
                <div className="mt-1.5 text-[10px] text-ink-tertiary">
                  {selected.aiReply?.status === "sent"
                    ? "Generates a shorter second-touch nudge and appends it to followups below."
                    : selected.aiReply?.status === "error" || selected.aiReply?.status === "skipped"
                      ? "Re-runs the first-touch reply. Useful when Postmark blocked the auto-trigger."
                      : "Generates and sends the personalized intro email (+ SMS if phone given)."}
                </div>
              </div>

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
                      href={`/buyers?focus=${encodeURIComponent(selected.promotedToBuyerId)}`}
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

function AddField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 h-9 w-full rounded-md border border-bg-border bg-bg-card px-2 text-xs placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
      />
    </label>
  );
}
