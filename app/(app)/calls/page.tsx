"use client";
import {
  CheckCircle2,
  CircleDot,
  Clock,
  Copy,
  Download,
  Loader2,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  Search,
  Star,
  Voicemail,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { downloadCSV } from "@/lib/csv";
import { useVoice } from "@/components/voice/VoiceContext";
import { useCapability } from "@/components/CapabilityContext";

/**
 * /calls — central log of every call attempt across every task.
 *
 * Two data sources merged into one timeline:
 *   1. Server-side /api/calls log (shipped with the multi-agent call
 *      center slice). Auto-populated whenever VoiceProvider.placeOutbound
 *      runs, so any agent's call lands here and is visible to teammates.
 *   2. Legacy localStorage aicos:tasks:v1 from /tasks page (per-browser).
 *      Kept as a backstop until /tasks itself moves to the server store.
 *      Deduped against server rows by CallSid so we don't double-render.
 *
 * Joined with /api/voice/recordings + /api/voice/voicemails so each
 * row can render an inline audio player when a recording landed.
 *
 * Filters: date range, outcome, free-text search across buyer + phone.
 * Sortable by date / duration / outcome. CSV export of visible rows.
 */

// ─── Types (mirrored from /tasks LocalTask) ──────────────────────────

type CallOutcome =
  | "connected"
  | "voicemail"
  | "no-answer"
  | "wrong-number"
  | "callback-scheduled";

type CallAttempt = {
  at: string;
  durationSec?: number;
  outcome: CallOutcome;
  notes?: string;
  callbackAt?: string;
  callSid?: string;
};

type LocalTask = {
  id: string;
  buyerId: string;
  buyerCompany: string;
  buyerName: string;
  buyerPhone?: string;
  type: "phone" | "sequence";
  done?: boolean;
  attempts?: CallAttempt[];
};

type RecordingMeta = {
  callSid: string;
  recordingSid: string;
  recordingUrl: string;
  durationSec: number;
  recordedAt: string;
};

type VoicemailRecord = {
  id: string;
  recordingSid: string;
  recordingUrl: string;
  from: string;
  durationSec: number;
  recordedAt: string;
  read: boolean;
  transcription?: string;
  transcriptionStatus?: "pending" | "completed" | "failed";
};

type FlatRow = {
  attempt: CallAttempt;
  task: LocalTask;
  recording?: RecordingMeta;
  // When this row came from the server-side /api/calls log (vs the
  // legacy localStorage task attempts), serverCallId is set. Used to
  // disambiguate when two sources have overlapping CallSids during
  // the migration window.
  serverCallId?: string;
  agentEmail?: string;
  agentRole?: string;
};

type ServerCall = {
  id: string;
  direction: "outbound" | "inbound";
  callSid: string | null;
  agentEmail: string;
  agentRole: string;
  toNumber: string;
  toContact?: string;
  startedAt: string;
  endedAt?: string;
  durationSec?: number;
  outcome?:
    | "connected"
    | "voicemail"
    | "no-answer"
    | "wrong-number"
    | "callback-scheduled"
    | "missed"
    | "failed";
  notes?: string;
  recordingSid?: string;
  source?: string;
};

type DateWindow = "1d" | "7d" | "30d" | "all";

// ─── Helpers ─────────────────────────────────────────────────────────

const OUTCOME_META: Record<
  CallOutcome,
  { label: string; tone: string; bg: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  connected: { label: "Connected", tone: "text-accent-green", bg: "bg-accent-green/15", Icon: PhoneCall },
  voicemail: { label: "Voicemail", tone: "text-accent-amber", bg: "bg-accent-amber/15", Icon: Voicemail },
  "no-answer": { label: "No answer", tone: "text-ink-secondary", bg: "bg-bg-hover", Icon: PhoneOff },
  "wrong-number": { label: "Wrong number", tone: "text-accent-red", bg: "bg-accent-red/15", Icon: XCircle },
  "callback-scheduled": { label: "Callback", tone: "text-brand-200", bg: "bg-brand-500/15", Icon: PhoneIncoming },
};

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function withinWindow(iso: string, window: DateWindow): boolean {
  if (window === "all") return true;
  const ms = Date.now() - new Date(iso).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (window === "1d") return ms < dayMs;
  if (window === "7d") return ms < 7 * dayMs;
  if (window === "30d") return ms < 30 * dayMs;
  return true;
}

// ─── Page ────────────────────────────────────────────────────────────

export default function CallsPage() {
  const [tasks, setTasks] = useState<LocalTask[]>([]);
  const [recordings, setRecordings] = useState<Record<string, RecordingMeta>>({});
  const [voicemails, setVoicemails] = useState<VoicemailRecord[]>([]);
  // Server-side call log -- the shared multi-agent source of truth.
  // Merged with the legacy localStorage task attempts below so existing
  // history isn't lost while we migrate.
  const [serverCalls, setServerCalls] = useState<ServerCall[]>([]);
  const [query, setQuery] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<CallOutcome | "all">("all");
  const [dateWindow, setDateWindow] = useState<DateWindow>("7d");
  const [sortBy, setSortBy] = useState<"date" | "duration">("date");
  const { toast } = useToast();

  // In-app dialer integration. The button on each row dials via the
  // shared VoiceProvider Device (same Twilio Client identity as
  // inbound rings). Hidden entirely for roles without voice:write, and
  // disabled when twilioReady is false (env not configured, mic denied
  // etc) -- never falls back to tel: because Windows users get
  // Phone Link instead of a real dial.
  const canCall = useCapability("voice:write");
  const { placeOutboundCall, twilioReady, twilioInFlight } = useVoice();
  const dialing = twilioInFlight !== "idle";
  async function dial(phone: string | undefined, label: string) {
    if (!phone) return;
    if (!twilioReady) {
      toast("Voice not ready — check /admin/system-health", "error");
      return;
    }
    try {
      await placeOutboundCall(phone);
      toast(`Dialing ${label}…`, "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Dial failed", "error");
    }
  }

  function loadVoicemails() {
    fetch("/api/voice/voicemails", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { voicemails: [] }))
      .then((d) => setVoicemails(d.voicemails ?? []))
      .catch(() => {});
  }

  function loadServerCalls() {
    fetch("/api/calls?limit=500", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { calls: [] }))
      .then((d) => setServerCalls(d.calls ?? []))
      .catch(() => {});
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem("aicos:tasks:v1");
      if (raw) setTasks(JSON.parse(raw));
    } catch {}
    loadVoicemails();
    loadServerCalls();
    // Poll the server log every 20s so an agent sees calls their
    // teammates are placing right now without manual refresh. Cheap
    // enough since each call is ~150 bytes and we cap at 500 rows.
    const interval = setInterval(loadServerCalls, 20_000);
    return () => clearInterval(interval);
  }, []);

  // Once tasks + server calls load, fetch recordings for any with a
  // CallSid. One batch covers both sources so the <audio> elements
  // light up regardless of where the row came from.
  useEffect(() => {
    const sids = new Set<string>();
    for (const t of tasks) {
      for (const a of t.attempts ?? []) {
        if (a.callSid) sids.add(a.callSid);
      }
    }
    for (const sc of serverCalls) {
      if (sc.callSid) sids.add(sc.callSid);
    }
    if (sids.size === 0) return;
    fetch(`/api/voice/recordings?callSids=${encodeURIComponent(Array.from(sids).join(","))}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { recordings: {} }))
      .then((d) => setRecordings(d.recordings ?? {}))
      .catch(() => {});
  }, [tasks, serverCalls]);

  async function toggleVoicemailRead(id: string, read: boolean) {
    try {
      const r = await fetch(`/api/voice/voicemails/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ read }),
      });
      if (!r.ok) throw new Error(`Mark ${read ? "read" : "unread"} failed (${r.status})`);
      // Optimistic update + re-fetch to stay in sync
      setVoicemails((prev) => prev.map((v) => (v.id === id ? { ...v, read } : v)));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "error");
    }
  }

  const unreadVoicemailCount = voicemails.filter((v) => !v.read).length;

  // Flatten + filter + sort. Two sources:
  //   1. Legacy localStorage task attempts (per-browser, /tasks-owned)
  //   2. Server-side calls from /api/calls (shared across agents)
  // We merge both into the same FlatRow shape. Dedupe by callSid so a
  // task attempt with the same CallSid as a server call shows once.
  const rows = useMemo<FlatRow[]>(() => {
    const flat: FlatRow[] = [];
    const sidSeen = new Set<string>();

    // Local task attempts first
    for (const task of tasks) {
      for (const attempt of task.attempts ?? []) {
        flat.push({
          attempt,
          task,
          recording: attempt.callSid ? recordings[attempt.callSid] : undefined,
        });
        if (attempt.callSid) sidSeen.add(attempt.callSid);
      }
    }

    // Server-side calls — convert to FlatRow shape. Skip any whose
    // CallSid we already saw from local tasks (avoids double-rendering).
    for (const sc of serverCalls) {
      if (sc.callSid && sidSeen.has(sc.callSid)) continue;
      const synth: FlatRow = {
        attempt: {
          at: sc.startedAt,
          durationSec: sc.durationSec,
          outcome:
            sc.outcome === "voicemail"
              ? "voicemail"
              : sc.outcome === "wrong-number"
                ? "wrong-number"
                : sc.outcome === "callback-scheduled"
                  ? "callback-scheduled"
                  : sc.outcome === "no-answer"
                    ? "no-answer"
                    : "connected",  // covers "connected" + "missed" + "failed" fallbacks
          notes: sc.notes,
          callSid: sc.callSid ?? undefined,
        },
        task: {
          id: sc.id,
          buyerId: sc.id,
          buyerCompany: sc.toContact ?? sc.toNumber,
          buyerName: sc.toContact ?? sc.toNumber,
          buyerPhone: sc.toNumber,
          type: "phone",
        },
        recording: sc.callSid ? recordings[sc.callSid] : undefined,
        serverCallId: sc.id,
        agentEmail: sc.agentEmail,
        agentRole: sc.agentRole,
      };
      flat.push(synth);
    }

    let filtered = flat;
    if (outcomeFilter !== "all") {
      filtered = filtered.filter((r) => r.attempt.outcome === outcomeFilter);
    }
    filtered = filtered.filter((r) => withinWindow(r.attempt.at, dateWindow));
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.task.buyerName.toLowerCase().includes(q) ||
          r.task.buyerCompany.toLowerCase().includes(q) ||
          (r.task.buyerPhone ?? "").includes(q),
      );
    }
    if (sortBy === "date") {
      filtered.sort((a, b) => b.attempt.at.localeCompare(a.attempt.at));
    } else {
      filtered.sort((a, b) => (b.attempt.durationSec ?? 0) - (a.attempt.durationSec ?? 0));
    }
    return filtered;
  }, [tasks, recordings, outcomeFilter, dateWindow, query, sortBy, serverCalls]);

  // Roll-up stats over the visible rows
  const stats = useMemo(() => {
    const totalCalls = rows.length;
    const totalDurationSec = rows.reduce((s, r) => s + (r.attempt.durationSec ?? 0), 0);
    const connected = rows.filter((r) => r.attempt.outcome === "connected").length;
    const voicemail = rows.filter((r) => r.attempt.outcome === "voicemail").length;
    const noAnswer = rows.filter((r) => r.attempt.outcome === "no-answer").length;
    const callbacks = rows.filter((r) => r.attempt.outcome === "callback-scheduled").length;
    const recorded = rows.filter((r) => r.recording).length;
    return {
      totalCalls,
      totalDurationSec,
      connected,
      voicemail,
      noAnswer,
      callbacks,
      recorded,
      connectRate: totalCalls === 0 ? 0 : (connected / totalCalls) * 100,
      avgDurationSec: connected === 0 ? 0 : Math.round(totalDurationSec / connected),
    };
  }, [rows]);

  function handleExport() {
    if (rows.length === 0) {
      toast("No calls to export in the current view", "info");
      return;
    }
    const csv = rows.map((r) => ({
      at: r.attempt.at,
      buyer: r.task.buyerName,
      company: r.task.buyerCompany,
      phone: r.task.buyerPhone ?? "",
      outcome: r.attempt.outcome,
      duration_sec: r.attempt.durationSec ?? 0,
      callback_at: r.attempt.callbackAt ?? "",
      notes: (r.attempt.notes ?? "").replace(/\n/g, " "),
      call_sid: r.attempt.callSid ?? "",
      has_recording: r.recording ? "yes" : "no",
      recording_sid: r.recording?.recordingSid ?? "",
    }));
    downloadCSV(`calls-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast(`Exported ${rows.length} call rows`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <PhoneCall className="h-5 w-5" />
          </div>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              Call Log
              {/* Slice 138: Active-call pulse next to the title --
                  pulsing green dot + label while a Twilio call is
                  in flight. Reads twilioInFlight from VoiceContext
                  (already used by row-level disable logic). Disappears
                  the instant the call ends. */}
              {dialing && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-green/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-green">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-green opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-green" />
                  </span>
                  Active call
                </span>
              )}
            </h1>
            <p className="text-xs text-ink-secondary">
              Every call across every task · {tasks.length} tasks tracked · live from your browser
            </p>
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={rows.length === 0}
          className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow disabled:opacity-60"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      {/* Slice 89: Quick Dial bar. The Call Log without a "make a call"
          button is confusing -- operators land here expecting to dial.
          The path:
            - twilioReady? -> placeOutboundCall (browser dialer), call
              gets recorded into this very log automatically.
            - else -> tel: handoff to system dialer (works on mobile;
              Phone Link or similar on Windows).
          Hidden when the operator lacks voice:write capability. */}
      {canCall && <QuickDialBar />}

      {/* Roll-up tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Total calls" value={stats.totalCalls.toLocaleString()} />
        <Tile
          label="Connect rate"
          value={`${stats.connectRate.toFixed(0)}%`}
          hint={`${stats.connected} connected of ${stats.totalCalls}`}
          tone="green"
        />
        <Tile
          label="Avg call duration"
          value={stats.connected === 0 ? "—" : fmtDuration(stats.avgDurationSec)}
          hint="connected calls only"
        />
        <Tile
          label="Total talk time"
          value={fmtDuration(stats.totalDurationSec)}
          hint={`${stats.recorded} recorded`}
        />
      </div>

      {/* Slice 50: voicemail transcript search */}
      <TranscriptSearch />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search buyer / company / phone…"
            className="h-9 w-full rounded-lg border border-bg-border bg-bg-card pl-9 pr-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
          />
        </div>
        <select
          value={dateWindow}
          onChange={(e) => setDateWindow(e.target.value as DateWindow)}
          className="h-9 rounded-lg border border-bg-border bg-bg-card px-3 text-sm focus:border-brand-500 focus:outline-none"
        >
          <option value="1d">Last 24h</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="all">All time</option>
        </select>
        <div className="flex items-center gap-1 rounded-lg border border-bg-border bg-bg-card p-1 text-xs">
          {(["date", "duration"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setSortBy(k)}
              className={`rounded-md px-2.5 py-1 ${
                sortBy === k ? "bg-brand-500/15 text-brand-200" : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
              }`}
            >
              Sort: {k}
            </button>
          ))}
        </div>
      </div>

      {/* Inbound voicemails -- captured by /api/voice/inbound's <Record>
          when the operator's browser doesn't pick up. Separate from the
          main attempt log because they have no associated task. Newest
          first. Unread voicemails get a brand-glow border so the operator
          can scan + clear them quickly. */}
      {voicemails.length > 0 && (
        <div className="rounded-xl border border-bg-border bg-bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bg-border px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Voicemail className="h-4 w-4 text-accent-amber" /> Inbound voicemails
              {unreadVoicemailCount > 0 && (
                <span className="rounded bg-accent-amber/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-amber">
                  {unreadVoicemailCount} unread
                </span>
              )}
            </div>
            <div className="text-[11px] text-ink-tertiary">
              Captured when no one answers your Twilio number
            </div>
          </div>
          <ul className="divide-y divide-bg-border">
            {voicemails.map((vm) => (
              <li
                key={vm.id}
                className={`px-5 py-3 ${vm.read ? "" : "bg-accent-amber/5"}`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => toggleVoicemailRead(vm.id, !vm.read)}
                    title={vm.read ? "Mark unread" : "Mark read"}
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-md border ${
                      vm.read
                        ? "border-bg-border text-ink-tertiary hover:bg-bg-hover"
                        : "border-accent-amber/40 bg-accent-amber/15 text-accent-amber hover:bg-accent-amber/25"
                    }`}
                  >
                    {vm.read ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDot className="h-3.5 w-3.5" />}
                  </button>
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-amber/15 text-accent-amber">
                    <Voicemail className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium ${vm.read ? "text-ink-secondary" : ""}`}>
                      Voicemail from <span className="font-mono">{vm.from}</span>
                    </div>
                    <div className="text-[11px] text-ink-tertiary">
                      {new Date(vm.recordedAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })} · {fmtDuration(vm.durationSec)}
                    </div>
                  </div>
                  <audio
                    controls
                    preload="none"
                    src={`/api/voice/recording-proxy/${vm.recordingSid}`}
                    className="h-7 max-w-xs"
                  />
                  {canCall && (
                    <button
                      type="button"
                      onClick={() => dial(vm.from, vm.from)}
                      disabled={!twilioReady || dialing}
                      title={`Call ${vm.from} back from your browser`}
                      className="flex items-center gap-1.5 rounded-md bg-accent-green/15 px-2.5 py-1 text-[11px] font-semibold text-accent-green hover:bg-accent-green/25 disabled:opacity-50"
                    >
                      <PhoneCall className="h-3 w-3" /> Call back
                    </button>
                  )}
                </div>
                {/* Transcript — landed via /api/voice/transcription-status.
                    Pending state shows while Twilio processes (typically
                    30s-2min after the call ends). Failed state shows when
                    audio was too noisy/short to transcribe. */}
                {vm.transcription && vm.transcriptionStatus === "completed" && (
                  <div className="ml-10 mt-2 rounded-md border border-bg-border bg-bg-hover/30 p-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                      Transcript (auto)
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-ink-secondary">{vm.transcription}</p>
                  </div>
                )}
                {vm.transcriptionStatus === "failed" && (
                  <div className="ml-10 mt-2 text-[10px] italic text-ink-tertiary">
                    Transcript unavailable (audio too short/noisy)
                  </div>
                )}
                {!vm.transcriptionStatus && (
                  <div className="ml-10 mt-2 text-[10px] italic text-ink-tertiary">
                    Transcript pending…
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Outcome filter pills */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-bg-border bg-bg-card p-1 text-xs w-fit">
        <button
          onClick={() => setOutcomeFilter("all")}
          className={`rounded-md px-3 py-1.5 ${
            outcomeFilter === "all"
              ? "bg-brand-500/15 text-brand-200"
              : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
          }`}
        >
          All <span className="ml-1 opacity-60">({stats.totalCalls})</span>
        </button>
        {(Object.keys(OUTCOME_META) as CallOutcome[]).map((o) => {
          const meta = OUTCOME_META[o];
          const count = rows.filter((r) => r.attempt.outcome === o).length;
          return (
            <button
              key={o}
              onClick={() => setOutcomeFilter(o)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${
                outcomeFilter === o ? `${meta.bg} ${meta.tone}` : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
              }`}
            >
              <meta.Icon className="h-3 w-3" />
              {meta.label}
              <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <PhoneCall className="mx-auto h-8 w-8 text-ink-tertiary" />
            <div className="mt-3 text-base font-semibold">No calls in this window</div>
            <p className="mt-1 text-xs text-ink-tertiary">
              Make a call from <Link href="/tasks" className="text-brand-300 hover:text-brand-200">/tasks</Link> — every attempt lands here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
                <tr className="border-b border-bg-border">
                  <th className="px-4 py-2.5 text-left font-medium">When</th>
                  <th className="px-3 py-2.5 text-left font-medium">Buyer</th>
                  <th className="px-3 py-2.5 text-left font-medium">Phone</th>
                  <th className="px-3 py-2.5 text-left font-medium">Outcome</th>
                  <th className="px-3 py-2.5 text-right font-medium">Duration</th>
                  <th className="px-3 py-2.5 text-left font-medium">Notes</th>
                  <th className="px-4 py-2.5 text-left font-medium">Recording</th>
                  {canCall && (
                    <th className="px-3 py-2.5 text-right font-medium">Action</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const meta = OUTCOME_META[r.attempt.outcome];
                  return (
                    <tr key={i} className="border-t border-bg-border align-top hover:bg-bg-hover/30">
                      <td className="px-4 py-3 text-[11px] text-ink-tertiary">
                        <div>{relativeTime(r.attempt.at)}</div>
                        <div className="font-mono text-[10px] opacity-60">
                          {new Date(r.attempt.at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-sm font-medium">{r.task.buyerName}</div>
                        <div className="text-[11px] text-ink-tertiary">{r.task.buyerCompany}</div>
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-ink-secondary">
                        {r.task.buyerPhone ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${meta.bg} ${meta.tone}`}>
                          <meta.Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                        {r.attempt.callbackAt && (
                          <div className="mt-1 text-[10px] text-brand-200">
                            callback {new Date(r.attempt.callbackAt).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-[11px] text-ink-secondary">
                        {r.attempt.durationSec != null ? fmtDuration(r.attempt.durationSec) : "—"}
                      </td>
                      <td className="px-3 py-3 max-w-[280px]">
                        {r.attempt.notes ? (
                          <div className="line-clamp-2 text-[11px] text-ink-secondary" title={r.attempt.notes}>
                            {r.attempt.notes}
                          </div>
                        ) : (
                          <span className="text-[11px] text-ink-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.recording ? (
                          <audio
                            controls
                            preload="none"
                            src={`/api/voice/recording-proxy/${r.recording.recordingSid}`}
                            className="h-7"
                          />
                        ) : r.attempt.callSid ? (
                          <span className="text-[10px] text-ink-tertiary">pending…</span>
                        ) : (
                          <span className="text-[10px] text-ink-tertiary">—</span>
                        )}
                      </td>
                      {canCall && (
                        <td className="px-3 py-3 text-right">
                          {r.task.buyerPhone ? (
                            <button
                              type="button"
                              onClick={() => dial(r.task.buyerPhone, r.task.buyerName || r.task.buyerCompany)}
                              disabled={!twilioReady || dialing}
                              title={`Call ${r.task.buyerName || r.task.buyerCompany} back from your browser`}
                              className="inline-flex items-center gap-1 rounded-md bg-accent-green/15 px-2 py-1 text-[10px] font-semibold text-accent-green hover:bg-accent-green/25 disabled:opacity-50"
                            >
                              <PhoneCall className="h-3 w-3" />
                              Call
                            </button>
                          ) : (
                            <span className="text-[10px] text-ink-tertiary">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "green" }) {
  const valueClass = tone === "green" ? "text-accent-green" : "";
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${valueClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-ink-tertiary">{hint}</div>}
    </div>
  );
}

// ─── TranscriptSearch (slice 50) ───────────────────────────────────

type TranscriptHit = {
  id: string;
  /** Slice 52: distinguishes voicemail vs outbound call recording. */
  kind?: "voicemail" | "outbound";
  from: string;
  durationSec: number;
  recordedAt: string;
  read: boolean;
  snippet: string;
  matchOffset: number;
};

/**
 * Slice 54: split a snippet around every case-insensitive occurrence
 * of `needle`. Returns an array of { text, isMatch } parts so React
 * can render <mark> wrappers without dangerouslySetInnerHTML.
 */
function splitOnMatch(snippet: string, needle: string): Array<{ text: string; isMatch: boolean }> {
  if (!needle) return [{ text: snippet, isMatch: false }];
  const parts: Array<{ text: string; isMatch: boolean }> = [];
  const lower = snippet.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let i = 0;
  while (i < snippet.length) {
    const idx = lower.indexOf(lowerNeedle, i);
    if (idx === -1) {
      parts.push({ text: snippet.slice(i), isMatch: false });
      break;
    }
    if (idx > i) parts.push({ text: snippet.slice(i, idx), isMatch: false });
    parts.push({ text: snippet.slice(idx, idx + needle.length), isMatch: true });
    i = idx + needle.length;
  }
  return parts;
}

function TranscriptSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<TranscriptHit[] | null>(null);
  // Slice 54: track the query that produced the current hits so the
  // highlighter doesn't re-highlight against an in-flight typed query.
  const [highlightQuery, setHighlightQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (q.trim().length < 2) {
      setError("Enter at least 2 characters");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: q.trim(), limit: "50" });
      const r = await fetch(`/api/voice/transcripts/search?${params}`, {
        cache: "no-store",
        credentials: "include",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Search failed (${r.status})`);
      setHits(d.results ?? []);
      setHighlightQuery(q.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-xl border border-bg-border bg-bg-card">
      <summary className="cursor-pointer px-4 py-2.5 text-[12px] font-semibold text-ink-secondary hover:text-ink-primary">
        🔍 Search transcripts
      </summary>
      <div className="border-t border-bg-border px-4 py-3 space-y-2">
        <p className="text-[10px] text-ink-tertiary">
          Full-text search across voicemail + outbound call transcripts. Matches show
          ±60-char snippets with the query <mark className="rounded-sm bg-accent-amber/30 px-0.5">highlighted</mark>.
          Outbound transcripts require <span className="font-mono">TWILIO_TRANSCRIBE_OUTBOUND=true</span>.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
            placeholder='e.g. "shipping cost", "RFQ", company name'
            className="h-8 flex-1 min-w-[200px] rounded-md border border-bg-border bg-bg-app px-2 text-[12px]"
          />
          <button
            type="button"
            disabled={busy || !q.trim()}
            onClick={() => void search()}
            className="rounded-md bg-accent-blue px-3 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Searching..." : "Search"}
          </button>
        </div>
        {error && <div className="text-[11px] text-accent-red">{error}</div>}
        {hits && hits.length === 0 && (
          <div className="rounded-md border border-bg-border bg-bg-app/40 px-3 py-2 text-[11px] text-ink-tertiary">
            No matches in voicemail transcripts.
          </div>
        )}
        {hits && hits.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
              {hits.length} match{hits.length === 1 ? "" : "es"}
            </div>
            {hits.map((h) => (
              <div
                key={`${h.kind ?? "voicemail"}-${h.id}-${h.matchOffset}`}
                className="rounded-md border border-bg-border bg-bg-app/40 px-3 py-2 text-[11px]"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {h.kind === "outbound" ? (
                      <span className="rounded-full border border-accent-blue/40 bg-accent-blue/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent-blue">
                        outbound
                      </span>
                    ) : (
                      <span className="rounded-full border border-bg-border bg-bg-card px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-tertiary">
                        voicemail
                      </span>
                    )}
                    <span className="font-mono text-ink-secondary">{h.from}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-ink-tertiary">
                    {h.kind === "voicemail" && !h.read && (
                      <span className="rounded-full border border-accent-amber/40 bg-accent-amber/10 px-1.5 py-0.5 font-semibold text-accent-amber">
                        unread
                      </span>
                    )}
                    <span>{Math.round(h.durationSec)}s</span>
                    <span>{new Date(h.recordedAt).toLocaleString()}</span>
                  </div>
                </div>
                <div className="text-ink-primary">
                  {splitOnMatch(h.snippet, highlightQuery).map((p, i) =>
                    p.isMatch ? (
                      <mark
                        key={i}
                        className="rounded-sm bg-accent-amber/30 px-0.5 text-ink-primary"
                      >
                        {p.text}
                      </mark>
                    ) : (
                      <span key={i}>{p.text}</span>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

// ─── QuickDialBar (slice 89) ─────────────────────────────────────────
//
// Tiny inline dialer at the top of /calls. Two paths:
//   - twilioReady: placeOutboundCall via the browser device. The call
//     gets recorded into this very log automatically via the existing
//     VoiceContext + slice 52 recording pipeline.
//   - else: tel: handoff to the system dialer. Mobile gets a real
//     phone call; Windows gets Phone Link (good enough -- the operator
//     can also paste into a separate phone client).
//
// Strips non-digits before E.164-prefixing so "(469) 267-8472" works
// the same as "+14692678472". Defaults to + on bare 10-digit US
// numbers; passes through anything already starting with +.
/**
 * Slice 96: humanize an E.164 number for display. Operators read
 * "(469) 267-8472" faster than "+14692678472" -- especially in a
 * dropdown of 8 numbers where the visual rhythm matters. Only
 * formats US numbers (+1 followed by 10 digits); other countries
 * fall through to the raw E.164 since their grouping rules vary.
 */
function humanPhone(e164: string): string {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (m) return `(${m[1]}) ${m[2]}-${m[3]}`;
  return e164;
}

/** Slice 90: short "5m ago" style for the recent-dial dropdown. */
function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Slice 90: client-only recent-dial history. Uses localStorage so it
// survives reloads but doesn't need a backend round-trip. Bounded at
// 8 entries (more than that = dropdown clutter, less = forgets your
// top contacts). Dedupes on E.164 + maintains MRU order.
const RECENT_KEY = "calls.quickDial.recent";
const RECENT_MAX = 8;

type RecentEntry = { num: string; at: string; pinned?: boolean };

function loadRecent(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is RecentEntry => !!e && typeof e.num === "string" && typeof e.at === "string")
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function pushRecent(num: string): RecentEntry[] {
  if (typeof window === "undefined") return [];
  const now = new Date().toISOString();
  const all = loadRecent();
  // Slice 101: preserve pinned state when re-dialing a number that's
  // already in history -- the dial bumps recency but shouldn't clear
  // a deliberate pin.
  const prior = all.find((e) => e.num === num);
  const others = all.filter((e) => e.num !== num);
  const next = [{ num, at: now, pinned: prior?.pinned }, ...others].slice(0, RECENT_MAX);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* quota / blocked -- ignore */
  }
  return next;
}

function QuickDialBar() {
  const { toast } = useToast();
  const { placeOutboundCall, twilioReady } = useVoice();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  // Slice 125: focus the dial input on D key press. Used when the
  // operator wants to dial without reaching for the mouse -- a
  // common workflow during back-to-back calls. Ignored when the
  // event target is already an input/textarea/contenteditable so
  // typing the letter d in any other field still works.
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "d" && e.key !== "D") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  function normalize(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("+")) {
      const digits = trimmed.slice(1).replace(/\D/g, "");
      return digits.length >= 7 ? `+${digits}` : null;
    }
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`; // bare US 10-digit
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return null;
  }

  async function dial(rawNum?: string) {
    const num = normalize(rawNum ?? phone);
    if (!num) {
      toast("Enter a 10-digit US number or +E.164", "error");
      return;
    }
    setBusy(true);
    try {
      if (twilioReady) {
        await placeOutboundCall(num);
        toast(`Calling ${num}…`, "success");
      } else {
        // Fallback -- system dialer / Phone Link on Windows
        window.location.href = `tel:${num}`;
        toast(`Opening system dialer for ${num}`, "success");
      }
      // Slice 90: record in recent history on success (whether browser
      // dial or tel: handoff -- both count as "the operator wanted
      // to call this number").
      setRecent(pushRecent(num));
      setShowRecent(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Dial failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <PhoneCall className="h-4 w-4 text-brand-300" /> Quick dial
          {/* Slice 125: keyboard-shortcut hint. Press D anywhere on
              the page to jump cursor into the dial input. */}
          <kbd className="hidden rounded border border-bg-border bg-bg-app px-1 text-[9px] font-mono text-ink-tertiary sm:inline">
            D
          </kbd>
        </div>
        <span
          className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
            twilioReady
              ? "bg-accent-green/15 text-accent-green"
              : "bg-bg-hover text-ink-tertiary"
          }`}
          title={
            twilioReady
              ? "Browser dialer ready -- call uses Twilio Voice JS SDK"
              : "Browser dialer not configured -- will hand off to the system dialer (tel:)"
          }
        >
          {twilioReady ? "browser" : "tel: fallback"}
        </span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void dial();
        }}
        className="relative flex flex-wrap items-center gap-2"
      >
        <input
          ref={inputRef}
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(469) 267-8472 or +14692678472"
          className="h-9 flex-1 min-w-[200px] rounded-md border border-bg-border bg-bg-app px-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
        />
        {/* Slice 90: recent dial history -- only renders when there's
            something to show. Clock icon toggles a popover; clicking
            an entry redials immediately. */}
        {recent.length > 0 && (
          <button
            type="button"
            onClick={() => setShowRecent((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-app px-2 py-2 text-[11px] font-medium text-ink-secondary hover:bg-bg-hover"
            title="Recent numbers"
            aria-expanded={showRecent}
          >
            <Clock className="h-3.5 w-3.5" />
            {recent.length}
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !phone.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-gradient-brand px-3 py-2 text-sm font-semibold shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
          Call
        </button>

        {showRecent && recent.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border border-bg-border bg-bg-card shadow-lg">
            <div className="flex items-center justify-between border-b border-bg-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
              <span>Recent dials</span>
              <button
                type="button"
                onClick={() => {
                  try {
                    window.localStorage.removeItem(RECENT_KEY);
                  } catch {
                    /* ignore */
                  }
                  setRecent([]);
                  setShowRecent(false);
                }}
                className="text-[10px] normal-case text-ink-tertiary hover:text-accent-red"
              >
                Clear
              </button>
            </div>
            <ul className="max-h-56 overflow-y-auto">
              {/* Slice 101: pinned entries sort to the top regardless
                  of recency. Star icon left of each row toggles pin
                  state -- click the star, the LRU re-orders without
                  dialing. Click the number itself to dial. */}
              {[...recent]
                .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))
                .map((e) => (
                <li key={e.num} className="group flex items-center hover:bg-bg-hover">
                  <button
                    type="button"
                    onClick={() => {
                      const nextPinned = !e.pinned;
                      const updated = recent.map((x) =>
                        x.num === e.num ? { ...x, pinned: nextPinned } : x,
                      );
                      try {
                        window.localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
                      } catch {
                        /* ignore */
                      }
                      setRecent(updated);
                    }}
                    className="grid h-7 w-7 shrink-0 place-items-center"
                    title={e.pinned ? "Unpin from top" : "Pin to top"}
                    aria-label={e.pinned ? "Unpin number" : "Pin number"}
                    aria-pressed={!!e.pinned}
                  >
                    <Star
                      className={`h-3 w-3 ${
                        e.pinned
                          ? "fill-accent-amber text-accent-amber"
                          : "text-ink-tertiary"
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPhone(e.num);
                      void dial(e.num);
                    }}
                    className="flex flex-1 items-center justify-between gap-2 px-1 py-1.5 text-left text-[12px]"
                    title={e.num}
                  >
                    {/* Slice 96: human-readable for US, mono for E.164
                        fallback so non-US digits stay aligned. The
                        raw E.164 stays in the title for copy-paste. */}
                    <span className="font-mono">{humanPhone(e.num)}</span>
                    <span className="pr-2 text-[10px] text-ink-tertiary">{relativeAge(e.at)}</span>
                  </button>
                  {/* Slice 105: copy-to-clipboard for the raw E.164.
                      Useful when the operator needs to paste the number
                      into Slack / a different app / a contact form.
                      Hover-only same as the delete to keep idle UI calm. */}
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(e.num).then(
                        () => toast("Number copied", "success"),
                        () => toast("Clipboard blocked", "error"),
                      );
                    }}
                    className="grid h-7 w-7 shrink-0 place-items-center opacity-0 transition-opacity hover:text-accent-blue group-hover:opacity-100"
                    title={`Copy ${e.num}`}
                    aria-label="Copy number"
                  >
                    <Copy className="h-3 w-3 text-ink-tertiary hover:text-accent-blue" />
                  </button>
                  {/* Slice 102: per-entry × delete. Removes one number
                      without nuking the rest (the header's Clear button
                      does the all-at-once purge). Hover-only so the
                      dropdown stays calm at rest. */}
                  <button
                    type="button"
                    onClick={() => {
                      const updated = recent.filter((x) => x.num !== e.num);
                      try {
                        if (updated.length === 0) {
                          window.localStorage.removeItem(RECENT_KEY);
                        } else {
                          window.localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
                        }
                      } catch {
                        /* ignore */
                      }
                      setRecent(updated);
                      if (updated.length === 0) setShowRecent(false);
                    }}
                    className="grid h-7 w-7 shrink-0 place-items-center opacity-0 transition-opacity hover:text-accent-red group-hover:opacity-100"
                    title="Remove from recents"
                    aria-label="Remove from recents"
                  >
                    <XCircle className="h-3 w-3 text-ink-tertiary hover:text-accent-red" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
      {!twilioReady && (
        <p className="mt-2 text-[10px] text-ink-tertiary">
          Browser dialer needs TWILIO_API_KEY + TWILIO_API_SECRET + TWILIO_TWIML_APP_SID in env. Until
          then, tap above and your device&apos;s default phone app opens with the number pre-filled.
        </p>
      )}
    </div>
  );
}
