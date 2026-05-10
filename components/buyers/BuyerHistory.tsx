"use client";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Mail,
  PauseCircle,
  Send,
  ShieldAlert,
  Sparkles,
  Truck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/**
 * Buyer history panel — drafts sent, transactions opened, LTV.
 *
 * Aggregates client-side from /api/drafts + /api/transactions filtered to
 * `buyerCompany`. Used inside BuyerDetail (the buyers page drawer) so the
 * operator clicking a buyer sees their relationship history at a glance,
 * not just the lead-discovery snapshot.
 */

type Draft = {
  id: string;
  createdAt: string;
  buyerCompany: string;
  status: "draft" | "approved" | "sent" | "rejected";
  email: { subject: string };
  sentAt?: string;
};

type Transaction = {
  id: string;
  buyerCompany: string;
  productName: string;
  quantity: number;
  productTotalCents: number;
  state:
    | "draft" | "proposed" | "signed" | "payment_pending" | "escrow_held"
    | "shipped" | "delivered" | "released" | "completed" | "disputed"
    | "refunded" | "cancelled";
  createdAt: string;
  updatedAt: string;
  shareToken: string;
};

const STATE_TONE: Record<Transaction["state"], { Icon: React.ComponentType<{ className?: string }>; bg: string; text: string; label: string }> = {
  draft:           { Icon: Mail,         bg: "bg-bg-hover",          text: "text-ink-secondary",  label: "Draft" },
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

export default function BuyerHistory({ buyerCompany }: { buyerCompany: string }) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/drafts", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/transactions", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([d, t]) => {
      if (cancelled) return;
      const allDrafts: Draft[] = d?.drafts ?? [];
      const allTxns: Transaction[] = t?.transactions ?? [];
      const lc = buyerCompany.toLowerCase();
      setDrafts(allDrafts.filter((x) => x.buyerCompany?.toLowerCase() === lc));
      setTransactions(allTxns.filter((x) => x.buyerCompany?.toLowerCase() === lc));
    });
    return () => {
      cancelled = true;
    };
  }, [buyerCompany]);

  const stats = useMemo(() => {
    const dList = drafts ?? [];
    const tList = transactions ?? [];
    const sent = dList.filter((x) => x.status === "sent").length;
    const closed = tList.filter((t) => t.state === "completed" || t.state === "released");
    const ltvCents = closed.reduce((s, t) => s + t.productTotalCents, 0);
    const inFlight = tList.filter(
      (t) => ["proposed", "signed", "payment_pending", "escrow_held", "shipped", "delivered"].includes(t.state),
    );
    const inFlightCents = inFlight.reduce((s, t) => s + t.productTotalCents, 0);
    const disputeCount = tList.filter((t) => t.state === "disputed").length;
    const refundCount = tList.filter((t) => t.state === "refunded").length;
    const refundRate = tList.length > 0 ? (refundCount / tList.length) * 100 : 0;
    return {
      drafts: dList.length,
      sent,
      transactions: tList.length,
      closed: closed.length,
      ltvCents,
      inFlight: inFlight.length,
      inFlightCents,
      disputeCount,
      refundCount,
      refundRate,
    };
  }, [drafts, transactions]);

  // Don't render the panel if no relationship history exists
  if (drafts === null || transactions === null) {
    return (
      <div className="rounded-lg border border-bg-border bg-bg-card p-3 text-[11px] text-ink-tertiary">
        Loading history…
      </div>
    );
  }
  if (drafts.length === 0 && transactions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-bg-border bg-bg-hover/20 p-3 text-center text-[11px] text-ink-tertiary">
        No drafts or transactions with {buyerCompany} yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <Tile
          label="Lifetime closed"
          value={fmtCents(stats.ltvCents)}
          sub={`${stats.closed} deal${stats.closed === 1 ? "" : "s"}`}
          tone={stats.ltvCents > 0 ? "green" : "default"}
        />
        <Tile
          label="In flight"
          value={fmtCents(stats.inFlightCents)}
          sub={`${stats.inFlight} active`}
          tone={stats.inFlight > 0 ? "amber" : "default"}
        />
        <Tile
          label="Refund rate"
          value={stats.transactions === 0 ? "—" : `${stats.refundRate.toFixed(1)}%`}
          sub={`${stats.refundCount} refund${stats.refundCount === 1 ? "" : "s"} · ${stats.disputeCount} disputed`}
          tone={stats.refundRate >= 5 ? "red" : stats.refundRate >= 2 ? "amber" : "default"}
        />
      </div>

      {/* Outreach history */}
      <div className="rounded-lg border border-bg-border bg-bg-card">
        <div className="flex items-center justify-between border-b border-bg-border px-3 py-2 text-[11px] font-semibold">
          <span className="flex items-center gap-1.5">
            <Mail className="h-3 w-3 text-accent-cyan" /> Outreach
          </span>
          <span className="text-ink-tertiary">{stats.drafts} draft{stats.drafts === 1 ? "" : "s"} · {stats.sent} sent</span>
        </div>
        {drafts.length === 0 ? (
          <div className="px-3 py-2 text-[11px] text-ink-tertiary">No drafts yet</div>
        ) : (
          <ul className="divide-y divide-bg-border">
            {drafts.slice(0, 5).map((d) => (
              <li key={d.id} className="flex items-start gap-2 px-3 py-2 text-[11px]">
                <div className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{d.email.subject}</span>
                </div>
                <span className="shrink-0 text-ink-tertiary">{relTime(d.sentAt ?? d.createdAt)}</span>
                <span
                  className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                    d.status === "sent"
                      ? "bg-accent-green/15 text-accent-green"
                      : d.status === "rejected"
                      ? "bg-accent-red/15 text-accent-red"
                      : d.status === "approved"
                      ? "bg-brand-500/15 text-brand-200"
                      : "bg-accent-amber/15 text-accent-amber"
                  }`}
                >
                  {d.status}
                </span>
              </li>
            ))}
          </ul>
        )}
        {drafts.length > 5 && (
          <div className="border-t border-bg-border px-3 py-1.5 text-center text-[10px] text-ink-tertiary">
            Showing 5 of {drafts.length} · <Link href="/outreach" className="text-brand-300 hover:text-brand-200">view all</Link>
          </div>
        )}
      </div>

      {/* Transaction history */}
      <div className="rounded-lg border border-bg-border bg-bg-card">
        <div className="flex items-center justify-between border-b border-bg-border px-3 py-2 text-[11px] font-semibold">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-accent-green" /> Transactions
          </span>
          <span className="text-ink-tertiary">{stats.transactions} total · {stats.closed} closed</span>
        </div>
        {transactions.length === 0 ? (
          <div className="px-3 py-2 text-[11px] text-ink-tertiary">No transactions yet</div>
        ) : (
          <ul className="divide-y divide-bg-border">
            {transactions.slice(0, 5).map((t) => {
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
                      {tone.label} · {relTime(t.updatedAt ?? t.createdAt)}
                    </div>
                  </div>
                  <span className="shrink-0 font-semibold">{fmtCents(t.productTotalCents)}</span>
                </li>
              );
            })}
          </ul>
        )}
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
