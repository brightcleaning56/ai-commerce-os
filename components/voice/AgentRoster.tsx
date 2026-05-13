"use client";
import { useEffect, useRef, useState } from "react";
import { Headphones, Loader2 } from "lucide-react";
import { useCapability } from "@/components/CapabilityContext";

/**
 * AgentRoster — TopBar pill showing how many agents are currently
 * online (Twilio Device registered + heartbeating). Click to expand
 * a popover that lists each agent with their role + how long ago
 * they last heartbeat.
 *
 * Uses /api/voice/presence GET (capability-gated on voice:read).
 * Hidden entirely for callers without voice:read so the pill doesn't
 * show up for Viewer/Analyst sessions that can't act on the info.
 *
 * Polling: 20s while open, 60s while closed. Cheap (single small
 * JSON blob) but no point hammering the server every second.
 */

type AgentRosterRow = {
  identity: string;
  email: string;
  role: string;
  lastHeartbeatAt: string;
  userAgent?: string;
};

export default function AgentRoster() {
  const canSee = useCapability("voice:read");
  const [online, setOnline] = useState<AgentRosterRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/voice/presence", {
        credentials: "include",
        cache: "no-store",
      });
      if (r.ok) {
        const d = await r.json();
        setOnline(d.online ?? []);
      }
    } catch {
      // Network error — keep stale state; the next tick retries.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canSee) return;
    void load();
    const interval = setInterval(load, open ? 20_000 : 60_000);
    return () => clearInterval(interval);
  }, [canSee, open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!popoverRef.current) return;
      if (!popoverRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (!canSee) return null;

  const count = online.length;

  return (
    <div ref={popoverRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="inline-flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card px-2.5 py-1.5 text-[11px] font-medium text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
        title={count === 0 ? "No agents online" : `${count} agent${count === 1 ? "" : "s"} online for calls`}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            count > 0
              ? "bg-accent-green shadow-[0_0_6px_#22c55e]"
              : "bg-ink-tertiary"
          }`}
        />
        <Headphones className="h-3 w-3" />
        <span>{count} online</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-bg-border bg-bg-card p-3 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold">On call duty</div>
            {loading && <Loader2 className="h-3 w-3 animate-spin text-ink-tertiary" />}
          </div>
          <div className="mt-1 text-[10px] text-ink-tertiary">
            Agents whose browser Device is registered. Inbound calls ring everyone in
            this list in parallel.
          </div>
          <ul className="mt-3 space-y-2">
            {online.length === 0 ? (
              <li className="rounded-md border border-bg-border bg-bg-app p-2 text-[11px] text-ink-tertiary">
                Nobody&apos;s online. Inbound calls fall straight to voicemail.
              </li>
            ) : (
              online.map((a) => (
                <li
                  key={a.identity}
                  className="flex items-center gap-2 rounded-md border border-bg-border bg-bg-app px-2 py-1.5"
                >
                  <div className="h-1.5 w-1.5 rounded-full bg-accent-green" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium text-ink-primary">
                      {a.email}
                    </div>
                    <div className="text-[10px] text-ink-tertiary">
                      {a.role} · {relTimeShort(a.lastHeartbeatAt)}
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function relTimeShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 5_000) return "just now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  return `${Math.floor(ms / 60_000)}m ago`;
}
