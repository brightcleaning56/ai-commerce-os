"use client";
import {
  ArrowRight,
  CheckCircle2,
  Factory,
  Mail,
  PauseCircle,
  ShieldAlert,
  Sparkles,
  Truck,
  Users,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/**
 * Product history panel — drafts + transactions + buyer/supplier matches.
 *
 * Closes the trio: BuyerHistory shows what each buyer's relationship looks
 * like, SupplierHistory shows the same for manufacturers, and this surfaces
 * the per-product picture: how many leads has this product generated, how
 * much has it sold, how many suppliers cover it.
 *
 * Matching is by product name (case-insensitive equality) since drafts
 * and transactions store productName as text. DiscoveredBuyers and
 * DiscoveredSuppliers expose `forProduct` which is the same string.
 */

type Draft = {
  id: string;
  createdAt: string;
  buyerCompany: string;
  productName: string;
  status: "draft" | "approved" | "sent" | "rejected";
  email: { subject: string };
  sentAt?: string;
};

type Transaction = {
  id: string;
  buyerCompany: string;
  supplierName?: string;
  productName: string;
  quantity: number;
  productTotalCents: number;
  state:
    | "draft" | "proposed" | "signed" | "payment_pending" | "escrow_held"
    | "shipped" | "delivered" | "released" | "completed" | "disputed"
    | "refunded" | "cancelled";
  createdAt: string;
  updatedAt: string;
};

type DiscoveredBuyer = { id: string; company: string; forProduct?: string; intentScore?: number };
type DiscoveredSupplier = { id: string; name: string; forProduct?: string; verified?: boolean; supplierStripeAccountId?: string };

const STATE_TONE: Record<Transaction["state"], { Icon: React.ComponentType<{ className?: string }>; bg: string; text: string; label: string }> = {
  draft:           { Icon: Mail,         bg: "bg-bg-hover",          text: "text-ink-secondary",  label: "Draft" },
  proposed:        { Icon: Mail,         bg: "bg-accent-blue/15",    text: "text-accent-blue",    label: "Proposed" },
  signed:          { Icon: CheckCircle2, bg: "bg-accent-blue/15",    text: "text-accent-blue",    label: "Signed" },
  payment_pending: { Icon: Mail,         bg: "bg-accent-amber/15",   text: "text-accent-amber",   label: "Pay-pending" },
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

export default function ProductHistory({ productName }: { productName: string }) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [buyers, setBuyers] = useState<DiscoveredBuyer[] | null>(null);
  const [suppliers, setSuppliers] = useState<DiscoveredSupplier[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/drafts", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/transactions", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/discovered-buyers", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/discovered-suppliers", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([d, t, b, s]) => {
      if (cancelled) return;
      const lc = productName.toLowerCase();
      setDrafts((d?.drafts ?? []).filter((x: Draft) => x.productName?.toLowerCase() === lc));
      setTransactions((t?.transactions ?? []).filter((x: Transaction) => x.productName?.toLowerCase() === lc));
      setBuyers((b?.buyers ?? []).filter((x: DiscoveredBuyer) => x.forProduct?.toLowerCase() === lc));
      setSuppliers((s?.suppliers ?? []).filter((x: DiscoveredSupplier) => x.forProduct?.toLowerCase() === lc));
    });
    return () => {
      cancelled = true;
    };
  }, [productName]);

  const stats = useMemo(() => {
    const dList = drafts ?? [];
    const tList = transactions ?? [];
    const bList = buyers ?? [];
    const sList = suppliers ?? [];
    const closed = tList.filter((t) => t.state === "completed" || t.state === "released");
    const lifetimeSoldCents = closed.reduce((s, t) => s + t.productTotalCents, 0);
    const inFlight = tList.filter(
      (t) => ["proposed", "signed", "payment_pending", "escrow_held", "shipped", "delivered"].includes(t.state),
    );
    const inFlightCents = inFlight.reduce((s, t) => s + t.productTotalCents, 0);
    return {
      lifetimeSoldCents,
      closed: closed.length,
      inFlight: inFlight.length,
      inFlightCents,
      drafts: dList.length,
      sent: dList.filter((d) => d.status === "sent").length,
      buyersMatched: bList.length,
      buyersHighIntent: bList.filter((b) => (b.intentScore ?? 0) >= 70).length,
      suppliersMatched: sList.length,
      verifiedSuppliers: sList.filter((s) => s.verified).length,
    };
  }, [drafts, transactions, buyers, suppliers]);

  if (drafts === null || transactions === null) {
    return (
      <div className="rounded-lg border border-bg-border bg-bg-card p-3 text-[11px] text-ink-tertiary">
        Loading product history…
      </div>
    );
  }

  const hasAnything =
    (drafts.length + transactions.length + (buyers?.length ?? 0) + (suppliers?.length ?? 0)) > 0;

  if (!hasAnything) {
    return (
      <div className="rounded-lg border border-dashed border-bg-border bg-bg-hover/20 p-3 text-center text-[11px] text-ink-tertiary">
        No history for {productName} yet — run the pipeline to surface buyers + suppliers.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
        <Tile
          label="Lifetime sold"
          value={fmtCents(stats.lifetimeSoldCents)}
          sub={`${stats.closed} closed deal${stats.closed === 1 ? "" : "s"}`}
          tone={stats.lifetimeSoldCents > 0 ? "green" : "default"}
        />
        <Tile
          label="In flight"
          value={fmtCents(stats.inFlightCents)}
          sub={`${stats.inFlight} active`}
          tone={stats.inFlight > 0 ? "amber" : "default"}
        />
        <Tile
          label="Buyer interest"
          value={String(stats.buyersMatched)}
          sub={`${stats.buyersHighIntent} high-intent`}
          tone={stats.buyersHighIntent > 0 ? "brand" : "default"}
        />
        <Tile
          label="Supplier coverage"
          value={String(stats.suppliersMatched)}
          sub={`${stats.verifiedSuppliers} verified`}
          tone={stats.suppliersMatched > 0 ? "default" : "default"}
        />
      </div>

      {/* Outreach panel — last 4 drafts */}
      {(drafts.length > 0 || stats.sent > 0) && (
        <div className="rounded-lg border border-bg-border bg-bg-card">
          <div className="flex items-center justify-between border-b border-bg-border px-3 py-2 text-[11px] font-semibold">
            <span className="flex items-center gap-1.5">
              <Mail className="h-3 w-3 text-accent-cyan" /> Outreach
            </span>
            <span className="text-ink-tertiary">
              {stats.drafts} draft{stats.drafts === 1 ? "" : "s"} · {stats.sent} sent
            </span>
          </div>
          {drafts.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-ink-tertiary">No drafts yet</div>
          ) : (
            <ul className="divide-y divide-bg-border">
              {drafts.slice(0, 4).map((d) => (
                <li key={d.id} className="flex items-start gap-2 px-3 py-2 text-[11px]">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{d.email.subject}</div>
                    <div className="truncate text-[10px] text-ink-tertiary">→ {d.buyerCompany}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] text-ink-tertiary">{relTime(d.sentAt ?? d.createdAt)}</div>
                    <span
                      className={`mt-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
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
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Transactions panel */}
      {transactions.length > 0 && (
        <div className="rounded-lg border border-bg-border bg-bg-card">
          <div className="flex items-center justify-between border-b border-bg-border px-3 py-2 text-[11px] font-semibold">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-accent-green" /> Transactions
            </span>
            <span className="text-ink-tertiary">
              {transactions.length} total · {stats.closed} closed
            </span>
          </div>
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
                      {t.buyerCompany}{t.supplierName ? ` ← ${t.supplierName}` : ""}
                    </div>
                    <div className="text-[10px] text-ink-tertiary">
                      {tone.label} · qty {t.quantity.toLocaleString()} · {relTime(t.updatedAt ?? t.createdAt)}
                    </div>
                  </div>
                  <span className="shrink-0 font-semibold">{fmtCents(t.productTotalCents)}</span>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-bg-border px-3 py-1.5 text-center text-[10px] text-ink-tertiary">
            <Link href="/transactions" className="text-brand-300 hover:text-brand-200 inline-flex items-center gap-1">
              Open in transactions <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Buyer / supplier match shortcut row */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <Link
          href={`/buyers?focus=${encodeURIComponent(productName)}`}
          className="flex items-center justify-between rounded-md border border-bg-border bg-bg-hover/30 px-3 py-2 hover:bg-bg-hover"
        >
          <span className="flex items-center gap-1.5">
            <Users className="h-3 w-3 text-accent-blue" /> {stats.buyersMatched} buyer{stats.buyersMatched === 1 ? "" : "s"} matched
          </span>
          <ArrowRight className="h-2.5 w-2.5 text-ink-tertiary" />
        </Link>
        <Link
          href={`/suppliers?focus=${encodeURIComponent(productName)}`}
          className="flex items-center justify-between rounded-md border border-bg-border bg-bg-hover/30 px-3 py-2 hover:bg-bg-hover"
        >
          <span className="flex items-center gap-1.5">
            <Factory className="h-3 w-3 text-accent-amber" /> {stats.suppliersMatched} supplier{stats.suppliersMatched === 1 ? "" : "s"}
          </span>
          <ArrowRight className="h-2.5 w-2.5 text-ink-tertiary" />
        </Link>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "default" | "green" | "amber" | "red" | "brand";
}) {
  const cls =
    tone === "green" ? "text-accent-green" :
    tone === "amber" ? "text-accent-amber" :
    tone === "red" ? "text-accent-red" :
    tone === "brand" ? "text-brand-200" : "";
  return (
    <div className="rounded-md border border-bg-border bg-bg-card p-2">
      <div className="text-[9px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className={`mt-0.5 text-sm font-bold ${cls}`}>{value}</div>
      <div className="text-[10px] text-ink-tertiary">{sub}</div>
    </div>
  );
}
