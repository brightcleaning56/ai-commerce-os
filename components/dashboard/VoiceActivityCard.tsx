"use client";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  Voicemail,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Voice activity card for the Command Center (slice 42).
 *
 * Compact widget showing:
 *   - Calls placed today (split by outcome)
 *   - Unread voicemails
 *   - Last 3 calls (buyer + outcome + relative time)
 *
 * Pulls /api/calls + /api/voice/voicemails. Self-fetches on mount +
 * every 60s. Hides quietly when there's nothing to show on a fresh
 * workspace.
 */

type Call = {
  id: string;
  direction: "outbound" | "inbound";
  toContact?: string;
  startedAt: string;
  outcome?:
    | "connected"
    | "voicemail"
    | "no-answer"
    | "wrong-number"
    | "callback-scheduled"
    | "missed"
    | "failed";
};

type Voicemail = {
  id: string;
  from: string;
  read: boolean;
  recordedAt: string;
};

const OUTCOME_ICON = {
  connected: CheckCircle2,
  voicemail: Voicemail,
  "no-answer": PhoneOff,
  "wrong-number": PhoneOff,
  "callback-scheduled": PhoneCall,
  missed: PhoneOff,
  failed: PhoneOff,
} as const;

const OUTCOME_TONE = {
  connected: "text-accent-green",
  voicemail: "text-accent-amber",
  "no-answer": "text-ink-tertiary",
  "wrong-number": "text-accent-red",
  "callback-scheduled": "text-accent-blue",
  missed: "text-accent-red",
  failed: "text-accent-red",
} as const;

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function VoiceActivityCard() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [voicemails, setVoicemails] = useState<Voicemail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    function load() {
      Promise.all([
        fetch("/api/calls?limit=50", { cache: "no-store", credentials: "include" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch("/api/voice/voicemails", { cache: "no-store", credentials: "include" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]).then(([callData, vmData]) => {
        if (cancelled) return;
        setCalls(callData?.calls ?? []);
        setVoicemails(vmData?.voicemails ?? []);
        setLoading(false);
      });
    }
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Today (last 24h) split
  const since24hMs = Date.now() - 24 * 60 * 60 * 1000;
  const todayCalls = calls.filter((c) => new Date(c.startedAt).getTime() >= since24hMs);
  const connected = todayCalls.filter((c) => c.outcome === "connected").length;
  const voicemailCount = todayCalls.filter((c) => c.outcome === "voicemail").length;
  const noAnswer = todayCalls.filter((c) => c.outcome === "no-answer" || c.outcome === "missed").length;
  const unreadVm = voicemails.filter((v) => !v.read).length;
  const recentCalls = calls.slice(0, 3);

  // Hide on a fresh workspace with nothing to report
  if (!loading && todayCalls.length === 0 && unreadVm === 0 && recentCalls.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PhoneCall className="h-4 w-4 text-ink-secondary" />
          <h3 className="text-sm font-semibold">Voice activity</h3>
        </div>
        <Link href="/calls" className="text-[11px] text-accent-blue hover:underline">
          Open call log →
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[11px] text-ink-tertiary">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading...
        </div>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Today" value={String(todayCalls.length)} />
            <Stat label="Connected" value={String(connected)} tone="green" />
            <Stat label="Voicemail" value={String(voicemailCount)} tone="amber" />
            <Stat
              label="Unread VMs"
              value={String(unreadVm)}
              tone={unreadVm > 0 ? "red" : "muted"}
              Icon={Voicemail}
            />
          </div>

          {recentCalls.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                Last {recentCalls.length} call{recentCalls.length === 1 ? "" : "s"}
              </div>
              <ul className="space-y-1">
                {recentCalls.map((c) => {
                  const outcome = c.outcome ?? "no-answer";
                  const Icon = OUTCOME_ICON[outcome];
                  const tone = OUTCOME_TONE[outcome];
                  return (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-bg-border/60 bg-bg-app/40 px-2.5 py-1.5 text-[11px]"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {c.direction === "inbound" ? (
                          <PhoneIncoming className="h-3 w-3 text-accent-blue" />
                        ) : (
                          <PhoneCall className="h-3 w-3 text-ink-tertiary" />
                        )}
                        <span className="truncate font-medium">{c.toContact || "—"}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Icon className={`h-3 w-3 ${tone}`} />
                        <span className={`text-[10px] ${tone}`}>{outcome}</span>
                        <span className="font-mono text-[10px] text-ink-tertiary">
                          {relTime(c.startedAt)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {unreadVm > 0 && (
            <Link
              href="/calls"
              className="mt-3 flex items-center justify-between rounded-md border border-accent-amber/30 bg-accent-amber/5 px-3 py-2 text-[11px] text-accent-amber hover:bg-accent-amber/10"
            >
              <span>
                <Voicemail className="mr-1 inline h-3 w-3" /> {unreadVm} unread voicemail{unreadVm === 1 ? "" : "s"}
              </span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  Icon,
}: {
  label: string;
  value: string;
  tone?: "green" | "amber" | "red" | "muted";
  Icon?: React.ComponentType<{ className?: string }>;
}) {
  const valueColor =
    tone === "green"
      ? "text-accent-green"
      : tone === "amber"
        ? "text-accent-amber"
        : tone === "red"
          ? "text-accent-red"
          : "text-ink-primary";
  return (
    <div className="rounded-md border border-bg-border bg-bg-app px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className={`mt-0.5 text-base font-bold tabular-nums ${valueColor}`}>{value}</div>
    </div>
  );
}
