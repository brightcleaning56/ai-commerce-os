"use client";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  Voicemail,
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
  | "draft";

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
  }
}

export default function QueuePage() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<QueueChannel | "all">("all");
  const [directionFilter, setDirectionFilter] = useState<QueueDirection | "all">("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/queue", { cache: "no-store", credentials: "include" });
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
  }, []);

  useEffect(() => {
    void load();
    // Light polling so a teammate's action / inbound webhook shows up
    // without the operator having to hit refresh. 30s matches /tasks
    // poll cadence so we're consistent across surfaces.
    const i = setInterval(() => void load(), 30_000);
    return () => clearInterval(i);
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [] as QueueItem[];
    let items = data.items;
    if (channelFilter !== "all") items = items.filter((i) => i.channel === channelFilter);
    if (directionFilter !== "all") items = items.filter((i) => i.direction === directionFilter);
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
    };
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

      {/* Source breakdown — small honesty footer so operator knows what's in here */}
      {data && (
        <div className="rounded-md border border-bg-border bg-bg-card/40 px-3 py-2 text-[11px] text-ink-tertiary">
          Aggregating: {data.sources.tasks} task
          {data.sources.tasks === 1 ? "" : "s"} · {data.sources.voicemails} voicemail
          {data.sources.voicemails === 1 ? "" : "s"} · {data.sources.leadSms} inbound SMS ·{" "}
          {data.sources.leadFollowups} auto-followup
          {data.sources.leadFollowups === 1 ? "" : "s"} · {data.sources.newLeads} new lead
          {data.sources.newLeads === 1 ? "" : "s"}
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
            <QueueRow key={item.id} item={item} />
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

function QueueRow({ item }: { item: QueueItem }) {
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
  return (
    <Link
      href={detailHref(item)}
      className="group block rounded-lg border border-bg-border bg-bg-card px-3 py-2.5 transition-colors hover:border-accent-blue/40 hover:bg-bg-hover"
    >
      <div className="flex items-center gap-3">
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
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PRIORITY_TONE[item.priority]}`}
            title={`Source: ${item.source}`}
          >
            {PRIORITY_LABEL[item.priority]}
          </span>
          <span className="font-mono text-[10px] text-ink-tertiary">{relTime(item.dueAt)}</span>
        </div>
      </div>
    </Link>
  );
}
