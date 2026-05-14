"use client";
import {
  Bot,
  CheckCircle2,
  Clock,
  FileText,
  Flame,
  Hash,
  Loader2,
  Mail,
  MessageSquare,
  MicOff,
  PhoneCall,
  PhoneOff,
  Phone,
  PhoneIncoming,
  Plus,
  Trash2,
  Voicemail,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import PreviewBanner from "@/components/PreviewBanner";
import { useToast } from "@/components/Toast";
import Drawer from "@/components/ui/Drawer";
import { useVoice } from "@/components/voice/VoiceContext";

// ─── Types ───────────────────────────────────────────────────────────────

type CallOutcome =
  | "connected"
  | "voicemail"
  | "no-answer"
  | "wrong-number"
  | "callback-scheduled";

type CallAttempt = {
  at: string;            // ISO
  durationSec?: number;  // operator-reported call length
  outcome: CallOutcome;
  notes?: string;
  callbackAt?: string;   // ISO if outcome === "callback-scheduled"
  // Twilio CallSid -- captured from the SDK at call time. Lets the
  // /api/voice/recordings endpoint later resolve the recording URL
  // once Twilio's recording-status webhook fires.
  callSid?: string;
};

type RecordingMeta = {
  callSid: string;
  recordingSid: string;
  recordingUrl: string;
  durationSec: number;
  recordedAt: string;
};

type CallScript = {
  opener: string;
  talkingPoints: string[];
  closer: string;
  generatedAt: string;
  usedFallback: boolean;
};

type LocalTask = {
  id: string;
  buyerId: string;
  buyerCompany: string;
  buyerName: string;
  buyerPhone?: string;
  buyerEmail?: string;
  type: "phone" | "sequence";
  createdAt: string;
  done?: boolean;
  // Operator notes -- free-text annotations (separate from per-attempt notes
  // so the operator can capture context BEFORE the first call attempt).
  notes?: string;
  // Call session history -- one entry per "Place call" → outcome cycle.
  attempts?: CallAttempt[];
  // AI-generated call script -- opener / 3-5 talking points / closer.
  // Persists per-task so the operator doesn't burn tokens regenerating
  // every time they open the drawer. Operator can re-generate on demand.
  script?: CallScript;
};

type BuyerContact = {
  id: string;
  company: string;
  decisionMaker: string;
  decisionMakerTitle: string;
  industry: string;
  intentScore: number;
  status: string;
  rationale?: string;
  forProduct?: string;
  phone?: string;
  email?: string;
  linkedin?: string;
  website?: string;
  location?: string;
};

const STORAGE_KEY = "aicos:tasks:v1";

// ─── Helpers ─────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

const OUTCOME_META: Record<
  CallOutcome,
  { label: string; tone: string; bg: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  connected: {
    label: "Connected",
    tone: "text-accent-green",
    bg: "bg-accent-green/15",
    Icon: PhoneCall,
  },
  voicemail: {
    label: "Voicemail",
    tone: "text-accent-amber",
    bg: "bg-accent-amber/15",
    Icon: Voicemail,
  },
  "no-answer": {
    label: "No answer",
    tone: "text-ink-secondary",
    bg: "bg-bg-hover",
    Icon: PhoneOff,
  },
  "wrong-number": {
    label: "Wrong number",
    tone: "text-accent-red",
    bg: "bg-accent-red/15",
    Icon: XCircle,
  },
  "callback-scheduled": {
    label: "Callback scheduled",
    tone: "text-brand-200",
    bg: "bg-brand-500/15",
    Icon: PhoneIncoming,
  },
};

// ─── Page ────────────────────────────────────────────────────────────────

export default function TasksPage() {
  return (
    <Suspense fallback={<div className="grid place-items-center py-16 text-ink-tertiary"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
      <TasksInner />
    </Suspense>
  );
}

function TasksInner() {
  const searchParams = useSearchParams();
  // ?focus=<taskId> — set when the operator clicks "Place call" on /buyers
  // BuyerDetail. Causes the matching task's call-session drawer to auto-open
  // on mount so the operator goes from buyer → call session in one motion.
  const focusTaskId = searchParams.get("focus");

  const [tasks, setTasks] = useState<LocalTask[]>([]);
  const [filter, setFilter] = useState<"all" | "phone" | "sequence" | "open" | "done" | "callbacks">("open");
  const [buyerById, setBuyerById] = useState<Record<string, BuyerContact>>({});
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const { toast } = useToast();

  // Voice context — owned by the global VoiceProvider in app/(app)/layout.
  // Device init happens at app shell so inbound calls ring on every page,
  // not just /tasks. The IncomingCallWidget (also global) handles the
  // ring/answer/decline UX. /tasks just consumes the refs + state to
  // pass through to TaskDetail's call-session handlers.
  const voice = useVoice();
  const { deviceRef, currentCallRef, currentCallSidRef, twilioReady, twilioInFlight, setTwilioInFlight } = voice;

  // Auto-open the focused task once tasks are loaded. We can't open before
  // load because the task might not exist in localStorage yet (race with
  // the buyer-detail "Place call" handler that creates it then routes here).
  useEffect(() => {
    if (!focusTaskId) return;
    if (tasks.length === 0) return;
    if (tasks.find((t) => t.id === focusTaskId)) {
      setOpenTaskId(focusTaskId);
    }
  }, [focusTaskId, tasks]);

  // Derive the "next callback due" timestamp for a task from its attempts.
  // Returns null when no callback has been scheduled.
  function nextCallbackAt(t: LocalTask): string | null {
    if (!t.attempts || t.attempts.length === 0) return null;
    const callbacks = t.attempts
      .filter((a) => a.outcome === "callback-scheduled" && a.callbackAt)
      .map((a) => a.callbackAt as string)
      .sort();
    return callbacks[callbacks.length - 1] ?? null;
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setTasks(JSON.parse(raw));
    } catch {}
    fetch("/api/discovered-buyers")
      .then((r) => (r.ok ? r.json() : { buyers: [] }))
      .then((d) => {
        const map: Record<string, BuyerContact> = {};
        for (const b of d.buyers ?? []) {
          map[b.id] = b as BuyerContact;
        }
        setBuyerById(map);
      })
      .catch(() => {});
  }, []);

  function persist(next: LocalTask[]) {
    setTasks(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  function patchTask(id: string, patch: Partial<LocalTask>) {
    persist(tasks.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function toggleDone(id: string) {
    const t = tasks.find((x) => x.id === id);
    patchTask(id, { done: !t?.done });
    if (t) toast(t.done ? "Marked open" : "Task completed");
  }

  function removeTask(id: string) {
    persist(tasks.filter((x) => x.id !== id));
    if (openTaskId === id) setOpenTaskId(null);
    toast("Task removed");
  }

  function clearDone() {
    persist(tasks.filter((x) => !x.done));
    toast("Cleared completed tasks");
  }

  function contactFor(t: LocalTask): { phone?: string; email?: string } {
    const liveBuyer = buyerById[t.buyerId];
    return {
      phone: t.buyerPhone || liveBuyer?.phone,
      email: t.buyerEmail || liveBuyer?.email,
    };
  }

  const filtered = tasks
    .filter((t) => {
      if (filter === "all") return true;
      if (filter === "open") return !t.done;
      if (filter === "done") return !!t.done;
      if (filter === "callbacks") return !t.done && nextCallbackAt(t) != null;
      return t.type === filter;
    })
    .sort((a, b) => {
      // Callbacks-first ordering: tasks with an upcoming callback float
      // to the top, ordered by callback time. Helps the operator see what
      // they promised to follow up on without needing the dedicated
      // filter pill.
      const ca = nextCallbackAt(a);
      const cb = nextCallbackAt(b);
      if (ca && cb) return ca.localeCompare(cb);
      if (ca) return -1;
      if (cb) return 1;
      return 0;
    });

  const open = tasks.filter((t) => !t.done).length;
  const done = tasks.filter((t) => t.done).length;
  const phone = tasks.filter((t) => t.type === "phone" && !t.done).length;
  const seq = tasks.filter((t) => t.type === "sequence" && !t.done).length;
  const callbackCount = tasks.filter((t) => !t.done && nextCallbackAt(t) != null).length;

  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Tasks</h1>
            <p className="text-xs text-ink-secondary">
              {open} open · {done} completed · click any task for the call session
            </p>
          </div>
        </div>
        {done > 0 && (
          <button
            onClick={clearDone}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
          >
            <Trash2 className="h-4 w-4" /> Clear completed
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open" v={open} Icon={Clock} onClick={() => setFilter("open")} active={filter === "open"} />
        <Stat label="Phone tasks" v={phone} Icon={Phone} onClick={() => setFilter("phone")} active={filter === "phone"} />
        <Stat label="Sequences" v={seq} Icon={MessageSquare} onClick={() => setFilter("sequence")} active={filter === "sequence"} />
        <Stat label="Completed" v={done} Icon={CheckCircle2} onClick={() => setFilter("done")} active={filter === "done"} />
      </div>

      {/* Honesty banner — tasks + notes typed here save to localStorage
          on this browser only. Outbound calls placed via the dialer DO
          land in the shared server log (/api/calls), but task notes
          and disposition won't sync to teammates until the server-side
          tasks migration ships. */}
      <PreviewBanner
        title="Notes save to this browser only"
        body="Tasks + per-attempt notes here persist to localStorage on this device. Outbound calls placed via the dialer DO land in the shared server-side call log, but the task list itself doesn't sync between devices or teammates yet."
        href="/calls"
        linkLabel="Open the shared Call Log"
      />


      {/* How it works — sets expectations about today's flow vs roadmap */}
      <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-500/15">
            <Bot className="h-4 w-4 text-brand-200" />
          </div>
          <div className="flex-1 text-[12px] text-ink-secondary">
            <div className="font-semibold text-brand-200">Call session flow</div>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
              <li>Click a task to open the call session — buyer profile, AI rationale, talking points, notes, attempt history.</li>
              <li>Hit <span className="font-semibold text-accent-green">Place call</span> → opens your dialer (or FaceTime/Skype on desktop) and starts an in-app timer.</li>
              <li>Pick the outcome (Connected / Voicemail / No answer / Wrong number / Callback scheduled), add notes, save.</li>
              <li>Every attempt is logged to the task — you (and tomorrow-morning you) can see the full call history.</li>
            </ol>
            <p className="mt-2 text-[11px]">
              <span className="font-semibold text-accent-amber">In-browser calling + AI calls</span> ship via{" "}
              <a href="https://vapi.ai" target="_blank" rel="noreferrer noopener" className="text-brand-300 underline">Vapi</a>{" "}
              (recommended — single vendor for both, Anthropic-native, ~$0.05/min) or{" "}
              <a href="https://www.twilio.com/en-us/voice" target="_blank" rel="noreferrer noopener" className="text-brand-300 underline">Twilio Voice JS SDK</a>{" "}
              (operator-only, ~$0.0085/min). Set <code className="rounded bg-bg-hover px-1">VOICE_PROVIDER</code> +
              the matching keys in env to upgrade — see <Link href="/admin/system-health" className="text-brand-300 underline">/admin/system-health</Link>.
              Until then, tel: links + the call-session UI here cover the human dialing leg.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-bg-border bg-bg-card p-1 text-xs w-fit">
        {(
          [
            ["open", "Open", open],
            ["callbacks", "Callbacks", callbackCount],
            ["phone", "Phone", phone],
            ["sequence", "Sequences", seq],
            ["done", "Done", done],
            ["all", "All", tasks.length],
          ] as const
        ).map(([k, label, n]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 ${
              filter === k
                ? "bg-brand-500/15 text-brand-200"
                : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
            }`}
          >
            {label}
            <span className={`rounded ${filter === k ? "bg-brand-500/20" : "bg-bg-hover"} px-1.5 text-[10px]`}>
              {n}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-bg-border bg-bg-card p-12 text-center">
          <FileText className="mx-auto h-8 w-8 text-ink-tertiary" />
          <div className="mt-3 text-base font-semibold">No tasks here yet</div>
          <p className="mt-1 text-xs text-ink-tertiary">
            Open any{" "}
            <Link href="/buyers" className="text-brand-300 hover:text-brand-200">
              buyer
            </Link>{" "}
            and click &ldquo;Add Phone Task&rdquo; or &ldquo;Draft Sequence&rdquo; to add to this queue.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((t) => {
            const Icon = t.type === "phone" ? Phone : MessageSquare;
            const { phone: phoneNumber, email: emailAddr } = contactFor(t);
            const lastAttempt = t.attempts && t.attempts.length > 0 ? t.attempts[t.attempts.length - 1] : null;
            const lastOutcome = lastAttempt ? OUTCOME_META[lastAttempt.outcome] : null;
            const callbackAt = nextCallbackAt(t);
            // Compute callback-due state: "overdue" if the callback time is
            // in the past, "soon" if within 24h, otherwise "future". Drives
            // the row's accent color so the operator can scan the queue.
            const callbackState: "overdue" | "soon" | "future" | null = callbackAt
              ? new Date(callbackAt).getTime() < Date.now()
                ? "overdue"
                : new Date(callbackAt).getTime() - Date.now() < 24 * 60 * 60 * 1000
                  ? "soon"
                  : "future"
              : null;
            return (
              <li
                key={t.id}
                className={`flex flex-wrap items-center gap-3 rounded-xl border bg-bg-card p-4 transition cursor-pointer hover:border-brand-500/40 hover:bg-bg-hover/30 ${
                  t.done
                    ? "border-bg-border opacity-60"
                    : callbackState === "overdue"
                      ? "border-accent-red/40"
                      : callbackState === "soon"
                        ? "border-accent-amber/40"
                        : "border-bg-border"
                }`}
                onClick={() => setOpenTaskId(t.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpenTaskId(t.id);
                  }
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDone(t.id);
                  }}
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border ${
                    t.done
                      ? "border-accent-green/50 bg-accent-green/15 text-accent-green"
                      : "border-bg-border hover:border-brand-500/40"
                  }`}
                  aria-label="Toggle done"
                >
                  {t.done && <CheckCircle2 className="h-4 w-4" />}
                </button>
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                  t.type === "phone" ? "bg-accent-blue/15 text-accent-blue" : "bg-brand-500/15 text-brand-300"
                }`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium ${t.done ? "line-through" : ""}`}>
                    {t.type === "phone" ? "Phone call" : "Draft sequence"} ·{" "}
                    <span className="text-ink-secondary">{t.buyerName}</span>{" "}
                    <span className="text-ink-tertiary">@ {t.buyerCompany}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-tertiary">
                    <span>Added {relativeTime(t.createdAt)}</span>
                    {phoneNumber && (
                      <>
                        <span className="opacity-60">·</span>
                        <span className="font-mono">{phoneNumber}</span>
                      </>
                    )}
                    {(t.attempts?.length ?? 0) > 0 && (
                      <>
                        <span className="opacity-60">·</span>
                        <span>{t.attempts!.length} attempt{t.attempts!.length === 1 ? "" : "s"}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Last-outcome pill — gives the operator at-a-glance status
                    without opening the drawer. Only renders when there's
                    been at least one attempt. */}
                {lastOutcome && (
                  <span
                    title={`${lastOutcome.label} · ${relativeTime(lastAttempt!.at)}`}
                    className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${lastOutcome.bg} ${lastOutcome.tone}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <lastOutcome.Icon className="h-3 w-3" />
                    {lastOutcome.label}
                  </span>
                )}

                {/* Callback-due badge -- visible only when the latest attempt
                    scheduled a callback. Tone matches callbackState so the
                    operator can spot overdue / due-soon at a glance. */}
                {callbackAt && callbackState && (
                  <span
                    className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                      callbackState === "overdue"
                        ? "bg-accent-red/15 text-accent-red"
                        : callbackState === "soon"
                          ? "bg-accent-amber/15 text-accent-amber"
                          : "bg-brand-500/15 text-brand-200"
                    }`}
                    title={`Callback ${callbackState === "overdue" ? "overdue since" : "due"} ${new Date(callbackAt).toLocaleString()}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <PhoneIncoming className="h-3 w-3" />
                    {callbackState === "overdue"
                      ? `Overdue ${relativeTime(callbackAt)}`
                      : `Callback ${new Date(callbackAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`}
                  </span>
                )}

                <span className="text-[10px] text-ink-tertiary">Open →</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTask(t.id);
                  }}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-tertiary hover:bg-accent-red/10 hover:text-accent-red"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Drawer
        open={!!openTask}
        onClose={() => setOpenTaskId(null)}
        title={openTask ? `${openTask.type === "phone" ? "Call" : "Sequence"} · ${openTask.buyerName}` : ""}
        width="max-w-2xl"
      >
        {openTask && (
          <TaskDetail
            task={openTask}
            buyer={buyerById[openTask.buyerId]}
            contact={contactFor(openTask)}
            voice={{
              deviceRef,
              currentCallRef,
              currentCallSidRef,
              twilioReady,
              twilioInFlight,
              setTwilioInFlight,
            }}
            onPatch={(patch) => patchTask(openTask.id, patch)}
            onRemove={() => removeTask(openTask.id)}
          />
        )}
      </Drawer>
    </div>
  );
}

// ─── Task detail drawer ──────────────────────────────────────────────────

type VoiceContext = {
  deviceRef: React.MutableRefObject<unknown>;
  currentCallRef: React.MutableRefObject<unknown>;
  currentCallSidRef: React.MutableRefObject<string | null>;
  twilioReady: boolean;
  twilioInFlight: "idle" | "connecting" | "ringing" | "open";
  setTwilioInFlight: React.Dispatch<React.SetStateAction<"idle" | "connecting" | "ringing" | "open">>;
};

function TaskDetail({
  task,
  buyer,
  contact,
  voice,
  onPatch,
  onRemove,
}: {
  task: LocalTask;
  buyer: BuyerContact | undefined;
  contact: { phone?: string; email?: string };
  voice: VoiceContext;
  onPatch: (patch: Partial<LocalTask>) => void;
  onRemove: () => void;
}) {
  // Destructure for cleaner reads inside placeCall/cancelCall/saveAttempt
  const { deviceRef, currentCallRef, currentCallSidRef, twilioReady, twilioInFlight, setTwilioInFlight } = voice;
  // Direct context read for diagnostic-surface fields. Avoids piping the
  // failReason / requestMicPermission through the voice prop API.
  const { failReason: voiceFailReason, requestMicPermission } = useVoice();
  const { toast } = useToast();
  const [notesDraft, setNotesDraft] = useState(task.notes ?? "");
  const [notesDirty, setNotesDirty] = useState(false);
  // Active call-session state -- exists only between Place call and outcome save
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [callTickMs, setCallTickMs] = useState(0);
  const [outcomeForm, setOutcomeForm] = useState<{
    outcome: CallOutcome;
    notes: string;
    callbackAt: string;
  } | null>(null);
  // AI talking-points state -- generated on demand, persisted on the task
  const [scriptLoading, setScriptLoading] = useState(false);

  // Active-call controls — only meaningful while twilioInFlight !== "idle"
  const [muted, setMuted] = useState(false);
  const [dialPadOpen, setDialPadOpen] = useState(false);

  function toggleMute() {
    const call = currentCallRef.current as
      | { mute: (m?: boolean) => void; isMuted: () => boolean }
      | null;
    if (!call) return;
    try {
      const next = !muted;
      call.mute(next);
      setMuted(next);
    } catch (e) {
      console.warn("[voice] mute failed", e);
    }
  }

  function sendDigit(digit: string) {
    const call = currentCallRef.current as { sendDigits: (d: string) => void } | null;
    if (!call) return;
    try {
      call.sendDigits(digit);
    } catch (e) {
      console.warn("[voice] sendDigits failed", e);
    }
  }

  // Reset mute + dial pad when the call session resets (so next call starts clean)
  useEffect(() => {
    if (twilioInFlight === "idle") {
      setMuted(false);
      setDialPadOpen(false);
    }
  }, [twilioInFlight]);

  // Recording metadata, keyed by CallSid. Populated by polling
  // /api/voice/recordings whenever this task has attempts with sids
  // but no recording yet. Twilio's recording-status webhook can take
  // ~30s after hangup to fire, so we poll for ~5 min then give up.
  const [recordingsBySid, setRecordingsBySid] = useState<Record<string, RecordingMeta>>({});

  useEffect(() => {
    const sids = (task.attempts ?? [])
      .map((a) => a.callSid)
      .filter((s): s is string => !!s)
      .filter((s) => !recordingsBySid[s]);
    if (sids.length === 0) return;

    let cancelled = false;
    const startedAt = Date.now();
    const POLL_INTERVAL_MS = 5_000;
    const POLL_TIMEOUT_MS = 5 * 60_000;

    async function poll() {
      try {
        const r = await fetch(
          `/api/voice/recordings?callSids=${encodeURIComponent(sids.join(","))}`,
          { credentials: "include", cache: "no-store" },
        );
        if (!r.ok) return;
        const d = (await r.json()) as { recordings: Record<string, RecordingMeta> };
        if (cancelled) return;
        if (Object.keys(d.recordings).length > 0) {
          setRecordingsBySid((prev) => ({ ...prev, ...d.recordings }));
        }
      } catch {
        // silent — caller will retry on the interval
      }
    }
    poll();
    const id = setInterval(() => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        clearInterval(id);
        return;
      }
      // Stop polling early if every attempt has its recording
      const stillMissing = (task.attempts ?? [])
        .map((a) => a.callSid)
        .filter((s): s is string => !!s)
        .some((s) => !recordingsBySid[s]);
      if (!stillMissing) {
        clearInterval(id);
        return;
      }
      poll();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [task.attempts, recordingsBySid]);

  /**
   * Generate AI talking points via /api/agents/call-prep. Pulls everything
   * we know about the buyer (name, title, intent, rationale, target product)
   * + recent attempt summary so the points can reference what already
   * happened on past calls. Persists to task.script so the operator doesn't
   * burn tokens regenerating every drawer-open.
   */
  async function generateScript() {
    setScriptLoading(true);
    try {
      const recentAttempts = (task.attempts ?? []).slice(-3).map((a) => ({
        outcome: a.outcome,
        notes: a.notes,
        daysAgo: Math.floor((Date.now() - new Date(a.at).getTime()) / (24 * 60 * 60 * 1000)),
      }));
      const r = await fetch("/api/agents/call-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName: task.buyerName,
          buyerTitle: buyer?.decisionMakerTitle,
          buyerCompany: task.buyerCompany,
          buyerIndustry: buyer?.industry,
          buyerType: buyer?.status,
          intentScore: buyer?.intentScore,
          rationale: buyer?.rationale,
          forProduct: buyer?.forProduct,
          recentAttempts,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(d.error ?? `Call-prep failed (${r.status})`);
      }
      onPatch({
        script: {
          opener: d.opener,
          talkingPoints: d.talkingPoints ?? [],
          closer: d.closer,
          generatedAt: new Date().toISOString(),
          usedFallback: !!d.usedFallback,
        },
      });
      toast(
        d.usedFallback
          ? "Generated talking points (fallback — set ANTHROPIC_API_KEY for AI version)"
          : `Generated talking points · ${d.model}`,
        d.usedFallback ? "info" : "success",
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Generate failed", "error");
    } finally {
      setScriptLoading(false);
    }
  }

  // Reset when switching tasks
  useEffect(() => {
    setNotesDraft(task.notes ?? "");
    setNotesDirty(false);
    setCallStartedAt(null);
    setCallTickMs(0);
    setOutcomeForm(null);
  }, [task.id, task.notes]);

  // Tick the call timer every 1s while a call is "active"
  useEffect(() => {
    if (callStartedAt == null) return;
    const id = setInterval(() => setCallTickMs(Date.now() - callStartedAt), 1000);
    return () => clearInterval(id);
  }, [callStartedAt]);

  async function placeCall() {
    if (!contact.phone) {
      toast("No phone number on file for this buyer", "error");
      return;
    }
    setCallStartedAt(Date.now());
    setCallTickMs(0);
    setOutcomeForm({ outcome: "connected", notes: "", callbackAt: "" });

    // If Twilio is wired + Device registered, place the call IN BROWSER.
    // Otherwise fall back to the OS dialer via tel: so the operator's
    // workflow doesn't break -- they just leave the page momentarily.
    const device = deviceRef.current as
      | { connect: (opts: { params: Record<string, string> }) => Promise<unknown> }
      | null;
    // Only fall back to tel: when voice is GENUINELY not configured. If
    // voice is partially configured (mic denied / register failed / token
    // failed) the operator's intent is "call from the browser" -- silently
    // handing off to the OS dialer surprises them with Windows Phone Link
    // or FaceTime which is NOT what they want. Surface the failure instead.
    if (!twilioReady && voiceFailReason && voiceFailReason !== "not-configured") {
      toast(
        `Voice failed: ${voiceFailReason}. Fix in /admin/system-health (TopBar badge has details).`,
        "error",
      );
      cancelCall();
      return;
    }

    if (twilioReady && device) {
      try {
        setTwilioInFlight("connecting");
        currentCallSidRef.current = null;
        const call = (await device.connect({
          params: { To: contact.phone },
        })) as {
          on: (ev: string, cb: (...args: unknown[]) => void) => void;
          disconnect: () => void;
          status: () => string;
          parameters?: { CallSid?: string };
        };
        currentCallRef.current = call;

        // Lifecycle events drive the UI badge + auto-suggest outcome on hangup
        call.on("ringing", () => setTwilioInFlight("ringing"));
        call.on("accept", () => {
          setTwilioInFlight("open");
          // CallSid is reliably populated by the time the call is accepted.
          // Capture it here for join with the recording webhook later.
          if (call.parameters?.CallSid) {
            currentCallSidRef.current = call.parameters.CallSid;
          }
        });
        call.on("disconnect", () => {
          setTwilioInFlight("idle");
          currentCallRef.current = null;
          // Don't clear currentCallSidRef -- saveAttempt reads it after
          // hangup to persist the CallSid on the attempt
        });
        call.on("error", (...args) => {
          const err = args[0] as { message?: string } | undefined;
          setTwilioInFlight("idle");
          currentCallRef.current = null;
          toast(`Call error: ${err?.message ?? "unknown"}`, "error");
        });
      } catch (err) {
        setTwilioInFlight("idle");
        toast(`Call failed to start: ${err instanceof Error ? err.message : "unknown"}`, "error");
        // Fall back to tel: so the operator can still complete the call
        window.open(`tel:${contact.phone}`, "_self");
      }
    } else {
      // tel: fallback -- opens whatever app the OS registered for tel:
      // (Phone Link on Windows, FaceTime on Mac, the dialer on mobile).
      // Toast first so the operator knows WHY their browser isn't dialing.
      toast(
        "In-browser calling isn't configured — opening your OS dialer. To dial from the browser, set VOICE_PROVIDER=twilio + Twilio keys in env (see /admin/system-health).",
        "info",
      );
      window.open(`tel:${contact.phone}`, "_self");
    }
  }

  function cancelCall() {
    // Hang up the in-flight Twilio call if any
    const call = currentCallRef.current as { disconnect: () => void } | null;
    if (call) {
      try {
        call.disconnect();
      } catch (e) {
        console.warn("[twilio voice] hangup failed", e);
      }
      currentCallRef.current = null;
    }
    setTwilioInFlight("idle");
    setCallStartedAt(null);
    setCallTickMs(0);
    setOutcomeForm(null);
  }

  function saveAttempt() {
    if (!outcomeForm || callStartedAt == null) return;
    const durationSec = Math.max(1, Math.round((Date.now() - callStartedAt) / 1000));
    const attempt: CallAttempt = {
      at: new Date().toISOString(),
      durationSec,
      outcome: outcomeForm.outcome,
      notes: outcomeForm.notes.trim() || undefined,
      callbackAt:
        outcomeForm.outcome === "callback-scheduled" && outcomeForm.callbackAt
          ? new Date(outcomeForm.callbackAt).toISOString()
          : undefined,
      // Persist the CallSid so /api/voice/recordings can match this
      // attempt to its recording once Twilio's webhook fires.
      callSid: currentCallSidRef.current ?? undefined,
    };
    currentCallSidRef.current = null;
    onPatch({
      attempts: [...(task.attempts ?? []), attempt],
    });
    toast(
      `Logged ${OUTCOME_META[attempt.outcome].label.toLowerCase()} · ${durationSec}s${attempt.callSid ? " · recording will appear shortly" : ""}`,
      attempt.outcome === "connected" ? "success" : "info",
    );
    cancelCall();
  }

  function saveNotes() {
    if (!notesDirty) return;
    onPatch({ notes: notesDraft });
    setNotesDirty(false);
    toast("Notes saved");
  }

  function toggleDone() {
    onPatch({ done: !task.done });
    toast(task.done ? "Marked open" : "Task completed");
  }

  // Pull derived data for the script section
  const intent = buyer?.intentScore;
  const rationale = buyer?.rationale;
  const targetProduct = buyer?.forProduct;

  return (
    <div className="space-y-5 p-5">
      {/* Buyer summary card */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Buyer</div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-bold leading-tight">{task.buyerName}</div>
            <div className="text-xs text-ink-secondary">
              {buyer?.decisionMakerTitle && <>{buyer.decisionMakerTitle} · </>}
              {task.buyerCompany}
              {buyer?.industry && <> · {buyer.industry}</>}
            </div>
          </div>
          {intent != null && (
            <span className="flex items-center gap-1 rounded-md bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-200">
              <Flame className="h-3 w-3" /> Intent {intent}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <ContactRow Icon={Phone} value={contact.phone} type="tel" placeholder="No phone on file" />
        <ContactRow Icon={Mail} value={contact.email} type="mailto" placeholder="No email on file" />
      </div>

      {/* Why we're calling — agent rationale + target product */}
      {(rationale || targetProduct) && (
        <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-3 text-xs">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-brand-200">
            <Bot className="h-3 w-3" /> Why this call
          </div>
          {targetProduct && (
            <div className="mt-1 text-ink-secondary">
              Pitching <span className="font-semibold text-ink-primary">{targetProduct}</span>
            </div>
          )}
          {rationale && (
            <div className="mt-1 whitespace-pre-wrap text-ink-secondary">{rationale}</div>
          )}
        </div>
      )}

      {/* AI-generated talking points -- opener / 3-5 bullets / closer.
          Generates once, persists to task.script. Operator can re-run when
          context changes (after a previous call, after agreed-on next step). */}
      <div className="rounded-lg border border-bg-border bg-bg-card p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
            <Bot className="h-3 w-3 text-brand-300" /> AI talking points
            {task.script && (
              <span className="normal-case tracking-normal text-ink-tertiary">
                · generated {relativeTime(task.script.generatedAt)}
                {task.script.usedFallback && " (fallback)"}
              </span>
            )}
          </div>
          <button
            onClick={generateScript}
            disabled={scriptLoading}
            className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-hover/40 px-2 py-1 text-[11px] hover:bg-bg-hover disabled:opacity-60"
            title={task.script ? "Regenerate with latest context" : "Generate AI talking points for this call"}
          >
            {scriptLoading ? (
              <Bot className="h-3 w-3 animate-pulse" />
            ) : (
              <Bot className="h-3 w-3 text-brand-300" />
            )}
            {task.script ? "Regenerate" : "Generate talking points"}
          </button>
        </div>

        {task.script ? (
          <div className="mt-3 space-y-3 text-xs">
            <div className="rounded-md border border-accent-green/30 bg-accent-green/5 p-2.5">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-accent-green">Opener</div>
              <p className="mt-0.5 text-ink-primary">&ldquo;{task.script.opener}&rdquo;</p>
            </div>
            <ul className="space-y-1.5">
              {task.script.talkingPoints.map((p, i) => (
                <li key={i} className="flex items-start gap-2 rounded-md border border-bg-border bg-bg-hover/30 p-2">
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-brand-500/20 text-[9px] font-bold text-brand-200">
                    {i + 1}
                  </span>
                  <span className="text-ink-secondary">{p}</span>
                </li>
              ))}
            </ul>
            <div className="rounded-md border border-brand-500/30 bg-brand-500/5 p-2.5">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-brand-200">Closer / next step</div>
              <p className="mt-0.5 text-ink-primary">&ldquo;{task.script.closer}&rdquo;</p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-ink-tertiary">
            Click <span className="font-semibold text-ink-secondary">Generate talking points</span> to get a tailored opener,
            3-5 bullets, and a suggested closer based on the buyer&apos;s industry, intent score, and call history.
          </p>
        )}
      </div>

      {/* Call session — placeholder when idle, live timer when active, then
          outcome form. No backend voice yet; tel: opens the dialer + we
          track everything else in-app. */}
      <div className="rounded-lg border border-bg-border bg-bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-ink-tertiary">
            <span>Call session</span>
            {twilioReady && (
              <span
                title="Browser dialer ready (Twilio Voice JS SDK)"
                className="rounded bg-accent-green/15 px-1.5 py-0.5 normal-case tracking-normal text-accent-green"
              >
                Browser dialer ready
              </span>
            )}
          </div>
          {callStartedAt != null && (
            <span className="font-mono text-xs font-semibold text-accent-green">
              {fmtDuration(callTickMs)}
            </span>
          )}
        </div>

        {callStartedAt == null ? (
          <div className="mt-2">
            <button
              onClick={placeCall}
              disabled={!contact.phone}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-accent-green/15 px-3 py-2 text-sm font-semibold text-accent-green transition hover:bg-accent-green/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <PhoneCall className="h-4 w-4" />
              {contact.phone ? `Place call · ${contact.phone}` : "No phone number on file"}
            </button>
            <div className="mt-1.5 text-[10px] text-ink-tertiary">
              {twilioReady
                ? "Calls via Twilio Voice in your browser — never leaves the page. Outcome + notes get logged after."
                : "Opens your device dialer. Outcome + notes get logged after the call. Configure VOICE_PROVIDER=twilio in env to dial in-browser."}
            </div>

            {/* Specific failure surface — when voice isn't ready, tell the
                operator EXACTLY why and offer a one-click fix where possible.
                Prevents silent failures like denied mic that look like
                "calls just don't work". */}
            {!twilioReady && voiceFailReason && (
              <div className="mt-3 rounded-md border border-accent-amber/30 bg-accent-amber/5 p-3 text-[11px]">
                {voiceFailReason === "not-configured" && (
                  <>
                    <div className="font-semibold text-accent-amber">In-browser calling isn&apos;t configured</div>
                    <p className="mt-0.5 text-ink-secondary">
                      Set <code className="rounded bg-bg-hover px-1">VOICE_PROVIDER=twilio</code> + Twilio API keys + TwiML App SID in env.
                    </p>
                    <Link
                      href="/admin/system-health"
                      className="mt-2 inline-block rounded-md bg-gradient-brand px-2.5 py-1 text-[10px] font-semibold shadow-glow"
                    >
                      Open System Health →
                    </Link>
                  </>
                )}
                {voiceFailReason === "mic-denied" && (
                  <>
                    <div className="font-semibold text-accent-red">Microphone permission denied</div>
                    <p className="mt-0.5 text-ink-secondary">
                      Calls need mic access. Click below to prompt the browser; if no prompt, click the lock icon in your address bar.
                    </p>
                    <button
                      onClick={requestMicPermission}
                      className="mt-2 inline-block rounded-md bg-gradient-brand px-2.5 py-1 text-[10px] font-semibold shadow-glow"
                    >
                      Request mic permission
                    </button>
                  </>
                )}
                {voiceFailReason === "mic-error" && (
                  <>
                    <div className="font-semibold text-accent-red">No microphone detected</div>
                    <p className="mt-0.5 text-ink-secondary">
                      Plug in a mic / check your audio device.
                    </p>
                  </>
                )}
                {voiceFailReason === "token-fetch-failed" && (
                  <>
                    <div className="font-semibold text-accent-amber">Couldn&apos;t fetch voice token</div>
                    <p className="mt-0.5 text-ink-secondary">
                      Sign out + back in and reload. If it persists, check the browser console.
                    </p>
                  </>
                )}
                {voiceFailReason === "sdk-load-failed" && (
                  <>
                    <div className="font-semibold text-accent-amber">Voice SDK didn&apos;t load</div>
                    <p className="mt-0.5 text-ink-secondary">
                      Build issue. Make sure <code className="rounded bg-bg-hover px-1">@twilio/voice-sdk</code> is installed.
                    </p>
                  </>
                )}
                {voiceFailReason === "register-failed" && (
                  <>
                    <div className="font-semibold text-accent-amber">Twilio Device didn&apos;t register</div>
                    <p className="mt-0.5 text-ink-secondary">
                      Verify API key + TwiML App SID match your account. Check the browser console for the specific error.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="rounded-md border border-accent-green/30 bg-accent-green/5 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 font-semibold text-accent-green">
                <PhoneCall className="h-3.5 w-3.5 animate-pulse" />
                {twilioInFlight === "connecting" && "Connecting…"}
                {twilioInFlight === "ringing" && "Ringing…"}
                {twilioInFlight === "open" && "Connected — call in progress"}
                {twilioInFlight === "idle" && "Call in progress"}
              </div>
              <div className="mt-0.5 text-ink-secondary">
                Pick the outcome below when you hang up.
              </div>
            </div>

            {/* Active-call controls — only render when we have an in-browser
                Twilio call. tel: fallback calls have no in-app controls
                (the device dialer handles its own UI). */}
            {twilioReady && (twilioInFlight === "open" || twilioInFlight === "ringing" || twilioInFlight === "connecting") && (
              <div className="rounded-md border border-bg-border bg-bg-hover/30 p-3">
                {/* Top control row: mute + dial pad toggle + hang up */}
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={toggleMute}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${
                      muted
                        ? "bg-accent-amber/15 text-accent-amber"
                        : "border border-bg-border bg-bg-card text-ink-secondary hover:bg-bg-hover"
                    }`}
                    title={muted ? "Unmute your microphone" : "Mute your microphone"}
                  >
                    <MicOff className="h-3 w-3" />
                    {muted ? "Muted" : "Mute"}
                  </button>
                  <button
                    onClick={() => setDialPadOpen((v) => !v)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${
                      dialPadOpen
                        ? "bg-brand-500/15 text-brand-200"
                        : "border border-bg-border bg-bg-card text-ink-secondary hover:bg-bg-hover"
                    }`}
                    title="Send DTMF tones — useful for navigating phone trees / IVR"
                  >
                    <Hash className="h-3 w-3" />
                    Dial pad
                  </button>
                  <button
                    onClick={() => {
                      const call = currentCallRef.current as { disconnect: () => void } | null;
                      if (call) {
                        try { call.disconnect(); } catch {}
                      }
                    }}
                    className="ml-auto flex items-center gap-1.5 rounded-md bg-accent-red/15 px-3 py-1.5 text-[11px] font-semibold text-accent-red hover:bg-accent-red/25"
                  >
                    <PhoneOff className="h-3 w-3" /> Hang up
                  </button>
                </div>

                {/* DTMF dial pad — collapsible. Sends digits via Twilio's
                    Call.sendDigits() so operator can navigate IVRs without
                    leaving the page. */}
                {dialPadOpen && (
                  <div className="mt-3 grid grid-cols-3 gap-1.5">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((d) => (
                      <button
                        key={d}
                        onClick={() => sendDigit(d)}
                        className="rounded-md border border-bg-border bg-bg-card py-2 text-sm font-mono font-semibold hover:bg-bg-hover"
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                )}

                {/* Pinned talking points — script visible during call so
                    operator doesn't have to scroll. Compact rendering. */}
                {task.script && (
                  <div className="mt-3 border-t border-bg-border pt-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                      Talking points (pinned)
                    </div>
                    <div className="mt-1.5 space-y-1">
                      <div className="text-[11px] text-ink-secondary">
                        <span className="font-semibold text-accent-green">Open:</span>{" "}
                        &ldquo;{task.script.opener}&rdquo;
                      </div>
                      {task.script.talkingPoints.slice(0, 5).map((p, i) => (
                        <div key={i} className="text-[11px] text-ink-secondary">
                          <span className="font-mono text-brand-200">{i + 1}.</span> {p}
                        </div>
                      ))}
                      <div className="text-[11px] text-ink-secondary">
                        <span className="font-semibold text-brand-200">Close:</span>{" "}
                        &ldquo;{task.script.closer}&rdquo;
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Outcome picker */}
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {(Object.keys(OUTCOME_META) as CallOutcome[]).map((o) => {
                const meta = OUTCOME_META[o];
                const active = outcomeForm?.outcome === o;
                return (
                  <button
                    key={o}
                    onClick={() => setOutcomeForm((f) => ({ ...f!, outcome: o }))}
                    className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition ${
                      active
                        ? `border-current ${meta.bg} ${meta.tone}`
                        : "border-bg-border bg-bg-card text-ink-secondary hover:bg-bg-hover"
                    }`}
                  >
                    <meta.Icon className="h-3 w-3" />
                    {meta.label}
                  </button>
                );
              })}
            </div>

            {outcomeForm?.outcome === "callback-scheduled" && (
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-ink-tertiary">Callback at</span>
                <input
                  type="datetime-local"
                  value={outcomeForm.callbackAt}
                  onChange={(e) => setOutcomeForm((f) => ({ ...f!, callbackAt: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-md border border-bg-border bg-bg-card px-2 text-xs focus:border-brand-500 focus:outline-none"
                />
              </label>
            )}

            <textarea
              value={outcomeForm?.notes ?? ""}
              onChange={(e) => setOutcomeForm((f) => ({ ...f!, notes: e.target.value }))}
              placeholder="What did they say? Decision-makers? Objections? Next step?"
              rows={3}
              maxLength={2000}
              className="w-full resize-y rounded-md border border-bg-border bg-bg-card p-2 text-xs placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
            />

            <div className="flex items-center gap-2">
              <button
                onClick={saveAttempt}
                disabled={!outcomeForm}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-gradient-brand py-2 text-xs font-semibold shadow-glow disabled:opacity-60"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Save attempt
              </button>
              {/* Hang Up only renders when an in-browser Twilio call is
                  actually in flight -- otherwise Cancel is enough (the
                  device dialer call is OS-level, can't be hung up here). */}
              {twilioInFlight === "open" || twilioInFlight === "ringing" || twilioInFlight === "connecting" ? (
                <button
                  onClick={() => {
                    const call = currentCallRef.current as { disconnect: () => void } | null;
                    if (call) {
                      try {
                        call.disconnect();
                      } catch {}
                      currentCallRef.current = null;
                    }
                    setTwilioInFlight("idle");
                  }}
                  className="flex items-center gap-1.5 rounded-md bg-accent-red/15 px-3 py-2 text-xs font-semibold text-accent-red hover:bg-accent-red/25"
                >
                  <PhoneOff className="h-3 w-3" /> Hang up
                </button>
              ) : null}
              <button
                onClick={cancelCall}
                className="rounded-md border border-bg-border bg-bg-card px-3 py-2 text-xs hover:bg-bg-hover"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notes — pre-call context the operator wants to remember */}
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-ink-tertiary">
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" /> Notes
          </span>
          {notesDirty && <span className="text-accent-amber normal-case tracking-normal">unsaved</span>}
        </div>
        <textarea
          value={notesDraft}
          onChange={(e) => {
            setNotesDraft(e.target.value);
            setNotesDirty(e.target.value !== (task.notes ?? ""));
          }}
          onBlur={saveNotes}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
              e.preventDefault();
              saveNotes();
            }
          }}
          placeholder="Pre-call context, talking points, who introduced this lead, etc."
          rows={3}
          maxLength={5000}
          className="w-full resize-y rounded-md border border-bg-border bg-bg-card p-2 text-xs placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
        />
        <div className="mt-1 text-[10px] text-ink-tertiary">Saves on blur · ⌘S to save now</div>
      </div>

      {/* Attempt history — every call logged, newest first */}
      {(task.attempts?.length ?? 0) > 0 && (
        <div>
          <div className="mb-1.5 text-[10px] uppercase tracking-wider text-ink-tertiary">
            Call history · {task.attempts!.length}
          </div>
          <ul className="space-y-2">
            {task.attempts!.slice().reverse().map((a, i) => {
              const meta = OUTCOME_META[a.outcome];
              const recording = a.callSid ? recordingsBySid[a.callSid] : undefined;
              return (
                <li key={i} className="rounded-md border border-bg-border bg-bg-hover/30 p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${meta.bg} ${meta.tone}`}>
                      <meta.Icon className="h-3 w-3" /> {meta.label}
                    </span>
                    <span className="text-ink-tertiary">{relativeTime(a.at)}</span>
                    {a.durationSec != null && (
                      <span className="font-mono text-ink-tertiary">{fmtDuration(a.durationSec * 1000)}</span>
                    )}
                    {a.callbackAt && (
                      <span className="text-brand-200">
                        callback {new Date(a.callbackAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                    {a.callSid && !recording && (
                      <span className="text-ink-tertiary opacity-70" title={`CallSid ${a.callSid}`}>
                        recording pending…
                      </span>
                    )}
                  </div>
                  {a.notes && (
                    <div className="mt-1 whitespace-pre-wrap text-ink-secondary">{a.notes}</div>
                  )}
                  {/* Recording player -- once Twilio's recording-status
                      webhook fires and the polling effect picks it up,
                      render an inline <audio> tag pointing at our proxy
                      so the browser can play it without Twilio Basic Auth. */}
                  {recording && (
                    <div className="mt-2 flex items-center gap-2">
                      <audio
                        controls
                        preload="none"
                        src={`/api/voice/recording-proxy/${recording.recordingSid}`}
                        className="h-7 max-w-full flex-1"
                      />
                      <a
                        href={`/api/voice/recording-proxy/${recording.recordingSid}`}
                        download={`call-${recording.recordingSid}.mp3`}
                        title="Download recording"
                        className="text-[10px] text-brand-300 hover:text-brand-200"
                      >
                        download
                      </a>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Actions row — toggle done + remove + open buyer */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-bg-border pt-4">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleDone}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${
              task.done
                ? "border border-bg-border bg-bg-hover/40 text-ink-secondary hover:bg-bg-hover"
                : "bg-accent-green/15 text-accent-green hover:bg-accent-green/25"
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {task.done ? "Mark open" : "Mark done"}
          </button>
          <Link
            href={`/buyers?focus=${encodeURIComponent(task.buyerId)}`}
            className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-xs hover:bg-bg-hover"
          >
            View buyer →
          </Link>
        </div>
        <button
          onClick={onRemove}
          className="flex items-center gap-1.5 rounded-md border border-accent-red/30 bg-accent-red/5 px-3 py-1.5 text-xs text-accent-red hover:bg-accent-red/10"
        >
          <Trash2 className="h-3 w-3" /> Remove task
        </button>
      </div>
    </div>
  );
}

// ─── Small components ────────────────────────────────────────────────────

function ContactRow({
  Icon,
  value,
  type,
  placeholder,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  value: string | undefined;
  type: "tel" | "mailto";
  placeholder: string;
}) {
  if (!value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-bg-border bg-bg-hover/30 px-2 py-1.5 text-ink-tertiary opacity-60">
        <Icon className="h-3.5 w-3.5" />
        <span>{placeholder}</span>
      </div>
    );
  }
  return (
    <a
      href={`${type}:${value}`}
      className="flex items-center gap-2 rounded-md border border-bg-border bg-bg-hover/30 px-2 py-1.5 text-brand-300 hover:bg-bg-hover hover:text-brand-200"
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="truncate font-mono">{value}</span>
    </a>
  );
}

function fmtDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Stat({ label, v, Icon, onClick, active }: { label: string; v: number; Icon: React.ComponentType<{ className?: string }>; onClick?: () => void; active?: boolean }) {
  const inner = (
    <>
      <Icon className="h-4 w-4 text-brand-300" />
      <div className="mt-2 text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className="mt-1 text-2xl font-bold">{v}</div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`group block w-full rounded-xl border border-bg-border bg-bg-card p-4 text-left transition-all hover:bg-bg-hover hover:ring-brand-500/40 ring-1 ${active ? "ring-brand-500/60" : "ring-transparent"}`}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      {inner}
    </div>
  );
}
