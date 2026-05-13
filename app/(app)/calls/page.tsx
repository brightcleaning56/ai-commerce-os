"use client";
import {
  CheckCircle2,
  CircleDot,
  Clock,
  Download,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  Search,
  Voicemail,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { downloadCSV } from "@/lib/csv";

/**
 * /calls — central log of every call attempt across every task.
 *
 * Reads aicos:tasks:v1 from localStorage, flattens task.attempts[] into
 * one timeline. Joins with /api/voice/recordings (server-side store
 * deposited by the Twilio recording-status webhook) so each row gets
 * an inline audio player when a recording is available.
 *
 * Filters: date range, outcome, free-text search across buyer + phone.
 * Sortable by date / duration / outcome. CSV export of the visible
 * rows so the operator can pull the data into a spreadsheet.
 *
 * Pure client-side aggregation -- no server changes. When tasks move
 * to a server-side store later, this page swaps the localStorage read
 * for an /api/calls endpoint without touching the UI.
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
  const [query, setQuery] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<CallOutcome | "all">("all");
  const [dateWindow, setDateWindow] = useState<DateWindow>("7d");
  const [sortBy, setSortBy] = useState<"date" | "duration">("date");
  const { toast } = useToast();

  function loadVoicemails() {
    fetch("/api/voice/voicemails", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { voicemails: [] }))
      .then((d) => setVoicemails(d.voicemails ?? []))
      .catch(() => {});
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem("aicos:tasks:v1");
      if (raw) setTasks(JSON.parse(raw));
    } catch {}
    loadVoicemails();
  }, []);

  // Once tasks load, fetch recordings for any attempts that have a CallSid
  useEffect(() => {
    const sids: string[] = [];
    for (const t of tasks) {
      for (const a of t.attempts ?? []) {
        if (a.callSid) sids.push(a.callSid);
      }
    }
    if (sids.length === 0) return;
    fetch(`/api/voice/recordings?callSids=${encodeURIComponent(sids.join(","))}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { recordings: {} }))
      .then((d) => setRecordings(d.recordings ?? {}))
      .catch(() => {});
  }, [tasks]);

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

  // Flatten + filter + sort
  const rows = useMemo<FlatRow[]>(() => {
    const flat: FlatRow[] = [];
    for (const task of tasks) {
      for (const attempt of task.attempts ?? []) {
        flat.push({
          attempt,
          task,
          recording: attempt.callSid ? recordings[attempt.callSid] : undefined,
        });
      }
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
  }, [tasks, recordings, outcomeFilter, dateWindow, query, sortBy]);

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
            <h1 className="text-2xl font-bold">Call Log</h1>
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
                  <a
                    href={`tel:${vm.from}`}
                    title={`Call ${vm.from} back`}
                    className="flex items-center gap-1.5 rounded-md bg-accent-green/15 px-2.5 py-1 text-[11px] font-semibold text-accent-green hover:bg-accent-green/25"
                  >
                    <PhoneCall className="h-3 w-3" /> Call back
                  </a>
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
