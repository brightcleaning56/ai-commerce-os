"use client";
import {
  CheckCircle2,
  Hash,
  Headphones,
  Info,
  Loader2,
  Megaphone,
  PhoneCall,
  PhoneForwarded,
  ScrollText,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Slice 111: OutboundCallModal.
 *
 * Richer AI-driven outbound call composer mirroring the avyn.vercel.app
 * "Start Outbound Call" modal. Collects:
 *
 *   - Phone number       (E.164 normalized client-side)
 *   - Campaign           (from a small catalog; operator can add more
 *                        via a future slice)
 *   - Script             (likewise)
 *   - Caller ID          (TWILIO_FROM_NUMBER + any phone numbers
 *                        the workspace owns, future slice)
 *   - Agent              ("sales" or "callback")
 *
 * Posts to /api/voice/outbound which returns a real or mock response.
 * The "mock mode" banner stays visible after a successful queue so
 * the operator knows whether the call actually dialed a phone or
 * just landed in the mock log.
 *
 * This component is render-only -- caller wires the open/close state.
 */

const CAMPAIGNS = [
  { id: "quote-followup", label: "Quote Follow-Up" },
  { id: "cold-outreach", label: "Cold Outreach" },
  { id: "buyer-onboarding", label: "Buyer Onboarding" },
  { id: "supplier-revival", label: "Supplier Revival" },
];

const SCRIPTS = [
  { id: "followup-v2.1", label: "Follow-Up Script v2.1" },
  { id: "intro-v1.0", label: "Intro Script v1.0" },
  { id: "revival-v1.3", label: "Revival Script v1.3" },
];

type OutboundResponse = {
  ok: boolean;
  mock: boolean;
  adapterReady?: boolean;
  callId: string;
  dialingTo: string;
  provider: "vapi" | "retell" | "twilio" | "mock";
  configHint?: string;
};

function normalizeE164(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits.length >= 7 ? `+${digits}` : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

function humanPhone(e164: string): string {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (m) return `(${m[1]}) ${m[2]}-${m[3]}`;
  return e164;
}

export default function OutboundCallModal({
  open,
  onClose,
  defaultPhone,
  callerIdOptions,
}: {
  open: boolean;
  onClose: () => void;
  /** Pre-fill the phone input -- e.g. when opened from a lead detail. */
  defaultPhone?: string;
  /** From-numbers the workspace owns. First entry is the default. */
  callerIdOptions?: Array<{ value: string; label: string }>;
}) {
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [campaign, setCampaign] = useState(CAMPAIGNS[0].id);
  const [script, setScript] = useState(SCRIPTS[0].id);
  const [callerId, setCallerId] = useState(callerIdOptions?.[0]?.value ?? "");
  const [agent, setAgent] = useState<"sales" | "callback">("sales");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OutboundResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset state when re-opening with a different defaultPhone
  useEffect(() => {
    if (open) {
      if (defaultPhone) setPhone(defaultPhone);
      setResult(null);
      setError(null);
    }
  }, [open, defaultPhone]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const num = normalizeE164(phone);
    if (!num) {
      setError("Enter a 10-digit US number or +E.164 international");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/voice/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to: num, campaign, script, callerId, agent }),
      });
      const d = (await r.json().catch(() => ({}))) as OutboundResponse & {
        error?: string;
      };
      if (!r.ok) throw new Error(d.error ?? `Failed (${r.status})`);
      setResult(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  const campaignLabel = CAMPAIGNS.find((c) => c.id === campaign)?.label ?? campaign;
  const scriptLabel = SCRIPTS.find((s) => s.id === script)?.label ?? script;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur"
      onClick={(e) => {
        // Close on backdrop click; don't close on modal-internal click
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-brand-500/40 bg-bg-panel p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <span className="text-brand-300">22.</span>
            Start Outbound Call
          </h2>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <Field icon={PhoneForwarded} label="Phone number">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(214) 555-8712"
              className="h-10 w-full rounded-md border border-bg-border bg-bg-card px-3 font-mono text-sm focus:border-brand-500 focus:outline-none"
              autoFocus
            />
          </Field>

          <Field icon={Megaphone} label="Campaign">
            <select
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              className="h-10 w-full rounded-md border border-bg-border bg-bg-card px-3 text-sm focus:border-brand-500 focus:outline-none"
            >
              {CAMPAIGNS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field icon={ScrollText} label="Script">
            <select
              value={script}
              onChange={(e) => setScript(e.target.value)}
              className="h-10 w-full rounded-md border border-bg-border bg-bg-card px-3 text-sm focus:border-brand-500 focus:outline-none"
            >
              {SCRIPTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>

          <Field icon={Hash} label="Caller ID">
            {callerIdOptions && callerIdOptions.length > 1 ? (
              <select
                value={callerId}
                onChange={(e) => setCallerId(e.target.value)}
                className="h-10 w-full rounded-md border border-bg-border bg-bg-card px-3 text-sm focus:border-brand-500 focus:outline-none"
              >
                {callerIdOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex h-10 items-center rounded-md border border-bg-border bg-bg-card px-3 text-sm text-ink-secondary">
                {callerIdOptions?.[0]?.label ?? "Default (from TWILIO_FROM_NUMBER)"}
              </div>
            )}
          </Field>

          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Use Agent
            </div>
            <div className="grid grid-cols-2 gap-2">
              <AgentToggle
                active={agent === "sales"}
                onClick={() => setAgent("sales")}
                label="Sales AI"
                Icon={Headphones}
              />
              <AgentToggle
                active={agent === "callback"}
                onClick={() => setAgent("callback")}
                label="Callback AI"
                Icon={PhoneCall}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-[11px] text-accent-red">
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-md border border-accent-amber/40 bg-accent-amber/10 p-3 text-[11px] text-accent-amber">
              <div className="flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {result.adapterReady
                  ? `Call queued via ${result.provider}`
                  : `Call queued via mock`}
              </div>
              <div className="mt-1 space-y-0.5 font-mono text-[10px]">
                <div>
                  <span className="opacity-60">call_id:</span> {result.callId}
                </div>
                <div>
                  <span className="opacity-60">dialing:</span>{" "}
                  {humanPhone(result.dialingTo)}
                </div>
              </div>
              {result.configHint && (
                <div className="mt-1.5 text-accent-amber/80">
                  <Info className="mr-1 inline h-3 w-3" />
                  {result.configHint}
                </div>
              )}
              <div className="mt-2 rounded-md border border-bg-border bg-bg-card p-2 text-[10px] text-ink-tertiary">
                <div className="font-semibold uppercase tracking-wider">
                  Assistant preview
                </div>
                <div className="mt-1 text-ink-secondary">
                  Hi, this is {agent === "sales" ? "the AVYN sales assistant" : "AVYN scheduling"}{" "}
                  calling about {campaignLabel.toLowerCase()}, using {scriptLabel}.
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-gradient-brand py-2.5 text-sm font-semibold shadow-glow disabled:opacity-60"
          >
            {busy ? (
              <span className="flex items-center justify-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Queueing…
              </span>
            ) : result ? (
              "Done"
            ) : (
              "Start call"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      {children}
    </div>
  );
}

function AgentToggle({
  active,
  onClick,
  label,
  Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition ${
        active
          ? "border-accent-amber bg-accent-amber/10 text-accent-amber"
          : "border-bg-border bg-bg-card text-ink-secondary hover:bg-bg-hover"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
