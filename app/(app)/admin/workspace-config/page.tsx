"use client";
import {
  AlertCircle,
  Check,
  Loader2,
  RefreshCw,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/**
 * /admin/workspace-config — operator-side view of the admin onboarding
 * answers that actually drive app behavior.
 *
 * Slice 10 wires three knobs from this config into existing code paths:
 *   aiTone        -> outreach drafting prompt (lib/agents/outreach.ts)
 *   approvalMode  -> cadence runner tags scheduled items
 *   dailySendCap  -> cadence cron defers when the daily cap is hit
 *
 * The other fields (compliance toggles, integrations preference, etc.)
 * are captured but not yet enforced in app code -- next slices wire
 * them as needed.
 *
 * Operator can edit each field inline without re-running onboarding.
 */

type AiTone = "warm-friendly" | "professional" | "formal" | "direct";
type AiAggressiveness = "conservative" | "balanced" | "aggressive";
type ApprovalMode = "all" | "first-touch" | "high-stakes" | "none";
type UnsubscribeMode = "auto" | "channel-only";

type Config = {
  configured: boolean;
  ownerEmail?: string;
  companyName?: string;
  aiTone: AiTone;
  aiAggressiveness: AiAggressiveness;
  languages: string[];
  approvalMode: ApprovalMode;
  dailySendCap: number;
  approvalNotify: boolean;
  unsubscribeMode: UnsubscribeMode;
  gdprMode: boolean;
  auditRetentionDays: number;
  integrations: string[];
  plan?: string;
  updatedAt?: string;
};

const TONE_DESC: Record<AiTone, string> = {
  "warm-friendly": "Warm + friendly. Conversational, first-name basis, light emoji ok.",
  professional: "Polished but not stiff. Business casual.",
  formal: "Formal. Old-school enterprise. No first-name unless reciprocated.",
  direct: "Direct + concise. Two sentences max. No hedging.",
};

const AGGR_DESC: Record<AiAggressiveness, string> = {
  conservative: "Send only when match score is high. Fewer but higher-quality touches.",
  balanced: "Default. Match score above mid-range.",
  aggressive: "Cast a wide net. More volume, more rejections.",
};

const APPROVAL_DESC: Record<ApprovalMode, string> = {
  all: "Every email/SMS sits in /approvals until you click send. Safest.",
  "first-touch": "First message per buyer needs signoff; follow-ups auto-send. Default.",
  "high-stakes": "Auto-send touches where buyer revenue tier is small. Big buyers always need human.",
  none: "Auto-send everything. Fastest but most risk.",
};

export default function WorkspaceConfigPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/workspace-config", {
        cache: "no-store",
        credentials: "include",
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Load failed (${r.status})`);
      }
      const d = await r.json();
      setConfig(d.config ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(p: Partial<Config>) {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/workspace-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(p),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Save failed (${r.status})`);
      setConfig(d.config ?? null);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !config) {
    return (
      <div className="flex h-64 items-center justify-center text-ink-tertiary">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading workspace config…
      </div>
    );
  }

  if (!config) {
    return (
      <div className="rounded-xl border border-bg-border bg-bg-card p-8 text-center">
        <div className="text-sm font-semibold">Couldn't load config</div>
        {error && <p className="mt-1 text-[12px] text-accent-red">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workspace config</h1>
          <p className="text-[12px] text-ink-tertiary">
            Settings the admin chose during onboarding that now drive app behavior.
            Edit inline -- changes take effect within ~60s of save (cache TTL).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-card px-2.5 py-1.5 text-[12px] text-ink-secondary hover:bg-bg-hover disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Reload
        </button>
      </div>

      {/* Configured banner */}
      {!config.configured && (
        <div className="flex items-start gap-2 rounded-md border border-accent-amber/30 bg-accent-amber/5 px-3 py-2 text-[12px] text-accent-amber">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            Workspace not yet onboarded -- showing defaults. Run{" "}
            <a href="/onboarding/admin" className="underline">
              /onboarding/admin
            </a>{" "}
            to set these properly, or edit here directly.
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          {error}
        </div>
      )}

      {savedToast && (
        <div className="rounded-md border border-accent-green/30 bg-accent-green/5 px-3 py-2 text-[12px] text-accent-green">
          <Check className="mr-1 inline h-3.5 w-3.5" /> Saved
        </div>
      )}

      {/* Header summary */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <SummaryTile label="Owner email" value={config.ownerEmail ?? "—"} mono />
        <SummaryTile label="Company" value={config.companyName ?? "—"} />
        <SummaryTile label="Plan" value={config.plan ?? "—"} />
        <SummaryTile label="Updated" value={config.updatedAt ? new Date(config.updatedAt).toLocaleString() : "—"} />
      </div>

      {/* AI defaults */}
      <Section
        icon={Sparkles}
        title="AI defaults"
        blurb="Drives outreach drafting tone + aggressiveness. Live wired into lib/agents/outreach.ts."
      >
        <RadioGroup
          label="AI tone"
          value={config.aiTone}
          onChange={(v) => void patch({ aiTone: v as AiTone })}
          options={(["warm-friendly", "professional", "formal", "direct"] as AiTone[]).map((v) => ({
            value: v,
            label: v.replace("-", " "),
            description: TONE_DESC[v],
          }))}
          disabled={saving}
        />
        <RadioGroup
          label="Outreach aggressiveness"
          value={config.aiAggressiveness}
          onChange={(v) => void patch({ aiAggressiveness: v as AiAggressiveness })}
          options={(["conservative", "balanced", "aggressive"] as AiAggressiveness[]).map((v) => ({
            value: v,
            label: v,
            description: AGGR_DESC[v],
          }))}
          disabled={saving}
        />
      </Section>

      {/* Outreach approval */}
      <Section
        icon={SettingsIcon}
        title="Outreach approval policy"
        blurb="Controls what AI-drafted touches need a human signoff. Live wired into the cadence runner."
      >
        <RadioGroup
          label="Approval mode"
          value={config.approvalMode}
          onChange={(v) => void patch({ approvalMode: v as ApprovalMode })}
          options={(["all", "first-touch", "high-stakes", "none"] as ApprovalMode[]).map((v) => ({
            value: v,
            label: v.replace("-", " "),
            description: APPROVAL_DESC[v],
          }))}
          disabled={saving}
        />
        <NumberInput
          label="Daily send cap (per channel)"
          helper="0 = no cap. When hit, cadence cron defers next step by 1 hour."
          value={config.dailySendCap}
          min={0}
          max={5000}
          onCommit={(v) => void patch({ dailySendCap: v })}
          disabled={saving}
        />
        <Toggle
          label="Email me when items hit the approval queue"
          value={config.approvalNotify}
          onChange={(v) => void patch({ approvalNotify: v })}
          disabled={saving}
        />
      </Section>

      {/* Compliance */}
      <Section
        icon={SettingsIcon}
        title="Compliance"
        blurb="CAN-SPAM, RFC 8058 unsubscribe, and bounce auto-suppression baselines. Captured at admin onboarding -- enforced on the email path."
      >
        <RadioGroup
          label="Unsubscribe handling"
          value={config.unsubscribeMode}
          onChange={(v) => void patch({ unsubscribeMode: v as UnsubscribeMode })}
          options={[
            { value: "auto", label: "auto", description: "One unsubscribe = no future email/SMS, ever. Default." },
            { value: "channel-only", label: "channel only", description: "If they unsubscribe email, you can still SMS." },
          ]}
          disabled={saving}
        />
        <Toggle
          label="Apply EU GDPR rules to all buyers (not just EU)"
          value={config.gdprMode}
          onChange={(v) => void patch({ gdprMode: v })}
          disabled={saving}
        />
        <NumberInput
          label="Audit log retention (days)"
          helper="Default 365. Some industries (finance, healthcare) need 7+ years."
          value={config.auditRetentionDays}
          min={30}
          max={3650}
          onCommit={(v) => void patch({ auditRetentionDays: v })}
          disabled={saving}
        />
      </Section>

      {/* Read-only view of departments + integrations */}
      <Section icon={SettingsIcon} title="Captured during onboarding" blurb="Read-only here. Edit by re-running the admin flow.">
        <ReadRow label="Departments" value={config.languages.length ? "" : ""} />
        <div className="text-[12px] text-ink-secondary">
          <div>
            <span className="text-ink-tertiary">Departments:</span>{" "}
            {(config as unknown as { departments?: string[] }).departments?.join(", ") || "—"}
          </div>
          <div className="mt-1">
            <span className="text-ink-tertiary">Languages:</span> {config.languages.join(", ") || "—"}
          </div>
          <div className="mt-1">
            <span className="text-ink-tertiary">Integrations selected on day-1:</span>{" "}
            {config.integrations.length ? config.integrations.join(", ") : "—"}
          </div>
        </div>
      </Section>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────

function SummaryTile({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className={`mt-0.5 truncate text-[12px] ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  blurb,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5">
      <div className="mb-3 flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-secondary" />
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-[11px] text-ink-tertiary">{blurb}</p>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function RadioGroup({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; description?: string }>;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
        {label}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(o.value)}
              className={`rounded-md border px-3 py-2 text-left text-[12px] transition-colors disabled:opacity-50 ${
                selected
                  ? "border-accent-blue bg-accent-blue/10 text-accent-blue"
                  : "border-bg-border bg-bg-app hover:bg-bg-hover"
              }`}
            >
              <div className="font-medium capitalize">{o.label}</div>
              {o.description && (
                <div className="mt-0.5 text-[11px] text-ink-tertiary">{o.description}</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NumberInput({
  label,
  helper,
  value,
  min,
  max,
  onCommit,
  disabled,
}: {
  label: string;
  helper?: string;
  value: number;
  min?: number;
  max?: number;
  onCommit: (v: number) => void;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => {
    setLocal(String(value));
  }, [value]);
  return (
    <div>
      <div className="mb-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">{label}</div>
        {helper && <div className="mt-0.5 text-[11px] text-ink-tertiary">{helper}</div>}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={local}
          min={min}
          max={max}
          onChange={(e) => setLocal(e.target.value)}
          disabled={disabled}
          className="h-9 w-32 rounded-md border border-bg-border bg-bg-app px-3 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-accent-blue/50"
        />
        <button
          type="button"
          disabled={disabled || Number.parseFloat(local) === value}
          onClick={() => {
            const n = Number.parseFloat(local);
            if (Number.isFinite(n)) onCommit(n);
          }}
          className="rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-[11px] hover:bg-bg-hover disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-bg-border bg-bg-app px-3 py-2.5">
      <div className="text-[12px]">{label}</div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${value ? "bg-accent-blue" : "bg-bg-border"}`}
        aria-pressed={value}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white transition-transform ${value ? "translate-x-5" : "translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="text-[12px]">
      <span className="text-ink-tertiary">{label}:</span> {value}
    </div>
  );
}
