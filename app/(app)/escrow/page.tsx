"use client";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Landmark,
  Loader2,
  Lock,
  Package,
  ShieldCheck,
  Sparkles,
  Truck,
  Unlock,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";

type TxnState =
  | "draft" | "proposed" | "signed" | "payment_pending" | "escrow_held"
  | "shipped" | "delivered" | "released" | "completed" | "disputed"
  | "refunded" | "cancelled";

type TxnEvent = { ts: string; from: TxnState | null; to: TxnState; actor: string; detail?: string };

type Transaction = {
  id: string;
  buyerCompany: string;
  buyerName: string;
  productName: string;
  quantity: number;
  productTotalCents: number;
  platformFeeCents: number;
  escrowFeeCents: number;
  supplierPayoutCents: number;
  state: TxnState;
  stateHistory: TxnEvent[];
  supplierName?: string;
  carrierName?: string;
  trackingNumber?: string;
  escrowStartedAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  escrowReleasedAt?: string;
  disputedAt?: string;
  paymentReceivedAt?: string;
  shareToken: string;
  createdAt: string;
};

type EscrowFilter = "all" | "holding" | "in_transit" | "released" | "disputed";

const FILTERS: { key: EscrowFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "holding", label: "Holding" },
  { key: "in_transit", label: "In Transit" },
  { key: "released", label: "Released" },
  { key: "disputed", label: "Disputed" },
];

function bucketOf(s: TxnState): EscrowFilter | null {
  if (s === "escrow_held") return "holding";
  if (s === "shipped" || s === "delivered") return "in_transit";
  if (s === "released" || s === "completed") return "released";
  if (s === "disputed") return "disputed";
  return null; // draft/proposed/signed/payment_pending/refunded/cancelled — not in escrow lens
}

const STATUS_CONF: Record<EscrowFilter, { bg: string; text: string; border: string; label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  all: { bg: "bg-bg-hover", text: "text-ink-secondary", border: "border-bg-border", label: "All", Icon: Landmark },
  holding: { bg: "bg-brand-500/15", text: "text-brand-200", border: "border-brand-500/40", label: "Funds Held", Icon: Lock },
  in_transit: { bg: "bg-accent-amber/15", text: "text-accent-amber", border: "border-accent-amber/40", label: "In Transit", Icon: Truck },
  released: { bg: "bg-accent-green/15", text: "text-accent-green", border: "border-accent-green/40", label: "Funds Released", Icon: Unlock },
  disputed: { bg: "bg-accent-red/15", text: "text-accent-red", border: "border-accent-red/40", label: "Disputed", Icon: AlertTriangle },
};

function fmtCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function relTime(iso?: string): string {
  if (!iso) return "—";
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

export default function EscrowPage() {
  const { toast } = useToast();
  const [txns, setTxns] = useState<Transaction[] | null>(null);
  const [filter, setFilter] = useState<EscrowFilter>("all");
  const [releasing, setReleasing] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await fetch("/api/transactions", { cache: "no-store" });
      if (!r.ok) {
        setTxns([]);
        return;
      }
      const d = await r.json();
      setTxns(d.transactions ?? []);
    } catch {
      setTxns([]);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, []);

  // Only transactions in an escrow-relevant state
  const escrowTxns = useMemo(() => {
    return (txns ?? []).filter((t) => bucketOf(t.state) !== null);
  }, [txns]);

  const visible = useMemo(() => {
    if (filter === "all") return escrowTxns;
    return escrowTxns.filter((t) => bucketOf(t.state) === filter);
  }, [escrowTxns, filter]);

  const totals = useMemo(() => {
    const held = escrowTxns
      .filter((t) => t.state === "escrow_held" || t.state === "shipped" || t.state === "delivered")
      .reduce((s, t) => s + t.productTotalCents, 0);
    const released = escrowTxns
      .filter((t) => t.state === "released" || t.state === "completed")
      .reduce((s, t) => s + t.supplierPayoutCents, 0);
    const fees = escrowTxns
      .filter((t) => t.state === "released" || t.state === "completed")
      .reduce((s, t) => s + t.escrowFeeCents, 0);
    const disputed = escrowTxns
      .filter((t) => t.state === "disputed")
      .reduce((s, t) => s + t.productTotalCents, 0);
    return { heldCents: held, releasedCents: released, feesCents: fees, disputedCents: disputed };
  }, [escrowTxns]);

  async function handleRelease(t: Transaction) {
    setReleasing(t.id);
    try {
      const r = await fetch(`/api/transactions/${t.id}/release`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast(`Release failed: ${d.error ?? r.statusText}`, "error");
      } else {
        toast(`Escrow released — supplier paid ${fmtCents(t.supplierPayoutCents)}`);
        await load();
      }
    } catch (e) {
      toast(`Release failed: ${e instanceof Error ? e.message : "network error"}`, "error");
    } finally {
      setReleasing(null);
    }
  }

  // ── Empty state ─────────────────────────────────────────────────────
  if (txns && escrowTxns.length === 0) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Landmark className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Escrow Center</h1>
            <p className="text-xs text-ink-secondary">
              Buyer funds held · milestone verification · automated supplier payouts via Stripe Connect
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-500/5 to-transparent p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/15">
            <ShieldCheck className="h-7 w-7 text-brand-300" />
          </div>
          <div className="mt-4 text-base font-semibold">No escrow accounts yet</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-secondary">
            Escrow holds funds when a buyer pays. Once a transaction reaches{" "}
            <strong className="text-brand-200">escrow_held</strong>, it appears here with milestone tracking.
            Either accept a quote on /deals or run a pipeline to start a transaction.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/deals"
              className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-xs font-semibold shadow-glow"
            >
              <Sparkles className="h-3 w-3" /> Open Deals
            </Link>
            <Link
              href="/transactions"
              className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-xs hover:bg-bg-hover"
            >
              View All Transactions <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Money flow explainer */}
        <MoneyFlowExplainer />
      </div>
    );
  }

  // ── Active state ────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Landmark className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Escrow Center</h1>
            <p className="text-xs text-ink-secondary">
              {escrowTxns.length} escrow{escrowTxns.length === 1 ? "" : "s"} · {fmtCents(totals.heldCents)} held · {fmtCents(totals.releasedCents)} released to suppliers
            </p>
          </div>
        </div>
        <Link
          href="/transactions"
          className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
        >
          All Transactions <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Currently Held" value={fmtCents(totals.heldCents)} sub="Awaiting delivery confirmation" tone="brand" Icon={Lock} href="/transactions" cta="View held" />
        <StatCard label="Released to Suppliers" value={fmtCents(totals.releasedCents)} sub="Lifetime payouts" tone="green" Icon={Unlock} href="/earnings" cta="See payouts" />
        <StatCard label="Escrow Fees Collected" value={fmtCents(totals.feesCents)} sub="Lifetime" tone="default" Icon={Landmark} href="/earnings" cta="Open earnings" />
        <StatCard label="Disputed" value={fmtCents(totals.disputedCents)} sub="Frozen pending resolution" tone={totals.disputedCents > 0 ? "red" : "default"} Icon={AlertTriangle} href="/transactions" cta="Review disputes" />
      </div>

      <div className="flex flex-wrap items-center gap-1 w-fit rounded-lg border border-bg-border bg-bg-card p-1 text-xs">
        {FILTERS.map((f) => {
          const count = f.key === "all" ? escrowTxns.length : escrowTxns.filter((t) => bucketOf(t.state) === f.key).length;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-3 py-1.5 ${
                filter === f.key
                  ? "bg-brand-500/15 text-brand-200"
                  : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
              }`}
            >
              {f.label} <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {visible.map((t) => {
          const bucket = bucketOf(t.state) ?? "all";
          const conf = STATUS_CONF[bucket];
          const eligibleForRelease = t.state === "delivered";
          return (
            <div key={t.id} className={`rounded-xl border bg-bg-card p-5 ${conf.border}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${conf.bg}`}>
                    <conf.Icon className={`h-5 w-5 ${conf.text}`} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-ink-tertiary">{t.id.slice(0, 14)}…</span>
                      <span className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${conf.bg} ${conf.text}`}>
                        {conf.label}
                      </span>
                      <span className="text-[10px] text-ink-tertiary uppercase tracking-wider">{t.state.replace(/_/g, " ")}</span>
                    </div>
                    <div className="mt-1 font-semibold">
                      {t.buyerCompany} → {t.supplierName ?? "Supplier"}
                    </div>
                    <div className="text-[11px] text-ink-tertiary">
                      {t.productName} × {t.quantity.toLocaleString()}
                      {t.carrierName && t.trackingNumber && ` · ${t.carrierName} #${t.trackingNumber}`}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold">{fmtCents(t.productTotalCents)}</div>
                  <div className="text-[11px] text-ink-tertiary">
                    Platform <span className="text-accent-green">{fmtCents(t.platformFeeCents)}</span>
                    {" · "}Escrow <span className="text-brand-300">{fmtCents(t.escrowFeeCents)}</span>
                  </div>
                  <div className="text-[11px] text-ink-tertiary">Supplier out: {fmtCents(t.supplierPayoutCents)}</div>
                </div>
              </div>

              {/* Milestones — derived from real state machine */}
              <Milestones t={t} />

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-bg-border pt-3 text-[11px] text-ink-tertiary">
                <span>
                  {t.escrowStartedAt && <>Held {relTime(t.escrowStartedAt)} · </>}
                  {t.shippedAt && <>Shipped {relTime(t.shippedAt)} · </>}
                  {t.deliveredAt && <>Delivered {relTime(t.deliveredAt)} · </>}
                  {t.escrowReleasedAt && <>Released {relTime(t.escrowReleasedAt)}</>}
                </span>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/transactions`}
                    className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card px-3 py-1.5 hover:bg-bg-hover text-[11px]"
                  >
                    Manage in Transactions <ArrowRight className="h-3 w-3" />
                  </Link>
                  {eligibleForRelease && (
                    <button
                      onClick={() => handleRelease(t)}
                      disabled={releasing === t.id}
                      className="flex items-center gap-1.5 rounded-md bg-gradient-brand px-3 py-1.5 text-[11px] font-semibold shadow-glow disabled:opacity-60"
                    >
                      {releasing === t.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Unlock className="h-3 w-3" />
                      )}
                      Release Funds
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Money flow explainer at the bottom */}
      <MoneyFlowExplainer />
    </div>
  );
}

function Milestones({ t }: { t: Transaction }) {
  const stages: { label: string; condition: string; reached: boolean; current: boolean }[] = [
    { label: "Buyer Signed", condition: "Clickwrap or DocuSign captured", reached: !!t.stateHistory.find((e) => e.to === "signed"), current: t.state === "signed" },
    { label: "Payment Deposited", condition: `${fmtCents(t.productTotalCents)} received`, reached: !!t.stateHistory.find((e) => e.to === "escrow_held"), current: t.state === "escrow_held" },
    { label: "Shipped", condition: "Carrier scan received", reached: !!t.stateHistory.find((e) => e.to === "shipped"), current: t.state === "shipped" },
    { label: "Delivery Confirmed", condition: "Buyer or operator marks delivered", reached: !!t.stateHistory.find((e) => e.to === "delivered"), current: t.state === "delivered" },
    { label: "Funds Released", condition: "Supplier paid via Stripe Connect", reached: !!t.stateHistory.find((e) => e.to === "released") || t.state === "completed", current: t.state === "released" },
  ];
  return (
    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-5">
      {stages.map((s) => (
        <div
          key={s.label}
          className={`rounded-md border p-2.5 ${
            s.reached
              ? "border-accent-green/40 bg-accent-green/5"
              : s.current
              ? "border-brand-500/40 bg-brand-500/5"
              : "border-bg-border bg-bg-hover/30"
          }`}
        >
          <div className="flex items-center gap-1.5">
            {s.reached ? (
              <CheckCircle2 className="h-3 w-3 text-accent-green" />
            ) : s.current ? (
              <Loader2 className="h-3 w-3 animate-spin text-brand-300" />
            ) : (
              <Clock className="h-3 w-3 text-ink-tertiary" />
            )}
            <span className={`text-[11px] font-semibold ${s.reached ? "text-accent-green" : s.current ? "text-brand-200" : "text-ink-tertiary"}`}>
              {s.label}
            </span>
          </div>
          <div className="mt-0.5 text-[10px] text-ink-tertiary">{s.condition}</div>
        </div>
      ))}
    </div>
  );
}

function StatCard({
  label, value, sub, tone, Icon, href, cta,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "default" | "brand" | "green" | "red";
  Icon: React.ComponentType<{ className?: string }>;
  href?: string;
  cta?: string;
}) {
  const valueClass =
    tone === "brand" ? "text-brand-200" :
    tone === "green" ? "text-accent-green" :
    tone === "red" ? "text-accent-red" : "";
  const ringClass =
    tone === "brand" ? "hover:ring-brand-500/40" :
    tone === "green" ? "hover:ring-accent-green/40" :
    tone === "red" ? "hover:ring-accent-red/40" : "hover:ring-bg-border";
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
        <Icon className="h-3.5 w-3.5 text-ink-tertiary" />
      </div>
      <div className={`mt-1 text-2xl font-bold ${valueClass}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-ink-tertiary">{sub}</div>
      {href && cta && (
        <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary group-hover:text-ink-primary transition-colors">
          {cta} <ArrowRight className="h-3 w-3" />
        </div>
      )}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={`group block rounded-xl border border-bg-border bg-bg-card p-4 ring-1 ring-transparent transition-all hover:bg-bg-hover ${ringClass}`}
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

function MoneyFlowExplainer() {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5">
      <div className="mb-3 text-sm font-semibold">How escrow protects every transaction</div>
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
        {[
          { label: "Buyer", sub: "pays platform", Icon: Users, color: "bg-accent-blue/15 text-accent-blue" },
          { arrow: true },
          { label: "AVYN Escrow", sub: "holds funds securely", Icon: Landmark, color: "bg-brand-500/15 text-brand-200", highlight: true },
          { arrow: true },
          { label: "Milestone Check", sub: "AI verifies delivery", Icon: ShieldCheck, color: "bg-accent-amber/15 text-accent-amber" },
          { arrow: true },
          { label: "Supplier", sub: "receives payout", Icon: Package, color: "bg-accent-green/15 text-accent-green" },
        ].map((item, i) =>
          "arrow" in item ? (
            <ArrowRight key={i} className="h-4 w-4 text-ink-tertiary" />
          ) : (
            <div
              key={i}
              className={`flex items-center gap-2 rounded-lg border ${
                "highlight" in item && item.highlight ? "border-brand-500/40 shadow-glow" : "border-bg-border"
              } bg-bg-hover/30 px-3 py-2`}
            >
              <div className={`grid h-7 w-7 place-items-center rounded-md ${item.color}`}>
                <item.Icon className="h-3.5 w-3.5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold">{item.label}</div>
                <div className="text-[9px] text-ink-tertiary">{item.sub}</div>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
