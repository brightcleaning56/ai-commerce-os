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

export default function AdminPage() {
  const [killActive, setKillActive] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [operator, setOperator] = useState<{ name: string; company: string; email: string } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    try {
      setKillActive(localStorage.getItem("aicos:kill-switch") === "1");
    } catch {}
    fetch("/api/operator")
      .then((r) => r.json())
      .then((d) => { if (d?.name) setOperator(d); })
      .catch(() => {});
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
              Owner: <span className="font-medium text-ink-secondary">{operator?.name ?? "—"}</span> · <span className="font-mono">{operator?.email ?? "—"}</span> · Created Jan 18, 2024
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1.5 rounded-md bg-accent-green/15 px-2 py-1 text-accent-green">
              <CheckCircle2 className="h-3 w-3" /> SOC 2 Type II
            </span>
            <span className="flex items-center gap-1.5 rounded-md bg-accent-green/15 px-2 py-1 text-accent-green">
              <CheckCircle2 className="h-3 w-3" /> GDPR · CCPA
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Members" v="9" hint="2 pending invites" />
        <Stat label="Active agents" v="9" hint="of 9 enabled" />
        <Stat label="Tokens 30d" v="4.1M" hint="of 10M cap" />
        <Stat label="Spend 30d" v="$1,847" hint="across all agents" />
      </div>

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
