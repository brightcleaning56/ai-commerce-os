"use client";
import {
  ArrowUpRight,
  Check,
  CreditCard,
  Download,
  FileText,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { downloadCSV } from "@/lib/csv";
import {
  CURRENT_PLAN_ID,
  INVOICES,
  PLANS,
  USAGE,
  type Plan,
} from "@/lib/billing";

const STATUS_TONE: Record<string, string> = {
  Paid: "bg-accent-green/15 text-accent-green",
  Pending: "bg-accent-amber/15 text-accent-amber",
  Failed: "bg-accent-red/15 text-accent-red",
};

function formatCap(c: number | null | string) {
  if (c === null) return "Unlimited";
  if (typeof c === "string") return c;
  if (c >= 1_000_000) return `${(c / 1_000_000).toFixed(1)}M`;
  if (c >= 1000) return `${(c / 1000).toFixed(0)}K`;
  return c.toLocaleString();
}

function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function PlanCard({
  p,
  cycle,
  current,
  onSelect,
}: {
  p: Plan;
  cycle: "monthly" | "annual";
  current: boolean;
  onSelect: (p: Plan) => void;
}) {
  const price = cycle === "monthly" ? p.monthly : Math.round(p.annual / 12);
  return (
    <div
      className={`relative rounded-2xl border p-6 ${
        p.highlight
          ? "border-brand-500/60 bg-gradient-to-br from-brand-500/10 to-transparent shadow-glow"
          : "border-bg-border bg-bg-card"
      }`}
    >
      {p.badge && (
        <span
          className={`absolute -top-3 left-6 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
            p.highlight
              ? "bg-gradient-brand text-white"
              : "bg-bg-hover text-ink-secondary"
          }`}
        >
          {p.badge}
        </span>
      )}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-bold">{p.name}</div>
          <div className="text-[11px] text-ink-tertiary">{p.tagline}</div>
        </div>
        {current && (
          <span className="rounded-md bg-accent-green/15 px-2 py-0.5 text-[10px] font-semibold text-accent-green">
            Current
          </span>
        )}
      </div>

      <div className="mt-5">
        <span className="text-3xl font-bold">${price.toLocaleString()}</span>
        <span className="text-xs text-ink-tertiary">
          {p.id === "enterprise" ? "/mo · custom" : "/mo"}
          {cycle === "annual" && p.id !== "enterprise" && ", billed annually"}
        </span>
      </div>

      <div className="mt-1 text-[11px] text-ink-tertiary">
        Platform commission: <span className="text-brand-300">{(p.commissionRate * 100).toFixed(0)}%</span> per AI-closed deal
      </div>

      <button
        onClick={() => onSelect(p)}
        className={`mt-5 w-full rounded-lg py-2.5 text-sm font-semibold ${
          p.highlight
            ? "bg-gradient-brand shadow-glow"
            : current
            ? "border border-bg-border bg-bg-hover text-ink-secondary"
            : "border border-bg-border bg-bg-hover/40 hover:bg-bg-hover"
        }`}
        disabled={current}
      >
        {current ? "Active plan" : p.cta}
      </button>

      <div className="my-5 border-t border-bg-border" />

      <div className="space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
          Caps
        </div>
        <CapRow label="Products" value={formatCap(p.caps.products)} />
        <CapRow label="Buyers" value={formatCap(p.caps.buyers)} />
        <CapRow label="Suppliers" value={formatCap(p.caps.suppliers)} />
        <CapRow label="Outreach sends" value={formatCap(p.caps.outreachSends)} />
        <CapRow label="AI tokens" value={formatCap(p.caps.aiTokens)} />
        <CapRow label="Seats" value={formatCap(p.caps.seats)} />
        <CapRow label="API calls" value={formatCap(p.caps.apiCalls)} />
      </div>

      <div className="my-5 border-t border-bg-border" />

      <div className="space-y-1.5 text-xs">
        {p.features.map((f) => (
          <div key={f.label} className="flex items-center gap-2">
            {f.included ? (
              <Check className="h-3.5 w-3.5 text-accent-green" />
            ) : (
              <X className="h-3.5 w-3.5 text-ink-tertiary" />
            )}
            <span
              className={f.included ? "text-ink-secondary" : "text-ink-tertiary line-through"}
            >
              {f.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-ink-secondary">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default function BillingPage() {
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const currentPlan = PLANS.find((p) => p.id === CURRENT_PLAN_ID)!;
  const nextPlan = PLANS.find((p) => p.id === "enterprise")!;
  const { toast } = useToast();
  const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null);
  const [tokenBoosted, setTokenBoosted] = useState(false);

  function handlePlanSelect(p: Plan) {
    if (p.id === CURRENT_PLAN_ID) return;
    setConfirmPlan(p);
  }

  function confirmPlanChange() {
    if (!confirmPlan) return;
    const p = confirmPlan;
    setConfirmPlan(null);
    if (p.id === "enterprise") {
      toast(`Sales contact request sent for ${p.name} · we'll reach out within 1 business day`);
    } else {
      toast(`Switched to ${p.name} · prorated charge of $${p.monthly} on next invoice`);
    }
  }

  function handleUpdateCard() {
    toast("Update card flow opens Stripe billing portal · use the test card 4242 4242 4242 4242", "info");
  }

  function handleTopUp() {
    if (tokenBoosted) {
      toast("You already topped up this month — wait until next cycle", "info");
      return;
    }
    setTokenBoosted(true);
    toast(`Token boost applied · 5M Sonnet tokens added · $250 charged to •••• 4242`);
  }

  function handleDownloadInvoices() {
    const rows = INVOICES.map((i) => ({
      invoice: i.id,
      date: i.date,
      description: i.description,
      amount_usd: i.amount,
      status: i.status,
    }));
    downloadCSV(`invoices-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast(`Exported ${rows.length} invoices`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Billing &amp; Plans</h1>
            <p className="text-xs text-ink-secondary">
              On <span className="text-brand-300">{currentPlan.name}</span> · next invoice $
              {currentPlan.monthly} on Jun 1, 2024
            </p>
          </div>
        </div>
        <button
          onClick={handleDownloadInvoices}
          className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
        >
          <Download className="h-4 w-4" /> Download all invoices
        </button>
      </div>

      <div className="rounded-xl border border-bg-border bg-gradient-to-br from-brand-500/10 to-transparent p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-brand-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-200">
                Current Plan
              </span>
              <span className="text-base font-bold">{currentPlan.name}</span>
            </div>
            <div className="mt-1 text-xs text-ink-secondary">
              {currentPlan.tagline} · ${currentPlan.monthly}/mo · {(currentPlan.commissionRate * 100).toFixed(0)}% deal commission
            </div>
          </div>
          <button
            onClick={() => handlePlanSelect(nextPlan)}
            className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-semibold shadow-glow"
          >
            <ArrowUpRight className="h-4 w-4" /> Upgrade to {nextPlan.name}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {USAGE.map((u) => {
            const pct = u.cap ? Math.min(100, (u.used / u.cap) * 100) : 0;
            const isNear = pct >= 80;
            return (
              <div
                key={u.label}
                className="rounded-lg border border-bg-border bg-bg-card p-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-secondary">{u.label}</span>
                  <span className={`font-semibold ${isNear ? "text-accent-amber" : ""}`}>
                    {formatNum(u.used)} / {u.cap ? formatNum(u.cap) : "∞"}
                  </span>
                </div>
                {u.cap ? (
                  <>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-hover">
                      <div
                        className={`h-full ${isNear ? "bg-accent-amber" : "bg-gradient-brand"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-1 text-[10px] text-ink-tertiary">
                      {pct.toFixed(0)}% used{u.hint ? ` · ${u.hint}` : ""}
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-[10px] text-ink-tertiary">{u.hint}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">Choose a plan</h2>
            <p className="text-xs text-ink-tertiary">
              Save 17% on annual billing
            </p>
          </div>
          <div className="flex overflow-hidden rounded-lg border border-bg-border bg-bg-card text-xs">
            <button
              onClick={() => setCycle("monthly")}
              className={`px-3 py-1.5 ${
                cycle === "monthly" ? "bg-brand-500/20 text-brand-200" : "text-ink-secondary"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setCycle("annual")}
              className={`px-3 py-1.5 ${
                cycle === "annual" ? "bg-brand-500/20 text-brand-200" : "text-ink-secondary"
              }`}
            >
              Annual <span className="text-[10px] text-accent-green">−17%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {PLANS.map((p) => (
            <PlanCard
              key={p.id}
              p={p}
              cycle={cycle}
              current={p.id === CURRENT_PLAN_ID}
              onSelect={handlePlanSelect}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 overflow-hidden rounded-xl border border-bg-border bg-bg-card">
          <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4 text-brand-300" /> Invoices
            </div>
            <button className="text-xs text-brand-300 hover:text-brand-200">
              View all →
            </button>
          </div>
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">Invoice</th>
                <th className="px-3 py-2.5 text-left font-medium">Date</th>
                <th className="px-3 py-2.5 text-left font-medium">Description</th>
                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                <th className="px-5 py-2.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {INVOICES.map((inv) => (
                <tr key={inv.id} className="border-t border-bg-border">
                  <td className="px-5 py-3 font-medium">{inv.id}</td>
                  <td className="px-3 py-3 text-ink-secondary">{inv.date}</td>
                  <td className="px-3 py-3 text-ink-secondary">{inv.description}</td>
                  <td className="px-3 py-3 text-right font-semibold">
                    ${inv.amount.toLocaleString()}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[inv.status]}`}
                    >
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        <div className="rounded-xl border border-bg-border bg-bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CreditCard className="h-4 w-4 text-brand-300" /> Payment Method
          </div>
          <div className="mt-3 rounded-lg border border-bg-border bg-bg-hover/40 p-3">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-12 place-items-center rounded-md bg-gradient-brand text-[10px] font-bold">
                VISA
              </div>
              <div className="text-sm">
                <div className="font-medium">•••• 4242</div>
                <div className="text-[11px] text-ink-tertiary">Expires 09/27</div>
              </div>
            </div>
            <button
              onClick={handleUpdateCard}
              className="mt-3 w-full rounded-md border border-bg-border bg-bg-card py-1.5 text-xs hover:bg-bg-hover"
            >
              Update card
            </button>
          </div>

          <div className="mt-4 rounded-lg border border-brand-500/30 bg-brand-500/5 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-brand-200">
              <Sparkles className="h-3.5 w-3.5" /> Save with annual
            </div>
            <p className="mt-1 text-[11px] text-ink-secondary">
              Switch to annual billing and save $1,019 over 12 months on your current plan.
            </p>
            <button
              onClick={() => {
                setCycle("annual");
                toast("Switched preview to annual billing — save $1,019/yr");
              }}
              className="mt-2 w-full rounded-md bg-gradient-brand py-1.5 text-xs font-semibold shadow-glow"
            >
              Preview annual
            </button>
          </div>

          <div className="mt-3 rounded-lg border border-bg-border bg-bg-hover/40 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Zap className="h-3.5 w-3.5 text-accent-amber" /> Add token boost
            </div>
            <p className="mt-1 text-[11px] text-ink-tertiary">
              Need more AI? Top up 5M Sonnet tokens for $250.
            </p>
            <button
              onClick={handleTopUp}
              disabled={tokenBoosted}
              className="mt-2 w-full rounded-md border border-bg-border bg-bg-card py-1.5 text-xs hover:bg-bg-hover disabled:opacity-50"
            >
              {tokenBoosted ? "Topped up this cycle" : "Top up"}
            </button>
          </div>
        </div>
      </div>

      {confirmPlan && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setConfirmPlan(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-bg-border bg-bg-panel shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-bg-border px-5 py-4">
              <div className="text-sm font-semibold">
                {confirmPlan.id === "enterprise" ? "Talk to sales" : `Switch to ${confirmPlan.name}`}
              </div>
              <button
                onClick={() => setConfirmPlan(null)}
                className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4 text-xs">
              {confirmPlan.id === "enterprise" ? (
                <>
                  <p className="text-ink-secondary">
                    Enterprise pricing is custom. We&apos;ll reach out within 1 business day to discuss volume,
                    SLAs, and white-label options.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-secondary">From</span>
                    <span className="font-medium">{currentPlan.name} · ${currentPlan.monthly}/mo</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-secondary">To</span>
                    <span className="font-medium">{confirmPlan.name} · ${confirmPlan.monthly}/mo</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-secondary">Commission rate</span>
                    <span className="font-medium">{(confirmPlan.commissionRate * 100).toFixed(0)}% per AI-closed deal</span>
                  </div>
                  <p className="border-t border-bg-border pt-3 text-[11px] text-ink-tertiary">
                    Prorated charge applied on next invoice. Plan caps update immediately.
                  </p>
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-bg-border px-5 py-3">
              <button
                onClick={() => setConfirmPlan(null)}
                className="rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
              >
                Cancel
              </button>
              <button
                onClick={confirmPlanChange}
                className="rounded-lg bg-gradient-brand px-3 py-2 text-sm font-semibold shadow-glow"
              >
                {confirmPlan.id === "enterprise" ? "Send sales request" : "Confirm switch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
