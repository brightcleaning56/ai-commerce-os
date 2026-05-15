"use client";
import {
  ArrowDownToLine,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  Globe,
  Lock,
  MessageSquare,
  Package,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  Truck,
  Unlock,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ACTIVITY,
  LISTINGS,
  ORDERS,
  RFQS,
  type Listing,
  type Order,
  type RFQ,
} from "@/lib/marketplace";
import Drawer from "@/components/ui/Drawer";

const ESCROW_TONE: Record<string, { bg: string; text: string; Icon: React.ComponentType<{ className?: string }> }> = {
  Funded: { bg: "bg-accent-blue/15", text: "text-accent-blue", Icon: Lock },
  "In Transit": { bg: "bg-accent-amber/15", text: "text-accent-amber", Icon: Truck },
  Delivered: { bg: "bg-brand-500/15", text: "text-brand-200", Icon: Package },
  Released: { bg: "bg-accent-green/15", text: "text-accent-green", Icon: Unlock },
};

const RFQ_TONE: Record<string, string> = {
  Open: "bg-accent-green/15 text-accent-green",
  "In Review": "bg-accent-amber/15 text-accent-amber",
  Awarded: "bg-brand-500/15 text-brand-200",
  Closed: "bg-bg-hover text-ink-tertiary",
};

