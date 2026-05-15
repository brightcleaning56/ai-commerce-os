"use client";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  SkipForward,
  Voicemail,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * /queue — unified outreach inbox (slice 2 of the queue stack).
 *
 * Aggregates every pending touch across channels (call / email / sms)
 * and directions (outbound / inbound) into one timeline. Replaces
 * "operator hops between /tasks, /calls, /leads, /outreach to see what
 * needs doing" with one screen.
 *
 * Read layer is /api/queue (computed at request time from existing
 * stores). Slice 1 ships the model + adapters; this slice renders it.
 *
 * Actions in slice 2 are deep-links into the source-of-truth detail
 * view (open the task, play the voicemail, jump to the lead). Slice 3
 * adds in-line actions (call now, send email, send SMS) and slice 4
 * introduces a sidebar badge + global toast for inbound items.
 */

type QueueChannel = "call" | "email" | "sms";
type QueueDirection = "outbound" | "inbound";
type QueueStatus = "pending" | "in_progress" | "done" | "skipped" | "failed";
type QueuePriority = "urgent" | "today" | "later";
type QueueRefKind =
  | "task"
  | "lead"
  | "lead-followup"
  | "lead-sms"
  | "voicemail"
  | "draft"
  | "cadence";

type QueueItem = {
  id: string;
  channel: QueueChannel;
  direction: QueueDirection;
  status: QueueStatus;
  buyerId?: string;
  buyerName?: string;
  buyerCompany?: string;
  to?: string;
  from?: string;
  subject?: string;
  body?: string;
  dueAt: string;
  priority: QueuePriority;
  ref: { kind: QueueRefKind; id: string };
  source: string;
  outcome?: string;
  notes?: string;
  doneAt?: string;
  requiresApproval?: boolean;
  approvedBy?: string;
  approvedAt?: string;
  retryCount?: number;
  lastRetryAt?: string;
  createdAt: string;
  updatedAt: string;
};

type QueueResponse = {
  items: QueueItem[];
  count: number;
  generatedAt: string;
  sources: {
    tasks: number;
    voicemails: number;
    leadSms: number;
    leadFollowups: number;
    newLeads: number;
    cadences?: number;
  };
};

const CHANNEL_ICON: Record<QueueChannel, typeof Phone> = {
  call: Phone,
  email: Mail,
  sms: MessageSquare,
};

const PRIORITY_TONE: Record<QueuePriority, string> = {
  urgent: "border-accent-red/40 bg-accent-red/5 text-accent-red",
  today: "border-accent-amber/40 bg-accent-amber/5 text-accent-amber",
  later: "border-bg-border bg-bg-card text-ink-tertiary",
};

const PRIORITY_LABEL: Record<QueuePriority, string> = {
  urgent: "Urgent",
  today: "Today",
  later: "Later",
};

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) {
    const future = -ms;
    if (future < 3_600_000) return `in ${Math.ceil(future / 60_000)}m`;
    if (future < 86_400_000) return `in ${Math.ceil(future / 3_600_000)}h`;
    return `in ${Math.ceil(future / 86_400_000)}d`;
  }
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

/**
 * Pick a deep-link for the item's "Open" button. Voicemails go to
 * /calls (where the audio player lives), tasks go to /tasks?focus=,
 * lead-related items go to /leads. Drafts (slice 3) go to /outreach.
 */
function detailHref(item: QueueItem): string {
  switch (item.ref.kind) {
    case "task":
      return `/tasks?focus=${encodeURIComponent(item.ref.id)}`;
    case "voicemail":
      return `/calls?voicemail=${encodeURIComponent(item.ref.id)}`;
    case "lead":
    case "lead-followup":
      return `/leads?focus=${encodeURIComponent(item.ref.id)}`;
    case "lead-sms": {
      // ref.id is "<leadId>:<index>" — strip index for the deep-link
      const [leadId] = item.ref.id.split(":");
      return `/leads?focus=${encodeURIComponent(leadId)}`;
    }
    case "draft":
      return `/outreach?draft=${encodeURIComponent(item.ref.id)}`;
    case "cadence":
      // Slice 3 ships cadences without an admin UI (item.id is the
      // CadenceQueueItem id). Deep-link to the buyer detail so the
      // operator can act manually; slice 4 builds the inline action
      // drawer + auto-send opt-in.
      return item.buyerId ? `/buyers/${encodeURIComponent(item.buyerId)}` : "/queue";
  }
}

