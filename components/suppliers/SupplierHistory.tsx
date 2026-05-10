"use client";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  PauseCircle,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Truck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/**
 * Supplier history panel — transactions where this supplier is fulfilling.
 *
 * Matching is fuzzy by `supplierName` substring (case-insensitive) since
 * transactions store the supplier as free text rather than a hard FK.
 * That's good enough for the common case ("Shenzhen ProBlend" matches
 * "Shenzhen ProBlend Manufacturing Co Ltd").
 *
 * Used inside the SupplierDetail drawer on /suppliers — gives the operator
 * a working relationship view with each manufacturer: how many deals have
 * gone through them, lifetime payouts, on-time-delivery rate, dispute rate,
 * Stripe Connect onboarding status.
 */

type Transaction = {
  id: string;
  buyerCompany: string;
  supplierName?: string;
  supplierStripeAccountId?: string;
  productName: string;
  quantity: number;
  productTotalCents: number;
  supplierPayoutCents: number;
  state:
    | "draft" | "proposed" | "signed" | "payment_pending" | "escrow_held"
    | "shipped" | "delivered" | "released" | "completed" | "disputed"
    | "refunded" | "cancelled";
  createdAt: string;
  updatedAt: string;
  shippedAt?: string;
  deliveredAt?: string;
};

const STATE_TONE: Record<Transaction["state"], { Icon: React.ComponentType<{ className?: string }>; bg: string; text: string; label: string }> = {
  draft:           { Icon: Send,         bg: "bg-bg-hover",          text: "text-ink-secondary",  label: "Draft" },
  proposed:        { Icon: Send,         bg: "bg-accent-blue/15",    text: "text-accent-blue",    label: "Proposed" },
  signed:          { Icon: CheckCircle2, bg: "bg-accent-blue/15",    text: "text-accent-blue",    label: "Signed" },
  payment_pending: { Icon: Clock,        bg: "bg-accent-amber/15",   text: "text-accent-amber",   label: "Pay-pending" },
  escrow_held:     { Icon: Sparkles,     bg: "bg-accent-amber/15",   text: "text-accent-amber",   label: "Escrow" },
  shipped:         { Icon: Truck,        bg: "bg-accent-blue/15",    text: "text-accent-blue",    label: "Shipped" },
  delivered:       { Icon: Truck,        bg: "bg-accent-blue/15",    text: "text-accent-blue",    label: "Delivered" },
  released:        { Icon: CheckCircle2, bg: "bg-accent-green/15",   text: "text-accent-green",   label: "Released" },
  completed:       { Icon: CheckCircle2, bg: "bg-accent-green/15",   text: "text-accent-green",   label: "Completed" },
  disputed:        { Icon: ShieldAlert,  bg: "bg-accent-red/15",     text: "text-accent-red",     label: "Disputed" },
  refunded:        { Icon: PauseCircle,  bg: "bg-accent-red/15",     text: "text-accent-red",     label: "Refunded" },
  cancelled:       { Icon: XCircle,      bg: "bg-bg-hover",          text: "text-ink-secondary",  label: "Cancelled" },
};

function fmtCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function SupplierHistory({ supplierName }: { supplierName: string }) {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/transactions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const all: Transaction[] = d?.transactions ?? [];
        const needle = supplierName.toLowerCase();
        // Fuzzy: substring either direction so both extra-suffix and short
        // forms match (e.g., "Shenzhen ProBlend" ↔ "Shenzhen ProBlend Mfg").
        setTransactions(
          all.filter((t) => {
            if (!t.supplierName) return false;
            const sn = t.supplierName.toLowerCase();
            return sn.includes(needle) || needle.includes(sn);
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setTransactions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [supplierName]);

  const stats = useMemo(() => {
    const list = transactions ?? [];
    const closed = list.filter((t) => t.state === "completed" || t.state === "released");
    const lifetimePayoutCents = closed.reduce((s, t) => s + t.supplierPayoutCents, 0);
    const inFlight = list.filter(
      (t) => ["proposed", "signed", "payment_pending", "escrow_held", "shipped", "delivered"].includes(t.state),
    );
    const inFlightPayoutCents = inFlight.reduce((s, t) => s + t.supplierPayoutCents, 0);
    const disputed = list.filter((t) => t.state === "disputed").length;
    const refunded = list.filter((t) => t.state === "refunded").length;
    const issueCount = disputed + refunded;
    const issueRate = list.length > 0 ? (issueCount / list.length) * 100 : 0;
    // On-time-delivery: % of shipped txns that reached delivered within
    // their leadTimeDays. We don't have explicit promise dates here so
    // approximate as: had a deliveredAt at all (shipped → delivered ratio).
    const shippedCount = list.filter((t) =>
      ["shipped", "delivered", "released", "completed"].includes(t.state),
    ).length;
    const deliveredCount = list.filter((t) =>
      ["delivered", "released", "completed"].includes(t.state),
    ).length;
    const deliveredRate = shippedCount > 0 ? (deliveredCount / shippedCount) * 100 : 0;
    // Stripe Connect status — true if any txn has the supplier id set
    const isConnected = list.some((t) => !!t.supplierStripeAccountId);
    return {
      total: list.length,
      closed: closed.length,
      lifetimePayoutCents,
      inFlight: inFlight.length,
      inFlightPayoutCents,
      issueCount,
      issueRate,
      deliveredRate,
      shippedCount,
      isConnected,
    };
  }, [transactions]);

  if (transactions === null) {
    return (
      <div className="rounded-lg border border-bg-border bg-bg-card p-3 text-[11px] text-ink-tertiary">
        Loading history…
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-bg-border bg-bg-hover/20 p-3 text-center text-[11px] text-ink-tertiary">
        No transactions with {supplierName} yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <Tile
          label="Lifetime paid"
          value={fmtCents(stats.lifetimePayoutCents)}
          sub={`${stats.closed} order${stats.closed === 1 ? "" : "s"}`}
          tone={stats.lifetimePayoutCents > 0 ? "green" : "default"}
        />
        <Tile
          label="In flight"
          value={fmtCents(stats.inFlightPayoutCents)}
          sub={`${stats.inFlight} active`}
          tone={stats.inFlight > 0 ? "amber" : "default"}
        />
        <Tile
          label="Dispute / refund rate"
          value={stats.total === 0 ? "—" : `${stats.issueRate.toFixed(1)}%`}
          sub={`${stats.issueCount} of ${stats.total}`}
          tone={stats.issueRate >= 5 ? "red" : stats.issueRate >= 2 ? "amber" : "default"}
        />
      </div>

      {/* Stripe Connect status row */}
      <div
        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-[11px] ${
          stats.isConnected
            ? "border-accent-green/30 bg-accent-green/5"
            : "border-bg-border bg-bg-hover/30"
        }`}
      >
        {stats.isConnected ? (
          <ShieldCheck className="h-3.5 w-3.5 text-accent-green" />
        ) : (
          <CreditCard className="h-3.5 w-3.5 text-ink-tertiary" />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold">
            {stats.isConnected ? "Stripe Connect onboarded" : "Not yet connected to Stripe"}
          </div>
          <div className="text-[10px] text-ink-tertiary">
            {stats.isConnected
              ? "Escrow release sends payouts directly to this supplier."
              : "Open a transaction to start onboarding from /transactions."}
          </div>
        </div>
      </div>

      {/* Transaction history */}
      <div className="rounded-lg border border-bg-border bg-bg-card">
        <div className="flex items-center justify-between border-b border-bg-border px-3 py-2 text-[11px] font-semibold">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-accent-green" /> Orders
          </span>
          <span className="text-ink-tertiary">
            {stats.total} total · delivered rate {stats.shippedCount > 0 ? `${stats.deliveredRate.toFixed(0)}%` : "—"}
          </span>
        </div>
        <ul className="divide-y divide-bg-border">
          {transactions.slice(0, 6).map((t) => {
            const tone = STATE_TONE[t.state];
            return (
              <li key={t.id} className="flex items-start gap-2 px-3 py-2 text-[11px]">
                <div className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded ${tone.bg}`}>
                  <tone.Icon className={`h-2.5 w-2.5 ${tone.text}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {t.productName} <span className="text-ink-tertiary">× {t.quantity.toLocaleString()}</span>
                  </div>
                  <div className="text-[10px] text-ink-tertiary">
                    {t.buyerCompany} · {tone.label} · {relTime(t.updatedAt ?? t.createdAt)}
                  </div>
                </div>
                <span className="shrink-0 font-semibold">{fmtCents(t.supplierPayoutCents)}</span>
              </li>
            );
          })}
        </ul>
        {transactions.length > 0 && (
          <div className="border-t border-bg-border px-3 py-1.5 text-center text-[10px] text-ink-tertiary">
            <Link href="/transactions" className="text-brand-300 hover:text-brand-200 inline-flex items-center gap-1">
              Open in transactions <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "default" | "green" | "amber" | "red" }) {
  const cls =
    tone === "green" ? "text-accent-green" :
    tone === "amber" ? "text-accent-amber" :
    tone === "red" ? "text-accent-red" : "";
  return (
    <div className="rounded-md border border-bg-border bg-bg-card p-2">
      <div className="text-[9px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className={`mt-0.5 text-sm font-bold ${cls}`}>{value}</div>
      <div className="text-[10px] text-ink-tertiary">{sub}</div>
    </div>
  );
}