const ACT_DOT: Record<string, string> = {
  brand: "bg-brand-400",
  green: "bg-accent-green",
  amber: "bg-accent-amber",
  blue: "bg-accent-blue",
};

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function ListingDetail({
  l,
  onOrder,
  onSample,
  onMessage,
}: {
  l: Listing;
  onOrder: (l: Listing) => void;
  onSample: (l: Listing) => void;
  onMessage: (l: Listing) => void;
}) {
  return (
    <div className="space-y-5 p-5">
      <div className="flex items-start gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-xl bg-gradient-card text-3xl">
          {l.emoji}
        </div>
        <div className="flex-1">
          <div className="text-xl font-bold">{l.product}</div>
          <div className="text-xs text-ink-tertiary">{l.category}</div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="font-medium">{l.supplier}</span>
            <span className="text-ink-tertiary">·</span>
            <span className="text-ink-secondary">{l.supplierCountry}</span>
            {l.supplierVerified && (
              <span className="flex items-center gap-1 rounded-md bg-accent-green/15 px-2 py-0.5 text-[10px] font-semibold text-accent-green">
                <CheckCircle2 className="h-3 w-3" /> Verified
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Unit Price" value={`$${l.unitPrice.toFixed(2)}`} />
        <Stat label="MOQ" value={l.moq.toLocaleString()} />
        <Stat label="Lead Time" value={`${l.leadTimeDays}d`} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="In Stock" value={l.inStock.toLocaleString()} hint={`Posted ${l.postedAgo}`} />
        <Stat label="Rating" value={`${l.rating} / 5`} hint="Based on 240+ orders" />
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold">Certifications</div>
        <div className="flex flex-wrap gap-1.5">
          {l.certs.map((c) => (
            <span
              key={c}
              className="flex items-center gap-1 rounded-md border border-bg-border bg-bg-hover/40 px-2 py-1 text-[11px] text-ink-secondary"
            >
              <ShieldCheck className="h-3 w-3 text-accent-green" /> {c}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-200">
          <Sparkles className="h-4 w-4" /> Platform-protected order
        </div>
        <p className="mt-1 text-xs text-ink-secondary">
          Funds held in escrow until the buyer confirms delivery. Platform fee is 2% on volume orders, 2.5% under $5K.
          Disputes resolved within 7 business days.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 pb-2">
        <button
          onClick={() => onOrder(l)}
          className="flex items-center justify-center gap-2 rounded-lg bg-gradient-brand py-2.5 text-sm font-semibold shadow-glow"
        >
          <Banknote className="h-4 w-4" /> Place Order
        </button>
        <button
          onClick={() => onMessage(l)}
          className="flex items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card py-2.5 text-sm hover:bg-bg-hover"
        >
          <MessageSquare className="h-4 w-4" /> Message Supplier
        </button>
        <button
          onClick={() => onSample(l)}
          className="col-span-2 flex items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card py-2.5 text-sm hover:bg-bg-hover"
        >
          <Truck className="h-4 w-4" /> Order Sample
        </button>
      </div>
    </div>
  );
}

function RFQDetail({ r, onAward }: { r: RFQ; onAward: (r: RFQ) => void }) {
  const fillRate = Math.min(100, Math.round((r.responses / 10) * 100));
  return (
    <div className="space-y-5 p-5">
      <div>
        <div className="text-xs uppercase tracking-wider text-ink-tertiary">RFQ</div>
        <div className="text-xl font-bold">{r.product}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium">{r.buyer}</span>
          <span className="text-ink-tertiary">·</span>
          <span className="text-ink-secondary">{r.buyerType}</span>
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${RFQ_TONE[r.status]}`}>
            {r.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Qty" value={r.qty.toLocaleString()} />
        <Stat label="Target" value={`$${r.targetUnit.toFixed(2)}`} hint="per unit" />
        <Stat label="Budget" value={fmtUSD(r.budget)} />
        <Stat label="Deliver By" value={r.deliverBy} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-semibold">Quote responses</span>
          <span className="text-ink-tertiary">{r.responses} of 10 expected</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-bg-hover">
          <div className="h-full bg-gradient-brand" style={{ width: `${fillRate}%` }} />
        </div>
      </div>

      <div className="rounded-lg border border-bg-border bg-bg-card">
        <div className="border-b border-bg-border px-4 py-2.5 text-xs font-semibold">
          Top Quotes
        </div>
        <ul className="divide-y divide-bg-border text-xs">
          {[
            { supplier: "Mumbai Goods Ltd.", unit: r.targetUnit - 0.4, lead: 25, score: 96 },
            { supplier: "Hanoi Crafts", unit: r.targetUnit - 0.1, lead: 22, score: 91 },
            { supplier: "Shenzhen Bright Co.", unit: r.targetUnit + 0.2, lead: 18, score: 88 },
          ].map((q) => (
            <li
              key={q.supplier}
              className="flex items-center justify-between px-4 py-2.5"
            >
              <div>
                <div className="font-medium">{q.supplier}</div>
                <div className="text-[11px] text-ink-tertiary">
                  ${q.unit.toFixed(2)}/unit · {q.lead}d lead
                </div>
              </div>
              <span className="rounded-md bg-brand-500/15 px-2 py-0.5 font-semibold text-brand-200">
                Fit {q.score}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-2 pb-2">
        <button
          onClick={() => onAward(r)}
          disabled={r.status === "Awarded" || r.status === "Closed"}
          className="flex items-center justify-center gap-2 rounded-lg bg-gradient-brand py-2.5 text-sm font-semibold shadow-glow disabled:opacity-50"
        >
          {r.status === "Awarded" ? "Already awarded" : "Award Top Quote"}
        </button>
        <button className="flex items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card py-2.5 text-sm hover:bg-bg-hover">
          Edit RFQ
        </button>
      </div>
    </div>
  );
}

export default function MarketplacePage() {
  const [tab, setTab] = useState<"listings" | "rfqs" | "orders">("listings");
  const [openListing, setOpenListing] = useState<Listing | null>(null);
  // Slice 41: live counts from the supplier registry + transactions
  // store. The listings + RFQs + orders below are still mock data
  // (preview surface), but the operator sees a real signal of how
  // many vetted suppliers + linked txns are actually in the workspace.
  const [liveCounts, setLiveCounts] = useState<{
    activeSuppliers: number;
    pendingSuppliers: number;
    linkedTransactions: number;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/admin/suppliers", { cache: "no-store", credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch("/api/transactions", { cache: "no-store", credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([suppliers, txns]) => {
      if (cancelled) return;
      const supplierList: Array<{ status?: string }> = suppliers?.suppliers ?? [];
      const txnList: Array<{ supplierRegistryId?: string }> = txns?.transactions ?? [];
      setLiveCounts({
        activeSuppliers: supplierList.filter((s) => s.status === "active").length,
        pendingSuppliers: supplierList.filter((s) => s.status === "pending").length,
        linkedTransactions: txnList.filter((t) => !!t.supplierRegistryId).length,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const [openRfq, setOpenRfq] = useState<RFQ | null>(null);
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<Order[]>(ORDERS);
  const [rfqs, setRfqs] = useState<RFQ[]>(RFQS);
  const [activity, setActivity] = useState(ACTIVITY);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function handlePlaceOrder(l: Listing) {
    const orderId = `o${orders.length + 1}_${Date.now().toString(36)}`;
    const qty = l.moq;
    const amount = +(l.unitPrice * qty).toFixed(0);
    const fee = +(amount * 0.02).toFixed(0);
    const newOrder: Order = {
      id: orderId,
      buyer: "Acme Brand Co.",
      supplier: l.supplier,
      product: l.product,
      qty,
      amount,
      fee,
      feeRate: 0.02,
      escrowStatus: "Funded",
      paymentMethod: "ACH",
      placedAt: new Date().toLocaleDateString(),
    };
    setOrders((prev) => [newOrder, ...prev]);
    setActivity((prev) => [
      {
        ago: "just now",
        text: `Placed order with ${l.supplier} for ${qty} units of ${l.product} (${fmtUSD(amount)})`,
        amount,
        tone: "green",
      },
      ...prev,
    ]);
    setOpenListing(null);
    setTab("orders");
    showToast(`Order placed · ${fmtUSD(amount)} funded into escrow`);
  }

  function handleOrderSample(l: Listing) {
    setActivity((prev) => [
      { ago: "just now", text: `Sample requested from ${l.supplier} for ${l.product}`, tone: "blue" },
      ...prev,
    ]);
    showToast(`Sample requested from ${l.supplier}`);
  }

  function handleMessageSupplier(l: Listing) {
    setActivity((prev) => [
      { ago: "just now", text: `Sent message to ${l.supplier} about ${l.product}`, tone: "brand" },
      ...prev,
    ]);
    showToast(`Message sent to ${l.supplier}`);
  }

  function handleAwardRfq(r: RFQ) {
    setRfqs((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: "Awarded" } : x)));
    setActivity((prev) => [
      { ago: "just now", text: `Awarded RFQ #${r.id} (${r.product}) to top-rated supplier`, tone: "green" },
      ...prev,
    ]);
    setOpenRfq(null);
    showToast(`RFQ awarded · ${r.product}`);
  }

  const totals = useMemo(() => {
    const gmv = orders.reduce((s, o) => s + o.amount, 0);
    const fees = orders.reduce((s, o) => s + o.fee, 0);
    const inEscrow = orders.filter((o) => o.escrowStatus !== "Released").reduce(
      (s, o) => s + o.amount,
      0
    );
    return { gmv, fees, inEscrow };
  }, [orders]);

  const filteredListings = LISTINGS.filter(
    (l) =>
      !query ||
      l.product.toLowerCase().includes(query.toLowerCase()) ||
      l.supplier.toLowerCase().includes(query.toLowerCase())
  );
  const filteredRfqs = rfqs.filter(
    (r) =>
      !query ||
      r.product.toLowerCase().includes(query.toLowerCase()) ||
      r.buyer.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Marketplace</h1>
            <p className="text-xs text-ink-secondary">
              Internal supplier+buyer marketplace · 2% platform fee on every closed transaction
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Both header buttons are intentionally disabled — they previously
              had no onClick handler at all, which made them look operational
              when the entire marketplace surface is preview-only (see banner
              below). Hover title spells out the same. */}
          <button
            type="button"
            disabled
            title="Marketplace surface is preview-only — see the banner below"
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm opacity-50 cursor-not-allowed"
          >
            <Plus className="h-4 w-4" /> Post RFQ
          </button>
          <button
            type="button"
            disabled
            title="Marketplace surface is preview-only — see the banner below"
            className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow opacity-50 cursor-not-allowed"
          >
            <Plus className="h-4 w-4" /> List Inventory
          </button>
        </div>
      </div>

      {/* Preview banner — Marketplace is forward-looking; today AVYN's flow goes
          through Supplier Finder (external sources) → Quote → Transaction. */}
      <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/5 px-4 py-3">
        <div className="flex items-start gap-3 text-[12px]">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-amber/15">
            <Sparkles className="h-3.5 w-3.5 text-accent-amber" />
          </div>
          <div className="flex-1">
            <span className="font-semibold text-accent-amber">Preview · in-platform marketplace coming soon</span>
            <span className="text-ink-secondary">
              {" "}
              — AVYN&apos;s current flow goes through{" "}
              <a href="/suppliers" className="text-brand-300 hover:text-brand-200 underline">Supplier Finder</a>
              {" "}(external sourcing) →{" "}
              <a href="/deals" className="text-brand-300 hover:text-brand-200 underline">Quote</a>
              {" "}→{" "}
              <a href="/transactions" className="text-brand-300 hover:text-brand-200 underline">Transaction</a>
              . The internal listing/RFQ marketplace below is a preview of what supplier-side onboarding
              will look like once Stripe Connect supplier flows are wired.
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Marketplace GMV (May)" value={fmtUSD(totals.gmv)} delta="+38% MoM" Icon={TrendingUp} tone="brand" href="/reports" />
        <Kpi label="Platform Fees Earned" value={fmtUSD(totals.fees)} delta="2% effective" Icon={Banknote} tone="green" href="/earnings" />
        <Kpi label="In Escrow" value={fmtUSD(totals.inEscrow)} delta={`${orders.filter((o) => o.escrowStatus !== "Released").length} active`} Icon={Lock} tone="amber" href="/escrow" />
        <Kpi label="Cross-border Orders" value={`${orders.length}`} delta="6 countries" Icon={Globe} tone="blue" href="/transactions" />
      </div>

      {/* Slice 41: live counts from supplier registry + transactions
          stores. The marketplace tabs below are still preview/mock --
          this row is the only real-data anchor on the page so the
          operator can tell which tile reflects reality. */}
      {liveCounts && (
        <div className="rounded-xl border border-accent-blue/40 bg-accent-blue/5 px-4 py-3">
          <div className="mb-1 flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-accent-blue" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-accent-blue">
              Live workspace data
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-[12px]">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Active suppliers</div>
              <div className="text-base font-bold tabular-nums">{liveCounts.activeSuppliers}</div>
              <Link href="/admin/suppliers" className="text-[10px] text-accent-blue hover:underline">
                Open registry →
              </Link>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Pending verification</div>
              <div className="text-base font-bold tabular-nums">{liveCounts.pendingSuppliers}</div>
              <Link href="/admin/suppliers" className="text-[10px] text-accent-blue hover:underline">
                Review →
              </Link>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Linked transactions</div>
              <div className="text-base font-bold tabular-nums">{liveCounts.linkedTransactions}</div>
              <Link href="/transactions" className="text-[10px] text-accent-blue hover:underline">
                Open transactions →
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-bg-border bg-bg-card p-1 text-xs">
              {(
                [
                  ["listings", "Listings", LISTINGS.length],
                  ["rfqs", "RFQs", rfqs.length],
                  ["orders", "Orders", orders.length],
                ] as const
              ).map(([k, label, n]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 ${
                    tab === k
                      ? "bg-brand-500/15 text-brand-200"
                      : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
                  }`}
                >
                  {label}
                  <span
                    className={`rounded ${
                      tab === k ? "bg-brand-500/20" : "bg-bg-hover"
                    } px-1.5 text-[10px]`}
                  >
                    {n}
                  </span>
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${tab}…`}
                className="h-9 w-full rounded-lg border border-bg-border bg-bg-card pl-9 pr-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          {tab === "listings" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filteredListings.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setOpenListing(l)}
                  className="group rounded-xl border border-bg-border bg-bg-card p-4 text-left transition hover:border-brand-500/50 hover:shadow-glow"
                >
                  <div className="flex items-start gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-lg bg-gradient-card text-2xl">
                      {l.emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{l.product}</div>
                      <div className="flex items-center gap-1 text-[11px] text-ink-tertiary">
                        <span>{l.supplier}</span>
                        {l.supplierVerified && (
                          <CheckCircle2 className="h-3 w-3 text-accent-green" />
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                        Unit
                      </div>
                      <div className="text-sm font-semibold">${l.unitPrice.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                        MOQ
                      </div>
                      <div className="text-sm font-semibold">{l.moq}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                        Lead
                      </div>
                      <div className="text-sm font-semibold">{l.leadTimeDays}d</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-accent-amber text-accent-amber" />
                      {l.rating} · {l.supplierCountry}
                    </span>
                    <span className="text-ink-tertiary">{l.postedAgo}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {tab === "rfqs" && (
            <div className="rounded-xl border border-bg-border bg-bg-card">
              <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
                  <tr className="border-b border-bg-border">
                    <th className="px-5 py-2.5 text-left font-medium">Buyer / Product</th>
                    <th className="px-3 py-2.5 text-left font-medium">Qty</th>
                    <th className="px-3 py-2.5 text-left font-medium">Target / Budget</th>
                    <th className="px-3 py-2.5 text-left font-medium">Deliver By</th>
                    <th className="px-3 py-2.5 text-left font-medium">Quotes</th>
                    <th className="px-5 py-2.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRfqs.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setOpenRfq(r)}
                      className="cursor-pointer border-t border-bg-border hover:bg-bg-hover/30"
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium">{r.product}</div>
                        <div className="text-[11px] text-ink-tertiary">
                          {r.buyer} · {r.buyerType} · {r.region}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-semibold">{r.qty.toLocaleString()}</td>
                      <td className="px-3 py-3">
                        <div className="text-sm">${r.targetUnit.toFixed(2)}/unit</div>
                        <div className="text-[11px] text-ink-tertiary">{fmtUSD(r.budget)} total</div>
                      </td>
                      <td className="px-3 py-3 text-ink-secondary">{r.deliverBy}</td>
                      <td className="px-3 py-3">
                        <span className="rounded-md bg-bg-hover/60 px-2 py-0.5 text-xs">
                          {r.responses} replies
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${RFQ_TONE[r.status]}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {tab === "orders" && (
            <div className="rounded-xl border border-bg-border bg-bg-card">
              <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
                  <tr className="border-b border-bg-border">
                    <th className="px-5 py-2.5 text-left font-medium">Order</th>
                    <th className="px-3 py-2.5 text-left font-medium">Buyer ↔ Supplier</th>
                    <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                    <th className="px-3 py-2.5 text-right font-medium">Fee</th>
                    <th className="px-3 py-2.5 text-left font-medium">Method</th>
                    <th className="px-5 py-2.5 text-left font-medium">Escrow</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const tone = ESCROW_TONE[o.escrowStatus];
                    const Icon = tone.Icon;
                    return (
                      <tr key={o.id} className="border-t border-bg-border hover:bg-bg-hover/30">
                        <td className="px-5 py-3">
                          <div className="font-medium">{o.product}</div>
                          <div className="text-[11px] text-ink-tertiary">
                            {o.id.toUpperCase()} · {o.qty.toLocaleString()} units · {o.placedAt}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-xs">{o.buyer}</div>
                          <div className="text-[11px] text-ink-tertiary">↔ {o.supplier}</div>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold">{fmtUSD(o.amount)}</td>
                        <td className="px-3 py-3 text-right text-brand-200">
                          {fmtUSD(o.fee)}
                          <div className="text-[10px] text-ink-tertiary">
                            {(o.feeRate * 100).toFixed(1)}%
                          </div>
                        </td>
                        <td className="px-3 py-3 text-ink-secondary">
                          <div className="flex items-center gap-1">
                            <CreditCard className="h-3 w-3 text-ink-tertiary" />
                            {o.paymentMethod}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`flex w-fit items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium ${tone.bg} ${tone.text}`}
                          >
                            <Icon className="h-3 w-3" />
                            {o.escrowStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
            <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-brand-300" /> Live Activity
              </div>
              <span className="flex items-center gap-1 text-[10px] text-accent-green">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-green shadow-[0_0_8px_#22c55e]" />
                Live
              </span>
            </div>
            <ul className="divide-y divide-bg-border text-xs">
              {activity.map((a, i) => (
                <li key={i} className="flex items-start gap-2 px-5 py-2.5">
                  <span
                    className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${ACT_DOT[a.tone]}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-ink-secondary">{a.text}</div>
                    <div className="text-[10px] text-ink-tertiary">{a.ago}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand-200">
              <Banknote className="h-4 w-4" /> Trade Finance
            </div>
            <p className="mt-1 text-xs text-ink-secondary">
              Buyers can finance large POs with 30/60/90 day terms. Platform earns spread on every financed transaction.
            </p>
            <button className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-300 hover:text-brand-200">
              Apply for terms <ArrowDownToLine className="h-3 w-3" />
            </button>
          </div>

          <div className="rounded-xl border border-bg-border bg-bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="h-4 w-4 text-accent-amber" /> Escrow Policy
            </div>
            <ul className="mt-2 space-y-1 text-[11px] text-ink-secondary">
              <li>• Funds locked at order placement</li>
              <li>• Auto-release 7d after delivery confirmed</li>
              <li>• Disputes paused until reviewed</li>
              <li>• Platform fee: 2% (2.5% under $5K)</li>
            </ul>
          </div>
        </aside>
      </div>

      <Drawer
        open={!!openListing}
        onClose={() => setOpenListing(null)}
        title="Marketplace Listing"
      >
        {openListing && (
          <ListingDetail
            l={openListing}
            onOrder={handlePlaceOrder}
            onSample={handleOrderSample}
            onMessage={handleMessageSupplier}
          />
        )}
      </Drawer>
      <Drawer
        open={!!openRfq}
        onClose={() => setOpenRfq(null)}
        title="Request for Quote"
        width="max-w-2xl"
      >
        {openRfq && <RFQDetail r={openRfq} onAward={handleAwardRfq} />}
      </Drawer>

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="pointer-events-auto rounded-lg border border-accent-green/40 bg-bg-panel px-4 py-2.5 text-xs shadow-2xl shadow-accent-green/20">
            <span className="font-semibold text-accent-green">✓</span>{" "}
            <span className="text-ink-secondary">{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-bg-border bg-bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className="mt-1 text-base font-semibold">{value}</div>
      {hint && <div className="text-[11px] text-ink-tertiary">{hint}</div>}
    </div>
  );
}

function Kpi({
  label,
  value,
  delta,
  Icon,
  tone,
  href,
}: {
  label: string;
  value: string;
  delta: string;
  Icon: React.ComponentType<{ className?: string }>;
  tone: "brand" | "green" | "amber" | "blue";
  href?: string;
}) {
  const map = {
    brand: { bg: "bg-brand-500/15", text: "text-brand-300", ring: "hover:ring-brand-500/40" },
    green: { bg: "bg-accent-green/15", text: "text-accent-green", ring: "hover:ring-accent-green/40" },
    amber: { bg: "bg-accent-amber/15", text: "text-accent-amber", ring: "hover:ring-accent-amber/40" },
    blue: { bg: "bg-accent-blue/15", text: "text-accent-blue", ring: "hover:ring-accent-blue/40" },
  };
  const t = map[tone];
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <div className={`grid h-9 w-9 place-items-center rounded-lg ${t.bg}`}>
          <Icon className={`h-4 w-4 ${t.text}`} />
        </div>
        <span className="text-[11px] text-ink-tertiary">{delta}</span>
      </div>
      <div className="mt-3 text-[11px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={`group block rounded-xl border border-bg-border bg-bg-card p-4 ring-1 ring-transparent transition-all hover:bg-bg-hover ${t.ring}`}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      {inner}
    </div>
  );
}
