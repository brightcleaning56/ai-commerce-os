"use client";
import {
  AlertOctagon,
  Building2,
  CheckCircle2,
  CreditCard,
  Database,
  FileText,
  KeyRound,
  Palette,
  Play,
  Power,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

const ADMIN_LINKS = [
  { href: "/admin/users", title: "Users & Roles", desc: "Members, invites, and permission tiers", Icon: Users },
  { href: "/admin/billing", title: "Billing & Plans", desc: "Subscription, usage, and invoices", Icon: CreditCard },
  { href: "/admin/api-keys", title: "API & Developer", desc: "Keys, endpoints, webhooks, rate limits", Icon: KeyRound },
  { href: "/admin/branding", title: "White-label", desc: "Brand, custom domain, agency tiers", Icon: Palette },
  { href: "/admin/logs", title: "System Logs", desc: "Live agent + worker stream", Icon: Database },
  { href: "/admin/audit", title: "Audit Logs", desc: "Tamper-evident hash chain · 7y retention", Icon: ShieldAlert },
];

type Health = {
  ok: boolean;
  storage: { name: string; ok: boolean; detail?: string };
  spend: { today: { cost: number; calls: number }; budget: number | null };
  config: {
    anthropic: boolean;
    cronEnabled: boolean;
    cronSecretEnabled?: boolean;
    adminTokenEnabled?: boolean;
    emailLive: boolean;
    emailProvider: string;
    smsLive: boolean;
    smsConfigured?: boolean;
    sentryConfigured: boolean;
    storeBackend: string;
    stripeConfigured?: boolean;
    stripeLive?: boolean;
    bookingUrl?: boolean;
    operatorEmail?: boolean;
  };
  counts: {
    drafts: number;
    agentRuns: number;
    quotes: number;
    pipelineRuns: number;
    riskFlags: number;
    cronRuns: number;
    leads?: number;
  };
  aiHealth?: {
    status: "ok" | "degraded" | "down" | "idle";
    runs24h: number;
    errors24h: number;
    fallbacks24h: number;
    auth401Count: number;
    lastErrorAt: string | null;
    lastErrorAgent: string | null;
    lastErrorMessage: string | null;
    suggestedAction: string | null;
  };
  autoPromote?: {
    leads28d: number;
    promoted28d: number;
    auto28d: number;
    operator28d: number;
    autoPct: number;
    threshold: number | null;
    enabled: boolean;
  };
};

export default function AdminPage() {
  const [killActive, setKillActive] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [operator, setOperator] = useState<{ name: string; company: string; email: string } | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    try {
      setKillActive(localStorage.getItem("aicos:kill-switch") === "1");
    } catch {}
    fetch("/api/operator")
      .then((r) => r.json())
      .then((d) => { if (d?.name) setOperator(d); })
      .catch(() => {});
    function loadHealth() {
      fetch("/api/admin/health", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) setHealth(d); })
        .catch(() => {});
    }
    loadHealth();
    const id = setInterval(loadHealth, 30000);
    return () => clearInterval(id);
  }, []);

  function handleConfirmKill() {
    const next = !killActive;
    setKillActive(next);
    try {
      localStorage.setItem("aicos:kill-switch", next ? "1" : "0");
    } catch {}
    setConfirmOpen(false);
    toast(
      next
        ? "Kill-switch ACTIVE — all agents paused workspace-wide"
        : "Kill-switch deactivated — agents resuming",
      next ? "error" : "success"
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Super Admin</h1>
            <p className="text-xs text-ink-secondary">Org-wide controls for AVYN Commerce</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-bg-border bg-bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-brand-300" />
              <span className="font-semibold">{operator?.company ?? "AVYN Commerce"}</span>
              <span className="rounded-md bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold text-brand-200">
                Workspace
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-ink-tertiary">
              Owner: <span className="font-medium text-ink-secondary">{operator?.name ?? "—"}</span> · <span className="font-mono">{operator?.email ?? "—"}</span>
              {health && (
                <> · Storage: <span className="font-mono">{health.config.storeBackend}</span></>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 ${
                health?.ok
                  ? "bg-accent-green/15 text-accent-green"
                  : health
                  ? "bg-accent-red/15 text-accent-red"
                  : "bg-bg-hover text-ink-tertiary"
              }`}
            >
              <CheckCircle2 className="h-3 w-3" />
              {health ? (health.ok ? "Storage healthy" : "Storage degraded") : "Checking…"}
            </span>
            <span className="flex items-center gap-1.5 rounded-md bg-accent-green/15 px-2 py-1 text-accent-green">
              <CheckCircle2 className="h-3 w-3" /> Hash chain verified
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Pipeline runs"
          v={health ? String(health.counts.pipelineRuns) : "—"}
          hint={health ? `${health.counts.agentRuns} agent runs total` : "Loading…"}
        />
        <Stat
          label="Drafts in store"
          v={health ? String(health.counts.drafts) : "—"}
          hint={health ? `${health.counts.quotes} quotes generated` : "Loading…"}
        />
        <Stat
          label="Spend today"
          v={health ? `$${health.spend.today.cost.toFixed(2)}` : "—"}
          hint={health
            ? health.spend.budget != null
              ? `of $${health.spend.budget.toFixed(0)} cap · ${health.spend.today.calls} calls`
              : "no cap set"
            : "Loading…"}
        />
        <Stat
          label="Risk flags"
          v={health ? String(health.counts.riskFlags) : "—"}
          hint={health ? `${health.counts.cronRuns} cron runs total` : "Loading…"}
        />
      </div>

      {/* Setup status — checklist of what's wired vs missing */}
      {health && <SetupStatus health={health} />}

      {/* AI health — surfaces when agents are silently falling back */}
      {health?.aiHealth && health.aiHealth.status !== "ok" && (
        <div
          className={`rounded-xl border p-4 ${
            health.aiHealth.status === "down"
              ? "border-accent-red/40 bg-accent-red/5"
              : health.aiHealth.status === "degraded"
                ? "border-accent-amber/40 bg-accent-amber/5"
                : "border-bg-border bg-bg-card"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                health.aiHealth.status === "down"
                  ? "bg-accent-red/15"
                  : "bg-accent-amber/15"
              }`}
            >
              <AlertOctagon
                className={`h-4 w-4 ${
                  health.aiHealth.status === "down"
                    ? "text-accent-red"
                    : "text-accent-amber"
                }`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span
                  className={
                    health.aiHealth.status === "down"
                      ? "text-accent-red"
                      : "text-accent-amber"
                  }
                >
                  AI {health.aiHealth.status === "down" ? "DOWN" : health.aiHealth.status === "idle" ? "idle" : "degraded"}
                </span>
                <span className="text-ink-tertiary text-xs font-normal">
                  · last 24h: {health.aiHealth.runs24h} runs · {health.aiHealth.errors24h} errors · {health.aiHealth.fallbacks24h} fallbacks
                  {health.aiHealth.auth401Count > 0 && (
                    <> · <span className="font-semibold text-accent-red">{health.aiHealth.auth401Count} auth 401s</span></>
                  )}
                </span>
              </div>
              {health.aiHealth.suggestedAction && (
                <p className="mt-1 text-xs text-ink-secondary">
                  → {health.aiHealth.suggestedAction}
                </p>
              )}
              {health.aiHealth.lastErrorAgent && health.aiHealth.lastErrorMessage && (
                <p className="mt-1 text-[11px] text-ink-tertiary">
                  Last error · <span className="font-medium text-ink-secondary">{health.aiHealth.lastErrorAgent}</span> ·{" "}
                  <span className="font-mono">{health.aiHealth.lastErrorMessage.slice(0, 120)}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Auto-promote summary — visibility on whether the rule is firing */}
      {health?.autoPromote && (health.autoPromote.leads28d > 0 || !health.autoPromote.enabled) && (
        <div className="rounded-xl border border-bg-border bg-bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold">
              Auto-promote (28d)
              {!health.autoPromote.enabled ? (
                <span className="ml-2 rounded bg-bg-hover px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-tertiary">
                  Disabled
                </span>
              ) : (
                <span
                  className="ml-2 rounded bg-accent-green/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-accent-green"
                  title={`Threshold ≥ ${health.autoPromote.threshold} (env: AUTO_PROMOTE_LEAD_SCORE)`}
                >
                  ≥ {health.autoPromote.threshold}
                </span>
              )}
            </div>
            <a
              href="/leads"
              className="text-[11px] text-ink-tertiary hover:text-ink-primary hover:underline"
            >
              Open inbox →
            </a>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Leads</div>
              <div className="text-lg font-bold">{health.autoPromote.leads28d}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Promoted</div>
              <div className="text-lg font-bold">{health.autoPromote.promoted28d}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">By AI</div>
              <div className="text-lg font-bold text-accent-green">{health.autoPromote.auto28d}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">By operator</div>
              <div className="text-lg font-bold">{health.autoPromote.operator28d}</div>
            </div>
          </div>
          {health.autoPromote.promoted28d > 0 && (
            <p className="mt-2 text-[11px] text-ink-tertiary">
              {health.autoPromote.autoPct}% of promoted leads were auto-handled — operator only intervened on{" "}
              {100 - health.autoPromote.autoPct}%.
            </p>
          )}
          {!health.autoPromote.enabled && (
            <p className="mt-2 text-[11px] text-ink-tertiary">
              Set <code className="rounded bg-bg-hover px-1">AUTO_PROMOTE_LEAD_SCORE</code> below 999 in Netlify env to enable.
            </p>
          )}
        </div>
      )}

      {/* Live config status */}
      {health && (
        <div className="rounded-xl border border-bg-border bg-bg-card">
          <div className="flex items-center justify-between border-b border-bg-border px-5 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-brand-300" /> Platform configuration
            </div>
            <span className="text-[11px] text-ink-tertiary">refreshes every 30s</span>
          </div>
          <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <ConfigRow label="Anthropic API" enabled={health.config.anthropic} hint={health.config.anthropic ? "Live agents firing" : "Falls back to deterministic stubs"} />
            <ConfigRow
              label="Email"
              enabled={health.config.emailLive}
              hint={
                health.config.emailLive
                  ? `Live · via ${health.config.emailProvider}`
                  : `Simulated · ${health.config.emailProvider} configured`
              }
            />
            <ConfigRow label="SMS (Twilio)" enabled={health.config.smsLive} hint={health.config.smsLive ? "Live" : "Simulated / not configured"} />
            <ConfigRow label="Cron" enabled={health.config.cronEnabled} hint={health.config.cronEnabled ? "Pipeline + auto-release running" : "Disabled via CRON_ENABLED=false"} />
            <ConfigRow label="Sentry" enabled={health.config.sentryConfigured} hint={health.config.sentryConfigured ? "Errors auto-captured" : "Not configured"} />
            <ConfigRow label="Storage" enabled={health.storage.ok} hint={`${health.storage.name}${health.storage.detail ? ` · ${health.storage.detail}` : ""}`} />
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-base font-semibold">Admin areas</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ADMIN_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group rounded-xl border border-bg-border bg-bg-card p-5 transition hover:border-brand-500/40 hover:shadow-glow"
            >
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/15">
                  <l.Icon className="h-5 w-5 text-brand-300" />
                </div>
                <div>
                  <div className="font-semibold">{l.title}</div>
                  <div className="text-[11px] text-ink-tertiary">{l.desc}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold">Org policies</h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <PolicyCard
            title="Approval policies"
            Icon={FileText}
            items={[
              { l: "Outreach over 500 sends", v: "Requires approval" },
              { l: "Quotes over $25K", v: "Requires approval" },
              { l: "New supplier onboarding", v: "Auto-approved if verified" },
              { l: "Refunds + escrow disputes", v: "Requires approval" },
            ]}
          />
          <PolicyCard
            title="Spend caps"
            Icon={CreditCard}
            items={[
              { l: "Per-agent monthly", v: "$500" },
              { l: "Per-model monthly", v: "$2,000 Sonnet · $300 Haiku" },
              { l: "Outreach send rate", v: "5K/day per domain" },
              { l: "Token alert threshold", v: "85% of cap" },
            ]}
          />
          <PolicyCard
            title="Data retention"
            Icon={Database}
            items={[
              { l: "System logs", v: "30d (Growth) · 1y (Enterprise)" },
              { l: "Audit logs", v: "7 years" },
              { l: "Buyer enrichment cache", v: "180 days" },
              { l: "Outreach replies", v: "Forever (with consent)" },
            ]}
          />
          <PolicyCard
            title="Security"
            Icon={ShieldAlert}
            items={[
              { l: "SSO (Okta SAML)", v: "Enabled" },
              { l: "SCIM provisioning", v: "Enabled" },
              { l: "IP allowlist", v: "3 ranges" },
              { l: "Require 2FA for Admins", v: "Enforced" },
            ]}
          />
        </div>
      </div>

      <div
        className={`rounded-xl border p-5 ${
          killActive
            ? "border-accent-red/60 bg-accent-red/10 shadow-2xl shadow-accent-red/20"
            : "border-accent-red/30 bg-accent-red/5"
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent-red/15">
            <AlertOctagon className="h-5 w-5 text-accent-red" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-accent-red">Global agent kill-switch</div>
              {killActive && (
                <span className="rounded-md bg-accent-red px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  ACTIVE
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-secondary">
              {killActive
                ? "All agents are paused workspace-wide. Trend Hunter, Buyer Discovery, Outreach, and the Pipeline are blocked until this is deactivated."
                : "Pauses every agent across the workspace. Use for incidents (data leak, runaway prompt loop, false-positive risk alerts). Resumes from this same control."}
            </p>
            <button
              onClick={() => setConfirmOpen(true)}
              className={`mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold ${
                killActive
                  ? "bg-accent-green/15 text-accent-green hover:bg-accent-green/25 border border-accent-green/30"
                  : "border border-accent-red/30 bg-accent-red/10 text-accent-red hover:bg-accent-red/15"
              }`}
            >
              {killActive ? (
                <><Play className="h-4 w-4" /> Deactivate kill-switch</>
              ) : (
                <><Power className="h-4 w-4" /> Activate kill-switch</>
              )}
            </button>
          </div>
        </div>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-xl border border-accent-red/40 bg-bg-panel shadow-2xl shadow-accent-red/20"
          >
            <div className="flex items-center justify-between border-b border-bg-border px-5 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <AlertOctagon className="h-4 w-4 text-accent-red" />
                {killActive ? "Deactivate kill-switch?" : "Activate kill-switch?"}
              </div>
              <button
                onClick={() => setConfirmOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4 text-xs text-ink-secondary">
              {killActive ? (
                <p>
                  Resuming all agents. Pending pipeline runs and queued outreach will execute on
                  their normal schedule.
                </p>
              ) : (
                <>
                  <p>
                    This will <strong className="text-accent-red">immediately pause every agent</strong> across the
                    workspace — Trend Hunter, Buyer Discovery, Outreach, and the auto-pipeline.
                  </p>
                  <p>In-flight tasks will complete; no new tasks will be queued.</p>
                </>
              )}
              <div className="rounded-md bg-bg-hover/40 px-3 py-2 text-[11px]">
                Action recorded in Audit Log · Org-wide
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-bg-border px-5 py-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmKill}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  killActive
                    ? "bg-accent-green/20 text-accent-green hover:bg-accent-green/30"
                    : "bg-accent-red/20 text-accent-red hover:bg-accent-red/30"
                }`}
              >
                {killActive ? "Yes, deactivate" : "Yes, activate kill-switch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, v, hint }: { label: string; v: string; hint: string }) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className="mt-1 text-2xl font-bold">{v}</div>
      <div className="text-[11px] text-ink-tertiary">{hint}</div>
    </div>
  );
}

function PolicyCard({
  title,
  Icon,
  items,
}: {
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  items: { l: string; v: string }[];
}) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card">
      <div className="flex items-center gap-2 border-b border-bg-border px-5 py-3 text-sm font-semibold">
        <Icon className="h-4 w-4 text-brand-300" />
        {title}
      </div>
      <ul className="divide-y divide-bg-border">
        {items.map((i) => (
          <li key={i.l} className="flex items-center justify-between px-5 py-2.5 text-xs">
            <span className="text-ink-secondary">{i.l}</span>
            <span className="font-medium">{i.v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConfigRow({ label, enabled, hint }: { label: string; enabled: boolean; hint: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-bg-border bg-bg-hover/30 px-3 py-2">
      <div
        className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
          enabled ? "bg-accent-green shadow-[0_0_8px_#22c55e]" : "bg-ink-tertiary"
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold">{label}</div>
        <div className="truncate text-[11px] text-ink-tertiary">{hint}</div>
      </div>
    </div>
  );
}

/**
 * Setup status panel — checklist of required + optional integrations with
 * action links. Surfaces what's live, what's degraded (e.g. configured but
 * test-mode), and what's missing entirely. The goal is one glance to know
 * "what's left to make this fully production-grade".
 */
type SetupItem = {
  label: string;
  status: "ok" | "pending" | "missing";
  detail: string;
  action?: { label: string; href: string };
  required: boolean;
};

function SetupStatus({ health }: { health: Health }) {
  const c = health.config;
  const items: SetupItem[] = [
    {
      label: "Persistent storage",
      status: c.storeBackend === "blobs" || c.storeBackend === "kv" ? "ok" : "pending",
      detail:
        c.storeBackend === "blobs"
          ? "Netlify Blobs — survives deploys"
          : c.storeBackend === "kv"
            ? "KV — survives deploys"
            : "File backend — data resets on every deploy",
      action: c.storeBackend === "file"
        ? { label: "Switch to Blobs", href: "https://app.netlify.com/projects/ai-commerce-os/configuration/env" }
        : undefined,
      required: true,
    },
    {
      label: "Admin auth (ADMIN_TOKEN)",
      status: c.adminTokenEnabled ? "ok" : "missing",
      detail: c.adminTokenEnabled ? "Token-gated admin + APIs" : "ALL admin routes are open — set ADMIN_TOKEN immediately",
      required: true,
    },
    {
      label: "Anthropic API",
      status: c.anthropic ? "ok" : "missing",
      detail: c.anthropic ? "Live agents firing" : "Falls back to deterministic stubs without ANTHROPIC_API_KEY",
      action: c.anthropic ? undefined : { label: "Get key", href: "https://platform.claude.com/settings/keys" },
      required: true,
    },
    {
      label: "Email delivery",
      status: c.emailLive ? "ok" : c.emailProvider !== "simulated" ? "pending" : "missing",
      detail: c.emailLive
        ? `Live via ${c.emailProvider}`
        : c.emailProvider !== "simulated"
          ? `${c.emailProvider} configured but EMAIL_LIVE=false — flip to true to actually send`
          : "Simulated only — set POSTMARK_TOKEN or RESEND_TOKEN + EMAIL_LIVE=true",
      action: c.emailProvider === "simulated"
        ? { label: "Set up Postmark", href: "https://account.postmarkapp.com/sign_up" }
        : undefined,
      required: true,
    },
    {
      label: "Operator notifications (OPERATOR_EMAIL)",
      status: c.operatorEmail ? "ok" : "missing",
      detail: c.operatorEmail ? "Lead alerts + daily digest sent here" : "No email set — you won't get lead alerts",
      required: true,
    },
    {
      label: "Stripe Connect",
      status: c.stripeLive ? "ok" : c.stripeConfigured ? "pending" : "missing",
      detail: c.stripeLive
        ? "Live mode — destination charges enabled"
        : c.stripeConfigured
          ? "Sandbox/test mode — set STRIPE_SECRET_KEY to sk_live_... + STRIPE_LIVE=true to enable real money"
          : "Not configured — buyers can't actually pay",
      action: c.stripeConfigured ? undefined : { label: "Get Stripe keys", href: "https://dashboard.stripe.com/test/apikeys" },
      required: false,
    },
    {
      label: "SMS (Twilio)",
      status: c.smsLive ? "ok" : c.smsConfigured ? "pending" : "missing",
      detail: c.smsLive
        ? "Live — leads with phone get an SMS too"
        : c.smsConfigured
          ? "Twilio configured but SMS_LIVE!=true — flip to enable"
          : "Not configured — SMS path skips cleanly",
      action: c.smsConfigured ? undefined : { label: "Get Twilio creds", href: "https://www.twilio.com/console" },
      required: false,
    },
    {
      label: "Cron secret",
      status: c.cronSecretEnabled ? "ok" : "pending",
      detail: c.cronSecretEnabled
        ? "Cron endpoints gated by Bearer token"
        : "Cron endpoints publicly hittable — set CRON_SECRET to lock down",
      required: false,
    },
    {
      label: "Booking link",
      status: c.bookingUrl ? "ok" : "missing",
      detail: c.bookingUrl
        ? "AI replies include your Calendly/Cal.com link"
        : "AI asks leads for two times instead of linking — add BOOKING_URL to insert a real link",
      required: false,
    },
    {
      label: "Error tracking (Sentry)",
      status: c.sentryConfigured ? "ok" : "missing",
      detail: c.sentryConfigured ? "Errors auto-captured" : "Production errors only logged to Netlify — add SENTRY_DSN for alerts",
      required: false,
    },
  ];

  const required = items.filter((i) => i.required);
  const optional = items.filter((i) => !i.required);
  const requiredOk = required.filter((i) => i.status === "ok").length;
  const optionalOk = optional.filter((i) => i.status === "ok").length;
  const allRequired = requiredOk === required.length;
  const pct = Math.round((requiredOk / required.length) * 100);

  return (
    <div
      className={`rounded-xl border p-5 ${
        allRequired
          ? "border-accent-green/30 bg-gradient-to-br from-accent-green/5 to-transparent"
          : "border-accent-amber/30 bg-gradient-to-br from-accent-amber/5 to-transparent"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`grid h-10 w-10 place-items-center rounded-lg ${
              allRequired ? "bg-accent-green/15" : "bg-accent-amber/15"
            }`}
          >
            <ShieldCheck className={`h-5 w-5 ${allRequired ? "text-accent-green" : "text-accent-amber"}`} />
          </div>
          <div>
            <div className="text-sm font-semibold">
              Setup: {requiredOk}/{required.length} required wired{" "}
              <span className="text-ink-tertiary font-normal">· {optionalOk}/{optional.length} optional</span>
            </div>
            <div className="text-[11px] text-ink-tertiary">
              {allRequired
                ? "All required systems live. Optional integrations below add features but aren't blockers."
                : "Finish the required items below to make the platform fully production-grade."}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold ${allRequired ? "text-accent-green" : "text-accent-amber"}`}>{pct}%</div>
          <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">required ready</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
        {items.map((item) => {
          const tone =
            item.status === "ok"
              ? "border-accent-green/20 bg-accent-green/5"
              : item.status === "pending"
                ? "border-accent-amber/20 bg-accent-amber/5"
                : item.required
                  ? "border-accent-red/20 bg-accent-red/5"
                  : "border-bg-border bg-bg-hover/20";
          const dot =
            item.status === "ok"
              ? "bg-accent-green"
              : item.status === "pending"
                ? "bg-accent-amber"
                : item.required
                  ? "bg-accent-red"
                  : "bg-ink-tertiary";
          return (
            <div key={item.label} className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${tone}`}>
              <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{item.label}</span>
                  {!item.required && (
                    <span className="text-[9px] uppercase tracking-wider text-ink-tertiary">optional</span>
                  )}
                </div>
                <div className="text-[11px] text-ink-tertiary">{item.detail}</div>
                {item.action && (
                  <a
                    href={item.action.href}
                    target={item.action.href.startsWith("http") ? "_blank" : undefined}
                    rel={item.action.href.startsWith("http") ? "noopener noreferrer" : undefined}
                    className="mt-1 inline-block text-[11px] font-semibold text-brand-300 hover:text-brand-200"
                  >
                    {item.action.label} →
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
