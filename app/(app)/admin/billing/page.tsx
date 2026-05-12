"use client";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CreditCard,
  ExternalLink,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { PLANS, type Plan } from "@/lib/billing";

type SubscriptionState = {
  configured: boolean;
  mode: "none" | "test" | "live";
  status: string;
  planId: string | null;
  currentPeriodEnd: string | null;
  message: string;
};

type UsageItem = {
  label: string;
  used: number;
  cap: number | null;
  hint?: string;
  unit?: string;       // e.g. "$" — prefix on display
};

type BillingPayload = {
  subscription: SubscriptionState;
  usage: { monthLabel: string; items: UsageItem[] };
  invoices: { id: string; date: string; amount: number; status: string; description: string }[];
  invoicesNote: string;
};

function formatNum(n: number, unit?: string) {
  if (unit === "$") {
    return `$${n.toFixed(n < 1 ? 4 : 2)}`;
  }
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function PlanCard({
  p,
  cycle,
  onSelect,
}: {
  p: Plan;
  cycle: "monthly" | "annual";
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
            p.highlight ? "bg-gradient-brand text-white" : "bg-bg-hover text-ink-secondary"
          }`}
        >
          {p.badge}
        </span>
      )}
      <div>
        <div className="text-base font-bold">{p.name}</div>
        <div className="text-[11px] text-ink-tertiary">{p.tagline}</div>
      </div>
      <div className="mt-5">
        <span className="text-3xl font-bold">${price.toLocaleString()}</span>
        <span className="text-xs text-ink-tertiary">
          {p.id === "enterprise" ? "/mo · custom" : "/mo"}
          {cycle === "annual" && p.id !== "enterprise" && ", billed annually"}
        </span>
      </div>
      <button
        onClick={() => onSelect(p)}
        className={`mt-4 w-full rounded-lg py-2 text-sm font-semibold ${
          p.highlight
            ? "bg-gradient-brand shadow-glow"
            : "border border-bg-border bg-bg-card hover:bg-bg-hover"
        }`}
      >
        {p.cta}
      </button>
      <div className="mt-5 space-y-1.5 text-xs">
        {p.features.map((f) => (
          <div key={f.label} className="flex items-start gap-2">
            {f.included ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-green" />
            ) : (
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-tertiary" />
            )}
            <span className={f.included ? "text-ink-secondary" : "text-ink-tertiary line-through"}>
              {f.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BillingPage() {
  const [data, setData] = useState<BillingPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch("/api/admin/billing", { cache: "no-store" });
      if (r.status === 401) {
        setLoadError("Not signed in — visit /signin and try again.");
        return;
      }
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setLoadError(`API returned ${r.status}: ${body.error ?? r.statusText}`);
        return;
      }
      setData(await r.json());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handlePlanSelect(p: Plan) {
    if (!data?.subscription.configured) {
      toast(
        "Stripe billing isn't configured yet — set STRIPE_SECRET_KEY in Netlify env first. Plan selection here will become real once that ships.",
        "info",
      );
      return;
    }
    setConfirmPlan(p);
  }

  function confirmPlanChange() {
    if (!confirmPlan) return;
    const p = confirmPlan;
    setConfirmPlan(null);
    toast(
      `Plan switch flow ships once Stripe Subscription is wired. For now this would switch to ${p.name}.`,
      "info",
    );
  }

  const subscriptionLabel = useMemo(() => {
    if (!data) return "—";
    const s = data.subscription;
    if (!s.configured) return "Not configured";
    if (s.mode === "live") return "Stripe LIVE · subscription not yet fetched";
    return "Stripe TEST · subscription not yet fetched";
  }, [data]);

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
              {subscriptionLabel}
              {data?.usage && (
                <>
                  {" · "}
                  <span className="text-ink-tertiary">usage for {data.usage.monthLabel}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {/* Honest subscription banner */}
      {data && !data.subscription.configured && (
        <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/5 px-4 py-3">
          <div className="flex items-start gap-3 text-[12px]">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-amber/15">
              <AlertCircle className="h-3.5 w-3.5 text-accent-amber" />
            </div>
            <div className="flex-1 text-ink-secondary">
              <span className="font-semibold text-accent-amber">No subscription active</span>
              {" "}— {data.subscription.message}
              {" "}Plans below are real product tiers, but selecting one here is informational
              until the Stripe wiring lands.
            </div>
          </div>
        </div>
      )}
      {data && data.subscription.configured && (
        <div className="rounded-xl border border-accent-green/30 bg-accent-green/5 px-4 py-3">
          <div className="flex items-start gap-3 text-[12px]">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-green/15">
              <Check className="h-3.5 w-3.5 text-accent-green" />
            </div>
            <div className="flex-1 text-ink-secondary">
              <span className="font-semibold text-accent-green">
                Stripe {data.subscription.mode.toUpperCase()} key detected
              </span>
              {" "}— {data.subscription.message}
            </div>
          </div>
        </div>
      )}

      {loadError && (
        <div className="rounded-xl border border-accent-red/40 bg-accent-red/5 px-4 py-3 text-xs text-accent-red">
          <strong className="font-semibold">Couldn&apos;t load billing:</strong> {loadError}
        </div>
      )}

      {/* Real usage */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Usage · {data?.usage.monthLabel ?? "this month"}</h2>
          <a href="/admin/api-keys" className="text-[11px] text-ink-tertiary hover:text-ink-primary">
            Manage API keys →
          </a>
        </div>
        {data === null && !loadError ? (
          <div className="rounded-xl border border-bg-border bg-bg-card p-8 text-center text-xs text-ink-tertiary">
            <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.usage.items ?? []).map((u) => (
              <div key={u.label} className="rounded-lg border border-bg-border bg-bg-card p-3">
                <div className="text-[11px] text-ink-secondary">{u.label}</div>
                <div className="mt-1 text-2xl font-bold">{formatNum(u.used, u.unit)}</div>
                {u.hint && <div className="mt-0.5 text-[10px] text-ink-tertiary">{u.hint}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Plans — real product tiers */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">Plans</h2>
            <p className="text-xs text-ink-tertiary">
              Real tiers · save 17% on annual{" "}
              {!data?.subscription.configured && "· (informational until Stripe wires up)"}
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
            <PlanCard key={p.id} p={p} cycle={cycle} onSelect={handlePlanSelect} />
          ))}
        </div>
      </div>

      {/* Invoices — empty by design until Stripe is wired */}
      <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
        <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-brand-300" /> Invoices
          </div>
          <span className="text-[11px] text-ink-tertiary">
            {data?.invoices.length ?? 0} on file
          </span>
        </div>
        {data && data.invoices.length === 0 ? (
          <div className="px-5 py-8 text-center text-[12px] text-ink-tertiary">
            <FileText className="mx-auto mb-2 h-5 w-5" />
            <div className="text-ink-secondary font-medium">No invoices yet</div>
            <p className="mt-1 max-w-md mx-auto">
              {data.invoicesNote}
            </p>
            {data.subscription.configured && (
              <a
                href="https://dashboard.stripe.com/invoices"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-brand-300 hover:underline"
              >
                Open Stripe dashboard <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        ) : (
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
                {(data?.invoices ?? []).map((inv) => (
                  <tr key={inv.id} className="border-t border-bg-border">
                    <td className="px-5 py-3 font-medium">{inv.id}</td>
                    <td className="px-3 py-3 text-ink-secondary">{inv.date}</td>
                    <td className="px-3 py-3 text-ink-secondary">{inv.description}</td>
                    <td className="px-3 py-3 text-right font-semibold">
                      ${inv.amount.toLocaleString()}
                    </td>
                    <td className="px-5 py-3">{inv.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
              <p className="text-ink-secondary">
                Subscription switching ships once Stripe Subscription is wired. For now this would
                queue a switch to <strong>{confirmPlan.name}</strong> at ${confirmPlan.monthly}/mo
                with a {(confirmPlan.commissionRate * 100).toFixed(1)}% deal commission rate.
              </p>
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
                <ArrowUpRight className="mr-1 inline h-3.5 w-3.5" /> OK, queue this
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
