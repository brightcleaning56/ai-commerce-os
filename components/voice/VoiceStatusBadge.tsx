"use client";
import { ChevronDown, MicOff, Phone, PhoneCall, PhoneOff, ShieldAlert, Wifi } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useVoice } from "@/components/voice/VoiceContext";

/**
 * Compact voice-status pill for the TopBar. Shows at-a-glance whether
 * the operator can place + take calls. Click to expand a popover with
 * the specific failure reason + a one-click fix.
 *
 * States:
 *   - Ready (green): Device registered + mic granted
 *   - Connecting (amber pulse): in initial fetch / SDK load / register
 *   - Mic denied (red): operator needs to click "Grant" -> browser prompt
 *   - Not configured (gray): VOICE_PROVIDER env not set -> link to /admin/system-health
 *   - In call (blue): a call is currently in flight
 */
export default function VoiceStatusBadge() {
  const v = useVoice();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Derive state for the pill
  const inCall = v.twilioInFlight !== "idle";
  let label: string;
  let tone: "green" | "amber" | "red" | "gray" | "blue";
  let Icon: React.ComponentType<{ className?: string }>;

  if (inCall) {
    label = v.twilioInFlight === "open" ? "In call" : v.twilioInFlight === "ringing" ? "Ringing" : "Connecting…";
    tone = "blue";
    Icon = PhoneCall;
  } else if (v.twilioReady) {
    label = "Voice ready";
    tone = "green";
    Icon = Phone;
  } else if (v.failReason === "mic-denied" || v.failReason === "mic-error") {
    label = "Mic denied";
    tone = "red";
    Icon = MicOff;
  } else if (v.failReason === "not-configured") {
    label = "Not configured";
    tone = "gray";
    Icon = PhoneOff;
  } else if (v.failReason) {
    label = "Voice error";
    tone = "red";
    Icon = ShieldAlert;
  } else {
    label = "Connecting…";
    tone = "amber";
    Icon = Wifi;
  }

  const toneClass = {
    green: "bg-accent-green/15 text-accent-green border-accent-green/30",
    amber: "bg-accent-amber/15 text-accent-amber border-accent-amber/30",
    red: "bg-accent-red/15 text-accent-red border-accent-red/30",
    gray: "bg-bg-hover text-ink-tertiary border-bg-border",
    blue: "bg-accent-blue/15 text-accent-blue border-accent-blue/30",
  }[tone];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((x) => !x)}
        className={`hidden items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition lg:flex ${toneClass}`}
        title="Voice status — click for details"
      >
        <Icon className={`h-3 w-3 ${tone === "blue" ? "animate-pulse" : ""}`} />
        {label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 rounded-xl border border-bg-border bg-bg-panel p-4 text-xs shadow-2xl">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Icon className={`h-4 w-4 ${tone === "blue" ? "animate-pulse" : ""}`} />
            <span>{label}</span>
          </div>

          {/* Status detail per state */}
          {v.twilioReady && !inCall && (
            <div className="mt-2 space-y-1 text-ink-secondary">
              <div>✓ Twilio Device registered</div>
              <div>✓ Mic permission: {v.micPermission}</div>
              <div className="text-ink-tertiary">Place calls from /tasks. Buyers calling your number ring this browser.</div>
            </div>
          )}

          {v.failReason === "not-configured" && (
            <div className="mt-2 space-y-2">
              <p className="text-ink-secondary">
                Voice env vars aren&apos;t set. Without them you&apos;re on tel: fallback (device dialer).
              </p>
              <Link
                href="/admin/system-health"
                onClick={() => setOpen(false)}
                className="block rounded-md bg-gradient-brand px-3 py-1.5 text-center text-[11px] font-semibold shadow-glow"
              >
                Open System Health →
              </Link>
              <div className="text-[10px] text-ink-tertiary">
                Need: <code className="rounded bg-bg-hover px-1">VOICE_PROVIDER=twilio</code>,{" "}
                <code className="rounded bg-bg-hover px-1">TWILIO_API_KEY</code>,{" "}
                <code className="rounded bg-bg-hover px-1">TWILIO_API_SECRET</code>,{" "}
                <code className="rounded bg-bg-hover px-1">TWILIO_TWIML_APP_SID</code>
              </div>
            </div>
          )}

          {(v.failReason === "mic-denied" || v.failReason === "mic-error") && (
            <div className="mt-2 space-y-2">
              <p className="text-ink-secondary">
                {v.failReason === "mic-denied"
                  ? "Browser mic permission was denied. Calls can't connect without it."
                  : "No microphone detected. Plug one in or check your audio device."}
              </p>
              <button
                onClick={async () => {
                  await v.requestMicPermission();
                  setOpen(false);
                }}
                className="w-full rounded-md bg-gradient-brand px-3 py-1.5 text-[11px] font-semibold shadow-glow"
              >
                Request mic permission
              </button>
              <div className="text-[10px] text-ink-tertiary">
                If the prompt doesn&apos;t appear, click the lock/info icon in your address bar and allow microphone for this site.
              </div>
            </div>
          )}

          {v.failReason === "token-fetch-failed" && (
            <div className="mt-2 space-y-1 text-ink-secondary">
              <p>Couldn&apos;t fetch a voice token. Probably an auth/network issue.</p>
              <p className="text-[10px] text-ink-tertiary">
                Sign out + back in, then reload. If it persists, check /admin/system-health.
              </p>
            </div>
          )}

          {v.failReason === "sdk-load-failed" && (
            <div className="mt-2 space-y-1 text-ink-secondary">
              <p>The Twilio Voice SDK failed to load. Probably a build issue.</p>
              <p className="text-[10px] text-ink-tertiary">
                Make sure <code className="rounded bg-bg-hover px-1">@twilio/voice-sdk</code> is installed (it is on the latest deploy).
              </p>
            </div>
          )}

          {v.failReason === "register-failed" && (
            <div className="mt-2 space-y-1 text-ink-secondary">
              <p>Twilio Device couldn&apos;t register. Probably a token / config issue.</p>
              <p className="text-[10px] text-ink-tertiary">
                Open browser console for the specific error. Verify your Twilio API key + TwiML App SID match.
              </p>
            </div>
          )}

          {inCall && (
            <div className="mt-2 space-y-1 text-ink-secondary">
              <p>Active call in progress. Open /tasks to manage.</p>
              <Link
                href="/tasks"
                onClick={() => setOpen(false)}
                className="block rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-center text-[11px] font-semibold hover:bg-bg-hover"
              >
                Go to Tasks →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