export default function QueuePage() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<QueueChannel | "all">("all");
  const [directionFilter, setDirectionFilter] = useState<QueueDirection | "all">("all");
  const [needsApprovalOnly, setNeedsApprovalOnly] = useState(false);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [search, setSearch] = useState("");
  // Bulk-selection set (cadence pending items only). Cleared on
  // refresh, action, or filter change to avoid stale ids.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkApprovalConfirm, setBulkApprovalConfirm] = useState(false);
  // Per-failure drilldown surfaces after a bulk action returns mixed
  // results -- operator can see which buyer + reason for each failure
  // without trawling logs.
  const [bulkFailures, setBulkFailures] = useState<Array<{ id: string; reason: string }>>([]);
  // Cadence rows can expand inline to reveal an action drawer (send /
  // skip / record outcome) so the operator works the queue without
  // navigating away. Non-cadence rows still deep-link.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actingOnId, setActingOnId] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 24-hour completion window when the toggle is on. Server caps
      // at 168h regardless.
      const params = new URLSearchParams();
      if (includeCompleted) params.set("includeCompletedWithinHours", "24");
      const url = `/api/queue${params.toString() ? `?${params}` : ""}`;
      const r = await fetch(url, { cache: "no-store", credentials: "include" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Load failed (${r.status})`);
      }
      const d = (await r.json()) as QueueResponse;
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load queue");
    } finally {
      setLoading(false);
    }
  }, [includeCompleted]);

  useEffect(() => {
    void load();
    // Light polling so a teammate's action / inbound webhook shows up
    // without the operator having to hit refresh. 30s matches /tasks
    // poll cadence so we're consistent across surfaces.
    const i = setInterval(() => void load(), 30_000);
    return () => clearInterval(i);
  }, [load]);

  // Clear selection when filters change so the operator doesn't
  // accidentally act on items they can't see anymore.
  useEffect(() => {
    setSelected(new Set());
  }, [channelFilter, directionFilter, needsApprovalOnly, includeCompleted]);

  function toggleSelected(itemId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  /**
   * Bulk action — POSTs to /api/cadence-items/bulk-action with the
   * selected ids. Handles the 412 "needs approval" gate by showing
   * an inline confirm bar; second click sends with confirmApproval=true.
   */
  async function bulkAct(action: "send" | "skip") {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    setActionToast(null);
    try {
      const r = await fetch("/api/cadence-items/bulk-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ids,
          action,
          confirmApproval: bulkApprovalConfirm,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 412) {
        // Approval gate -- show the confirm UI without clearing selection
        setActionToast({
          tone: "err",
          text: `${d.gatedIds?.length ?? 0} of ${ids.length} need approval. Confirm below to proceed.`,
        });
        setBulkApprovalConfirm(false);
        return;
      }
      if (!r.ok) throw new Error(d.error ?? `Bulk action failed (${r.status})`);
      setActionToast({
        tone: d.summary.failed === 0 ? "ok" : "err",
        text:
          action === "send"
            ? `${d.summary.succeeded} sent, ${d.summary.failed} failed of ${d.summary.total}`
            : `${d.summary.succeeded} skipped, ${d.summary.failed} failed of ${d.summary.total}`,
      });
      // Stash per-failure rows so the drilldown panel can render them
      // after the bulk-action bar disappears.
      const failures = (d.results ?? [])
        .filter((r: { ok: boolean }) => !r.ok)
        .map((r: { id: string; reason?: string }) => ({
          id: r.id,
          reason: r.reason ?? "Unknown error",
        }));
      setBulkFailures(failures);
      setSelected(new Set());
      setBulkApprovalConfirm(false);
      await load();
    } catch (e) {
      setActionToast({
        tone: "err",
        text: e instanceof Error ? e.message : "Bulk action failed",
      });
    } finally {
      setBulkBusy(false);
    }
  }

  /**
   * Cadence-item action — POSTs to /api/cadence-items/[id]/action
   * which sends the email/SMS (action="send"), records a manual
   * outcome (action="outcome", e.g. for call channels), or skips
   * the step (action="skip"). All three mark the item done so it
   * drops off the inbox + record outcome on the parent enrollment
   * for branch evaluation on the next cron tick.
   *
   * approvalConfirmed flag is forwarded as confirmApproval:true on
   * the request body. The endpoint returns 412 when an item requires
   * approval and confirmation wasn't included; the drawer surfaces
   * a checkbox in that case.
   */
  async function actOnCadenceItem(
    itemId: string,
    payload:
      | { action: "send" }
      | { action: "outcome"; outcome: string }
      | { action: "skip" },
    approvalConfirmed?: boolean,
  ) {
    setActingOnId(itemId);
    setActionToast(null);
    try {
      const r = await fetch(`/api/cadence-items/${itemId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...payload, confirmApproval: approvalConfirmed }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `Action failed (${r.status})`);
      // Tone "ok" includes "sent" successes AND skip/outcome (no send)
      const text =
        payload.action === "send"
          ? d.sent
            ? "Sent — item marked done"
            : `Send failed: ${d.errorMessage ?? "unknown"} — item marked failed`
          : payload.action === "skip"
            ? "Skipped"
            : `Recorded outcome: ${payload.outcome}`;
      setActionToast({
        tone: payload.action === "send" && !d.sent ? "err" : "ok",
        text,
      });
      setExpandedId(null);
      await load();
    } catch (e) {
      setActionToast({
        tone: "err",
        text: e instanceof Error ? e.message : "Action failed",
      });
    } finally {
      setActingOnId(null);
    }
  }

  const filtered = useMemo(() => {
    if (!data) return [] as QueueItem[];
    let items = data.items;
    if (channelFilter !== "all") items = items.filter((i) => i.channel === channelFilter);
    if (directionFilter !== "all") items = items.filter((i) => i.direction === directionFilter);
    if (needsApprovalOnly) items = items.filter((i) => i.requiresApproval);
    const q = search.trim().toLowerCase();
    if (q) {
      items = items.filter((i) => {
        return (
          i.buyerName?.toLowerCase().includes(q) ||
          i.buyerCompany?.toLowerCase().includes(q) ||
          i.to?.toLowerCase().includes(q) ||
          i.from?.toLowerCase().includes(q) ||
          i.subject?.toLowerCase().includes(q) ||
          i.body?.toLowerCase().includes(q) ||
          i.source.toLowerCase().includes(q)
        );
      });
    }
    return items;
  }, [data, channelFilter, directionFilter, search]);

  const counts = useMemo(() => {
    const items = data?.items ?? [];
    return {
      urgent: items.filter((i) => i.priority === "urgent").length,
      today: items.filter((i) => i.priority === "today").length,
      later: items.filter((i) => i.priority === "later").length,
      inbound: items.filter((i) => i.direction === "inbound").length,
      outbound: items.filter((i) => i.direction === "outbound").length,
      call: items.filter((i) => i.channel === "call").length,
      email: items.filter((i) => i.channel === "email").length,
      sms: items.filter((i) => i.channel === "sms").length,
      needsApproval: items.filter((i) => i.requiresApproval).length,
    };
  }, [data]);

  // The set of cadence pending items currently visible (after filters).
  // Drives the select-all checkbox state + the "select all visible" action.
  const selectableIds = useMemo(
    () => filtered.filter((i) => i.ref.kind === "cadence" && i.status === "pending").map((i) => i.id),
    [filtered],
  );
  const allVisibleSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const someVisibleSelected = !allVisibleSelected && selectableIds.some((id) => selected.has(id));

  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      // Deselect everything visible
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of selectableIds) next.delete(id);
        return next;
      });
    } else {
      // Add all visible to selection
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of selectableIds) next.add(id);
        return next;
      });
    }
  }

  // Buyer lookup by id for the drilldown panel (so we can show
  // "FitLife Co.: bounced" instead of an opaque cadence-item id).
  const itemById = useMemo(() => {
    const map = new Map<string, QueueItem>();
    for (const i of data?.items ?? []) map.set(i.id, i);
    return map;
  }, [data]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Queue</h1>
          <p className="text-[12px] text-ink-tertiary">
            One inbox for every pending touch — outbound calls, drafted
            emails, inbound SMS, missed voicemails, brand-new leads.
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
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <SummaryTile label="Urgent" value={counts.urgent} tone="red" Icon={AlertTriangle} />
        <SummaryTile label="Due today" value={counts.today} tone="amber" Icon={Inbox} />
        <SummaryTile label="Inbound" value={counts.inbound} tone="blue" Icon={ArrowDownCircle} />
        <SummaryTile label="Outbound" value={counts.outbound} tone="default" Icon={ArrowUpCircle} />
        <SummaryTile label="Total" value={data?.items.length ?? 0} tone="default" Icon={Inbox} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-bg-border bg-bg-card p-3">
        <FilterPill
          label="All channels"
          active={channelFilter === "all"}
          onClick={() => setChannelFilter("all")}
        />
        <FilterPill
          label={`Calls (${counts.call})`}
          Icon={Phone}
          active={channelFilter === "call"}
          onClick={() => setChannelFilter("call")}
        />
        <FilterPill
          label={`Email (${counts.email})`}
          Icon={Mail}
          active={channelFilter === "email"}
          onClick={() => setChannelFilter("email")}
        />
        <FilterPill
          label={`SMS (${counts.sms})`}
          Icon={MessageSquare}
          active={channelFilter === "sms"}
          onClick={() => setChannelFilter("sms")}
        />
        <span className="mx-1 h-5 w-px bg-bg-border" />
        <FilterPill
          label="Both"
          active={directionFilter === "all"}
          onClick={() => setDirectionFilter("all")}
        />
        <FilterPill
          label="Inbound"
          Icon={ArrowDownCircle}
          active={directionFilter === "inbound"}
          onClick={() => setDirectionFilter("inbound")}
        />
        <FilterPill
          label="Outbound"
          Icon={ArrowUpCircle}
          active={directionFilter === "outbound"}
          onClick={() => setDirectionFilter("outbound")}
        />
        <span className="mx-1 h-5 w-px bg-bg-border" />
        <FilterPill
          label={`Needs approval (${counts.needsApproval})`}
          Icon={ShieldCheck}
          active={needsApprovalOnly}
          onClick={() => setNeedsApprovalOnly((v) => !v)}
        />
        <FilterPill
          label="Completed (24h)"
          Icon={Check}
          active={includeCompleted}
          onClick={() => setIncludeCompleted((v) => !v)}
        />
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
          <input
            type="search"
            placeholder="Search buyer / number / body…"
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

      {/* Bulk action bar -- floats at top when N items selected OR
          when there's at least one selectable item visible (so the
          select-all checkbox is always reachable). */}
      {(selected.size > 0 || selectableIds.length > 0) && (
        <div className="sticky top-0 z-30 -mx-1 mb-2 flex flex-wrap items-center gap-3 rounded-xl border border-accent-blue/40 bg-bg-panel/95 px-4 py-3 shadow-lg backdrop-blur">
          {/* Select-all visible -- tri-state: empty / indeterminate / all */}
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              ref={(el) => {
                if (el) el.indeterminate = someVisibleSelected;
              }}
              onChange={toggleSelectAllVisible}
              className="h-3.5 w-3.5 rounded border-bg-border accent-accent-blue"
              aria-label="Select all visible"
            />
            <span className="text-[11px] text-ink-secondary">
              {allVisibleSelected
                ? `All ${selectableIds.length} selected`
                : someVisibleSelected
                  ? `Select all ${selectableIds.length} visible`
                  : `Select all ${selectableIds.length} visible`}
            </span>
          </label>
          {selected.size > 0 && (
            <div className="text-[12px] font-semibold text-accent-blue">
              {selected.size} item{selected.size === 1 ? "" : "s"} selected
            </div>
          )}
          {selected.size > 0 && (
            <>
              {/* Approval confirmation strip (shown only after a 412 came back) */}
              {actionToast?.tone === "err" && actionToast.text.includes("approval") && (
                <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent-amber">
                  <input
                    type="checkbox"
                    checked={bulkApprovalConfirm}
                    onChange={(e) => setBulkApprovalConfirm(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-bg-border accent-accent-amber"
                  />
                  I reviewed all selected — approve to send
                </label>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => void bulkAct("send")}
                  className="inline-flex items-center gap-1 rounded-md bg-accent-blue px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {bulkBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Send all
                </button>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => void bulkAct("skip")}
                  className="inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-[12px] text-ink-secondary hover:bg-bg-hover disabled:opacity-50"
                >
                  <SkipForward className="h-3 w-3" />
                  Skip all
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(new Set());
                    setBulkApprovalConfirm(false);
                  }}
                  className="rounded-md border border-bg-border bg-bg-app p-1.5 text-ink-tertiary hover:text-ink-primary"
                  aria-label="Clear selection"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Drilldown panel -- shows after a bulk action returns failures.
          Operator gets buyer name + reason per failure so they can
          fix root cause + retry, instead of triaging from the toast. */}
      {bulkFailures.length > 0 && (
        <div className="rounded-md border border-accent-red/40 bg-accent-red/5 px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-accent-red">
              <AlertTriangle className="h-3.5 w-3.5" />
              {bulkFailures.length} failure{bulkFailures.length === 1 ? "" : "s"} from last bulk action
            </div>
            <button
              type="button"
              onClick={() => setBulkFailures([])}
              className="text-ink-tertiary hover:text-ink-primary"
              aria-label="Dismiss"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <ul className="space-y-1">
            {bulkFailures.map((f) => {
              const item = itemById.get(f.id);
              const label = item?.buyerName || item?.buyerCompany || f.id;
              return (
                <li key={f.id} className="flex items-start gap-2 text-[11px]">
                  <span className="font-mono text-ink-tertiary">·</span>
                  <span className="font-medium text-ink-primary">{label}</span>
                  <span className="text-ink-tertiary">—</span>
                  <span className="flex-1 text-accent-red">{f.reason}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {actionToast && (
        <div
          className={`flex items-start gap-2 rounded-md border px-3 py-2 text-[12px] ${
            actionToast.tone === "ok"
              ? "border-accent-green/30 bg-accent-green/5 text-accent-green"
              : "border-accent-red/30 bg-accent-red/5 text-accent-red"
          }`}
        >
          {actionToast.tone === "ok" ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <div className="flex-1">{actionToast.text}</div>
          <button onClick={() => setActionToast(null)}>
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Source breakdown — small honesty footer so operator knows what's in here */}
      {data && (
        <div className="rounded-md border border-bg-border bg-bg-card/40 px-3 py-2 text-[11px] text-ink-tertiary">
          Aggregating: {data.sources.tasks} task
          {data.sources.tasks === 1 ? "" : "s"} · {data.sources.voicemails} voicemail
          {data.sources.voicemails === 1 ? "" : "s"} · {data.sources.leadSms} inbound SMS ·{" "}
          {data.sources.leadFollowups} auto-followup
          {data.sources.leadFollowups === 1 ? "" : "s"} · {data.sources.newLeads} new lead
          {data.sources.newLeads === 1 ? "" : "s"}
          {data.sources.cadences != null && (
            <>
              {" · "}
              {data.sources.cadences} cadence-scheduled
            </>
          )}
          {" · last fetched "}
          {relTime(data.generatedAt)}
        </div>
      )}

      {/* Item list */}
      {loading && !data ? (
        <div className="flex h-40 items-center justify-center text-ink-tertiary">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading queue…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-bg-border bg-bg-card p-10 text-center">
          <Inbox className="mx-auto mb-3 h-8 w-8 text-ink-tertiary/60" />
          <div className="text-sm font-semibold">Nothing in queue</div>
          <p className="mt-1 text-[12px] text-ink-tertiary">
            {data && data.items.length > 0
              ? "All items hidden by current filters."
              : "Inbox empty — every pending touch has been handled."}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              acting={actingOnId === item.id}
              selected={selected.has(item.id)}
              onToggleSelect={() => toggleSelected(item.id)}
              onToggleExpand={() =>
                setExpandedId((prev) => (prev === item.id ? null : item.id))
              }
              onAction={(itemId, payload, approvalConfirmed) =>
                void actOnCadenceItem(itemId, payload, approvalConfirmed)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────

function SummaryTile({
  label,
  value,
  tone,
  Icon,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "blue" | "default";
  Icon: React.ComponentType<{ className?: string }>;
}) {
  const toneClasses =
    tone === "red"
      ? "border-accent-red/40 bg-accent-red/5"
      : tone === "amber"
      ? "border-accent-amber/40 bg-accent-amber/5"
      : tone === "blue"
      ? "border-accent-blue/40 bg-accent-blue/5"
      : "border-bg-border bg-bg-card";
  const iconTone =
    tone === "red"
      ? "text-accent-red"
      : tone === "amber"
      ? "text-accent-amber"
      : tone === "blue"
      ? "text-accent-blue"
      : "text-ink-tertiary";
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 ${toneClasses}`}>
      <Icon className={`h-4 w-4 ${iconTone}`} />
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
          {label}
        </div>
        <div className="text-lg font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function FilterPill({
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

type ActionFn = (
  itemId: string,
  payload: { action: "send" } | { action: "outcome"; outcome: string } | { action: "skip" },
  approvalConfirmed?: boolean,
) => void;

function QueueRow({
  item,
  expanded,
  acting,
  selected,
  onToggleSelect,
  onToggleExpand,
  onAction,
}: {
  item: QueueItem;
  expanded: boolean;
  acting: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onAction: ActionFn;
}) {
  const Icon =
    item.ref.kind === "voicemail" ? Voicemail : CHANNEL_ICON[item.channel];
  const directionIcon =
    item.direction === "inbound" ? (
      <ArrowDownCircle className="h-3.5 w-3.5 text-accent-blue" />
    ) : (
      <ArrowUpCircle className="h-3.5 w-3.5 text-ink-tertiary" />
    );
  const contact = item.buyerName || item.buyerCompany || item.from || item.to || "Unknown";
  const subContact =
    item.buyerName && item.buyerCompany && item.buyerName !== item.buyerCompany
      ? item.buyerCompany
      : item.to || item.from;
  // Cadence rows expand inline to reveal the action drawer; everything
  // else still deep-links to the source detail view (where the operator
  // already has full UI for that record type).
  const isCadence = item.ref.kind === "cadence";
  const isSelectable = isCadence && item.status === "pending";

  const headerInner = (
    <div className="flex items-center gap-3">
      {isSelectable ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-3.5 w-3.5 rounded border-bg-border accent-accent-blue"
          aria-label="Select for bulk action"
        />
      ) : (
        <span className="w-3.5" />
      )}
      {isCadence ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="text-ink-tertiary hover:text-ink-primary"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      ) : (
        <span className="w-4" />
      )}
      {/* Channel icon */}
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-bg-app">
        <Icon className="h-4 w-4 text-ink-secondary" />
      </div>

      {/* Contact + body */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {directionIcon}
          <span className="truncate text-[13px] font-semibold text-ink-primary">{contact}</span>
          {subContact && subContact !== contact && (
            <span className="truncate text-[11px] text-ink-tertiary">· {subContact}</span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-ink-tertiary">
          {item.subject ? <span className="font-medium">{item.subject}</span> : null}
          {item.subject && item.body ? " — " : null}
          {item.body?.slice(0, 200)}
        </div>
      </div>

      {/* Meta + priority */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Status badge for completed items: green for done, gray for skipped, red for failed.
            Only relevant when include-completed toggle is on -- otherwise these don't render. */}
        {item.status !== "pending" && item.status !== "in_progress" && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              item.status === "done"
                ? "border-accent-green/40 bg-accent-green/10 text-accent-green"
                : item.status === "failed"
                  ? "border-accent-red/40 bg-accent-red/10 text-accent-red"
                  : "border-bg-border bg-bg-card text-ink-tertiary"
            }`}
            title={item.outcome ? `Outcome: ${item.outcome}` : undefined}
          >
            {item.status === "done" ? <Check className="h-2.5 w-2.5" /> : null}
            {item.outcome || item.status}
          </span>
        )}
        {/* Slice 32: retry-in-progress badge for pending items mid-retry.
            Shown only when retryCount > 0 AND status is still pending
            (the runner pushed dueAt forward, item is back in queue). */}
        {item.status === "pending" && (item.retryCount ?? 0) > 0 && (
          <span
            className="inline-flex items-center gap-0.5 rounded-full border border-accent-amber/40 bg-accent-amber/10 px-2 py-0.5 text-[10px] font-medium text-accent-amber"
            title={
              item.lastRetryAt
                ? `Retry attempt ${item.retryCount}, last retried ${new Date(item.lastRetryAt).toLocaleString()}`
                : `Retry attempt ${item.retryCount}`
            }
          >
            <RotateCcw className="h-2.5 w-2.5" />
            retry {item.retryCount}
          </span>
        )}
        {/* Approval audit -- shown when stamp present (completed approval-required items).
            Live "Needs approval" pill stays amber for pending items still requiring signoff. */}
        {item.approvedBy && item.status !== "pending" ? (
          <span
            className="inline-flex items-center gap-0.5 rounded-full border border-accent-blue/40 bg-accent-blue/10 px-2 py-0.5 text-[10px] font-medium text-accent-blue"
            title={`Approved by ${item.approvedBy}${item.approvedAt ? ` at ${new Date(item.approvedAt).toLocaleString()}` : ""}`}
          >
            <ShieldCheck className="h-2.5 w-2.5" />
            {item.approvedBy.split("@")[0]}
          </span>
        ) : item.requiresApproval && item.status === "pending" ? (
          <span
            className="inline-flex items-center gap-0.5 rounded-full border border-accent-amber/40 bg-accent-amber/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-amber"
            title="Workspace approval policy says this needs human signoff before it can be sent"
          >
            <ShieldCheck className="h-2.5 w-2.5" />
            Approval
          </span>
        ) : null}
        {item.status === "pending" && (
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PRIORITY_TONE[item.priority]}`}
            title={`Source: ${item.source}`}
          >
            {PRIORITY_LABEL[item.priority]}
          </span>
        )}
        <span className="font-mono text-[10px] text-ink-tertiary">
          {item.status === "pending" ? relTime(item.dueAt) : `done ${item.doneAt ? relTime(item.doneAt) : relTime(item.updatedAt)}`}
        </span>
      </div>
    </div>
  );

  return (
    <div className="rounded-lg border border-bg-border bg-bg-card transition-colors hover:border-accent-blue/40">
      {isCadence ? (
        <div className="px-3 py-2.5">{headerInner}</div>
      ) : (
        <Link href={detailHref(item)} className="group block px-3 py-2.5 hover:bg-bg-hover">
          {headerInner}
        </Link>
      )}

      {/* Inline action drawer — cadence-scheduled items only */}
      {isCadence && expanded && (
        <CadenceActionDrawer item={item} acting={acting} onAction={onAction} />
      )}
    </div>
  );
}

function CadenceActionDrawer({
  item,
  acting,
  onAction,
}: {
  item: QueueItem;
  acting: boolean;
  onAction: ActionFn;
}) {
  const channel = item.channel;
  const canSend = (channel === "email" || channel === "sms") && !!item.to;
  const callOutcomes = ["connected", "voicemail", "no-answer", "wrong-number", "callback-scheduled"];
  const [approved, setApproved] = useState(false);
  const needsApproval = !!item.requiresApproval;
  const isDone = item.status !== "pending" && item.status !== "in_progress";
  const actionsDisabled = acting || isDone || (needsApproval && !approved);

  // Read-only audit view for already-completed items (visible when the
  // include-completed toggle is on). Operator can still see preview +
  // approval audit + outcome but no action buttons render.
  if (isDone) {
    return (
      <div className="border-t border-bg-border bg-bg-app/40 px-4 py-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
          {channel === "email" ? "Email preview" : channel === "sms" ? "SMS preview" : "Call script"}
        </div>
        {item.subject && (
          <div className="mb-1 text-[12px] font-semibold text-ink-primary">
            Subject: {item.subject}
          </div>
        )}
        <div className="whitespace-pre-wrap rounded-md border border-bg-border bg-bg-card px-3 py-2 text-[12px] text-ink-secondary">
          {item.body || "(empty body)"}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="text-[11px]">
            <span className="text-ink-tertiary">Outcome:</span>{" "}
            <span className="font-mono text-ink-primary">{item.outcome ?? item.status}</span>
          </div>
          {item.doneAt && (
            <div className="text-[11px]">
              <span className="text-ink-tertiary">Completed:</span>{" "}
              <span className="text-ink-secondary">{new Date(item.doneAt).toLocaleString()}</span>
            </div>
          )}
          {item.approvedBy && (
            <div className="text-[11px] sm:col-span-2">
              <span className="text-ink-tertiary">Approved by:</span>{" "}
              <span className="font-mono text-accent-blue">{item.approvedBy}</span>
              {item.approvedAt && (
                <span className="ml-1 text-ink-tertiary">
                  · {new Date(item.approvedAt).toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-bg-border bg-bg-app/40 px-4 py-3">
      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
            {channel === "email" ? "Email preview" : channel === "sms" ? "SMS preview" : "Call script"}
          </div>
          {item.subject && (
            <div className="mb-1 text-[12px] font-semibold text-ink-primary">
              Subject: {item.subject}
            </div>
          )}
          <div className="whitespace-pre-wrap rounded-md border border-bg-border bg-bg-card px-3 py-2 text-[12px] text-ink-secondary">
            {item.body || (channel === "call"
              ? "No script provided. Use this prompt: introduce yourself, ask one qualifying question, propose a 15-min follow-up."
              : "(empty body)")}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
            Destination
          </div>
          <div className="rounded-md border border-bg-border bg-bg-card px-3 py-2 text-[12px]">
            <div className="font-mono text-ink-primary">{item.to ?? "(none)"}</div>
            {!item.to && (
              <div className="mt-1 text-[10px] text-accent-amber">
                Buyer doesn't have a {channel === "email" ? "email" : "phone"} on record. Update the buyer or skip this step.
              </div>
            )}
          </div>
          <div className="mt-2 text-[10px] text-ink-tertiary">{item.source}</div>
        </div>
      </div>

      {needsApproval && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-accent-amber/40 bg-accent-amber/5 px-3 py-2">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-amber" />
          <div className="flex-1 text-[11px]">
            <div className="font-semibold text-accent-amber">Needs approval before send</div>
            <div className="mt-0.5 text-ink-secondary">
              Workspace policy says this touch needs human signoff. Review the preview above, then check the box to enable actions.
            </div>
            <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-[11px] font-medium text-ink-primary">
              <input
                type="checkbox"
                checked={approved}
                onChange={(e) => setApproved(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-bg-border accent-accent-amber"
              />
              I reviewed this — approve to send / record outcome / skip
            </label>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canSend && (
          <button
            type="button"
            disabled={actionsDisabled}
            onClick={() => onAction(item.id, { action: "send" }, approved)}
            className="inline-flex items-center gap-1 rounded-md bg-accent-blue px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            title={needsApproval && !approved ? "Confirm approval first" : undefined}
          >
            {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Send now
          </button>
        )}

        {channel === "call" && (
          <div className="inline-flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-wider text-ink-tertiary">
              Mark outcome
            </span>
            {callOutcomes.map((o) => (
              <button
                key={o}
                type="button"
                disabled={actionsDisabled}
                onClick={() => onAction(item.id, { action: "outcome", outcome: o }, approved)}
                className="rounded-md border border-bg-border bg-bg-card px-2 py-1 text-[11px] text-ink-secondary hover:bg-bg-hover disabled:opacity-50"
              >
                {o}
              </button>
            ))}
          </div>
        )}

        {(channel === "email" || channel === "sms") && (
          <button
            type="button"
            disabled={actionsDisabled}
            onClick={() => onAction(item.id, { action: "outcome", outcome: "sent-out-of-band" }, approved)}
            className="rounded-md border border-bg-border bg-bg-card px-2 py-1 text-[11px] text-ink-secondary hover:bg-bg-hover disabled:opacity-50"
            title="I already sent this from gmail / phone -- just mark done"
          >
            Already sent elsewhere
          </button>
        )}

        <button
          type="button"
          disabled={actionsDisabled}
          onClick={() => onAction(item.id, { action: "skip" }, approved)}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-card px-2 py-1 text-[11px] text-ink-secondary hover:bg-bg-hover disabled:opacity-50"
        >
          <SkipForward className="h-3 w-3" />
          Skip step
        </button>
      </div>
    </div>
  );
}
