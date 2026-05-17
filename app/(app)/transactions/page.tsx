"use client";
import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Clock,
  CreditCard,
  DollarSign,
  Eye,
  FileText,
  Landmark,
  Loader2,
  Package,
  PauseCircle,
  RefreshCw,
  ScrollText,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Truck,
  XCircle,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";

// ─────────────────────────────────────────────────────────────────────────────
// Types — must match lib/store.ts Transaction shape
// ─────────────────────────────────────────────────────────────────────────────

type TransactionState =
  | "draft"
  | "proposed"
  | "signed"
  | "payment_pending"
  | "escrow_held"
  | "shipped"
  | "delivered"
  | "released"
  | "completed"
  | "disputed"
  | "refunded"
  | "cancelled";

type TransactionEvent = {
  ts: string;
  from: TransactionState | null;
  to: TransactionState;
  actor: "operator" | "buyer" | "system" | "stripe";
  detail?: string;
  meta?: Record<string, any>;
};

type Transaction = {
  id: string;
  quoteId: string;
  buyerCompany: string;
  buyerName: string;
  buyerEmail?: string;
  productName: string;
  unitPriceCents: number;
  quantity: number;
  productTotalCents: number;
  platformFeeCents: number;
  escrowFeeCents: number;
  supplierPayoutCents: number;
  paymentTerms: string;
  shippingTerms: string;
  leadTimeDays: number;
  state: TransactionState;
  stateHistory: TransactionEvent[];
  createdAt: string;
  updatedAt: string;
  carrierName?: string;
  trackingNumber?: string;
  shippedAt?: string;
  deliveredAt?: string;
  disputedAt?: string;
  disputeReason?: string;
  disputeResolution?: "refund_buyer" | "release_supplier" | "split" | "pending";
  disputeResolutionNotes?: string;
  operatorNotes?: string;
  operatorNotesUpdatedAt?: string;
  paymentMethodLast4?: string;
  shareToken: string;
  aiConfidenceScore?: number;
  supplierName?: string;
  supplierStripeAccountId?: string;
  // Slice 49: freight estimate propagated from Quote.freightEstimate
  // when slice 47 quote-accept ran. Optional -- legacy txns or
  // accepts without destination won't have it.
  freightEstimate?: {
    provider: "shippo" | "fallback";
    laneKey: string;
    rates: Array<{
      mode: string;
      estimateUsd: number;
      transitDaysMin: number;
      transitDaysMax: number;
      notes?: string;
    }>;
    computedAt: string;
  };
  // Slice 66+67: snapshot of what the buyer previewed via
  // /api/quotes/[id]/freight-preview before accepting. Tells the
  // operator which destinations buyer was considering.
  freightPreview?: {
    previewedAt: string;
    destCountry: string;
    destState?: string;
    provider: "shippo" | "fallback";
    cheapestMode: string;
    cheapestUsd: number;
    transitDaysMin: number;
    transitDaysMax: number;
    rateCount: number;
  };
};

type RevenueStats = {
  totalPlatformFeesCents: number;
  totalEscrowFeesCents: number;
  totalSupplierPayoutsCents: number;
  totalRefundsCents: number;
  netPlatformRevenueCents: number;
  inFlightEscrowCents: number;
  byMonth: { month: string; platformFeesCents: number; escrowFeesCents: number }[];
  txnsByState: Record<TransactionState, number>;
};

type Modes = {
  payment: { mode: "simulated" | "sandbox" | "live"; platformFeeBps: number; escrowFeeBps: number };
  contract: "in-app" | "docusign";
  shipping: "manual" | "shippo";
};

// ─────────────────────────────────────────────────────────────────────────────
// State machine display config
// ─────────────────────────────────────────────────────────────────────────────

const STATE_CONFIG: Record<
  TransactionState,
  { label: string; tone: "neutral" | "blue" | "amber" | "green" | "red"; Icon: React.ComponentType<{ className?: string }> }
> = {
  draft:           { label: "Draft",            tone: "neutral", Icon: FileText      },
  proposed:        { label: "Proposed",         tone: "blue",    Icon: Send          },
  signed:          { label: "Signed",           tone: "blue",    Icon: ScrollText    },
  payment_pending: { label: "Payment Pending",  tone: "amber",   Icon: Clock         },
  escrow_held:     { label: "Escrow Held",      tone: "amber",   Icon: Landmark      },
  shipped:         { label: "Shipped",          tone: "blue",    Icon: Truck         },
  delivered:       { label: "Delivered",        tone: "blue",    Icon: Package       },
  released:        { label: "Released",         tone: "green",   Icon: Banknote      },
  completed:       { label: "Completed",        tone: "green",   Icon: CheckCircle2  },
  disputed:        { label: "Disputed",         tone: "red",     Icon: ShieldAlert   },
  refunded:        { label: "Refunded",         tone: "neutral", Icon: RefreshCw     },
  cancelled:       { label: "Cancelled",        tone: "neutral", Icon: XCircle       },
};

const TONE_CLASS: Record<string, { bg: string; text: string; dot: string }> = {
  neutral: { bg: "bg-bg-hover",         text: "text-ink-secondary", dot: "bg-ink-tertiary" },
  blue:    { bg: "bg-accent-blue/15",   text: "text-accent-blue",   dot: "bg-accent-blue"  },
  amber:   { bg: "bg-accent-amber/15",  text: "text-accent-amber",  dot: "bg-accent-amber" },
  green:   { bg: "bg-accent-green/15",  text: "text-accent-green",  dot: "bg-accent-green" },
  red:     { bg: "bg-accent-red/15",    text: "text-accent-red",    dot: "bg-accent-red"   },
};

const STAGE_ORDER: TransactionState[] = [
  "draft",
  "proposed",
  "signed",
  "payment_pending",
  "escrow_held",
  "shipped",
  "delivered",
  "released",
  "completed",
];

const FILTERS: { key: "all" | "active" | "in_escrow" | "disputed" | "completed" | "cancelled"; label: string }[] = [
  { key: "all",        label: "All" },
  { key: "active",     label: "Active" },
  { key: "in_escrow",  label: "In Escrow" },
  { key: "disputed",   label: "Disputed" },
  { key: "completed",  label: "Completed" },
  { key: "cancelled",  label: "Cancelled" },
];

function fmtCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const { toast } = useToast();
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [modes, setModes] = useState<Modes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<typeof FILTERS[number]["key"]>("all");
  const [busy, setBusy] = useState<string | null>(null); // txnId-action key

  const load = useCallback(async () => {
    try {
      const [listRes, statsRes] = await Promise.all([
        fetch("/api/transactions", { cache: "no-store" }),
        fetch("/api/transactions/stats", { cache: "no-store" }),
      ]);
      if (!listRes.ok) throw new Error(`List ${listRes.status}`);
      if (!statsRes.ok) throw new Error(`Stats ${statsRes.status}`);
      const listData = await listRes.json();
      const statsData = await statsRes.json();
      setTxns(listData.transactions ?? []);
      setStats(statsData.stats);
      setModes(statsData.modes);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  async function action(txnId: string, path: string, body?: any, label?: string) {
    const key = `${txnId}-${path}`;
    setBusy(key);
    try {
      const res = await fetch(`/api/transactions/${txnId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      // ── Slice 43: refund-cap gate UI ─────────────────────────────
      // The /resolve endpoint returns 412 with gatedBy="team-prefs-
      // refund-cap" when the teammate's onboarding refund cap is
      // exceeded. Surface a confirm prompt with the cap + attempted
      // amount + offer to override + retry.
      if (res.status === 412 && data.gatedBy === "team-prefs-refund-cap") {
        const ok = window.confirm(
          `Refund cap exceeded\n\n` +
            `This refund is $${data.attempted?.toFixed?.(2) ?? "?"} but your approval cap is $${data.cap}.\n\n` +
            `OK = override + send anyway (audit trail will record the override).\n` +
            `Cancel = abort.`,
        );
        if (ok) {
          // Retry with overrideCap:true
          const retry = await fetch(`/api/transactions/${txnId}/${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...(body ?? {}), overrideCap: true }),
          });
          const retryData = await retry.json().catch(() => ({}));
          if (!retry.ok) {
            toast(`${label ?? path} failed: ${retryData.error ?? retry.statusText}`);
            return;
          }
          toast(`${label ?? path} ✓ (cap overridden)`);
          await load();
          return;
        }
        toast("Aborted — refund not issued");
        return;
      }
      if (!res.ok) {
        toast(`${label ?? path} failed: ${data.error ?? res.statusText}`);
        return;
      }
      toast(`${label ?? path} ✓`);
      await load();
    } catch (e) {
      toast(`Network error: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(null);
    }
  }

  function copyBuyerLink(t: Transaction) {
    const url = `${window.location.origin}/transaction/${t.id}?t=${t.shareToken}`;
    navigator.clipboard.writeText(url).then(
      () => toast(`Buyer link copied — ${t.buyerCompany}`),
      () => toast("Clipboard blocked"),
    );
  }

  const filtered = useMemo(() => {
    if (filter === "all") return txns;
    if (filter === "active") return txns.filter((t) => !["completed", "cancelled", "refunded"].includes(t.state));
    if (filter === "in_escrow") return txns.filter((t) => ["escrow_held", "shipped", "delivered"].includes(t.state));
    if (filter === "disputed") return txns.filter((t) => t.state === "disputed");
    if (filter === "completed") return txns.filter((t) => t.state === "completed");
    if (filter === "cancelled") return txns.filter((t) => ["cancelled", "refunded"].includes(t.state));
    return txns;
  }, [txns, filter]);

  const counts = useMemo(() => ({
    all:        txns.length,
    active:     txns.filter((t) => !["completed", "cancelled", "refunded"].includes(t.state)).length,
    in_escrow:  txns.filter((t) => ["escrow_held", "shipped", "delivered"].includes(t.state)).length,
    disputed:   txns.filter((t) => t.state === "disputed").length,
    completed:  txns.filter((t) => t.state === "completed").length,
    cancelled:  txns.filter((t) => ["cancelled", "refunded"].includes(t.state)).length,
  }), [txns]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <ArrowLeftRight className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Transaction Orchestration</h1>
            <p className="text-xs text-ink-secondary">
              Live deal lifecycle · escrow · contracts · payouts · dispute protection
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <Link
            href="/earnings"
            className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow"
          >
            <DollarSign className="h-4 w-4" /> Revenue
          </Link>
        </div>
      </div>

      {/* Mode banner */}
      {modes && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-[11px]">
          <ModeBadge label="Payments" value={modes.payment.mode} />
          <ModeBadge label="Contracts" value={modes.contract} />
          <ModeBadge label="Shipping" value={modes.shipping} />
          <span className="text-ink-tertiary">
            · Platform fee {(modes.payment.platformFeeBps / 100).toFixed(1)}%
            · Escrow fee {(modes.payment.escrowFeeBps / 100).toFixed(1)}%
          </span>
          {modes.payment.mode === "simulated" && (
            <span className="ml-auto flex items-center gap-1 text-accent-amber">
              <AlertTriangle className="h-3 w-3" />
              No live processor wired — set STRIPE_SECRET_KEY to enable real payments.
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="In-flight Escrow"
          value={stats ? fmtCents(stats.inFlightEscrowCents) : "—"}
          sub="Held by platform until release"
          tone="amber"
          Icon={Landmark}
          href="/escrow"
          cta="Open Escrow Center →"
        />
        <StatCard
          label="Net Platform Revenue"
          value={stats ? fmtCents(stats.netPlatformRevenueCents) : "—"}
          sub={stats ? `${fmtCents(stats.totalPlatformFeesCents)} platform + ${fmtCents(stats.totalEscrowFeesCents)} escrow` : ""}
          tone="green"
          Icon={DollarSign}
          href="/earnings"
          cta="Open Earnings →"
        />
        <StatCard
          label="Active Deals"
          value={String(counts.active)}
          sub={`${counts.disputed} disputed · ${counts.completed} completed`}
          tone={counts.disputed > 0 ? "red" : "brand"}
          Icon={Zap}
          href="/crm"
          cta="Open CRM →"
        />
        <StatCard
          label="Supplier Payouts"
          value={stats ? fmtCents(stats.totalSupplierPayoutsCents) : "—"}
          sub={stats ? `${fmtCents(stats.totalRefundsCents)} refunded` : ""}
          tone="default"
          Icon={Banknote}
          href="/earnings"
          cta="Open Earnings →"
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-1 w-fit rounded-lg border border-bg-border bg-bg-card p-1 text-xs">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-md px-3 py-1.5 ${
              filter === f.key
                ? "bg-brand-500/15 text-brand-200"
                : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
            }`}
          >
            {f.label} <span className="opacity-60">({counts[f.key]})</span>
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Transaction list */}
      {loading && txns.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-bg-border bg-bg-card py-16 text-ink-tertiary">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState filter={filter} totalCount={txns.length} />
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <TxnRow
              key={t.id}
              txn={t}
              expanded={expanded === t.id}
              onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
              onAction={action}
              onCopyLink={() => copyBuyerLink(t)}
              busyKey={busy}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────────────────────

function TxnRow({
  txn, expanded, onToggle, onAction, onCopyLink, busyKey,
}: {
  txn: Transaction;
  expanded: boolean;
  onToggle: () => void;
  onAction: (txnId: string, path: string, body?: any, label?: string) => Promise<void>;
  onCopyLink: () => void;
  busyKey: string | null;
}) {
  const { toast } = useToast();
  const cfg = STATE_CONFIG[txn.state];
  const tone = TONE_CLASS[cfg.tone];
  const stageIdx = STAGE_ORDER.indexOf(txn.state);
  const pct = stageIdx >= 0 ? Math.round((stageIdx / (STAGE_ORDER.length - 1)) * 100) : 0;

  // Forms — local row state
  const [trackingForm, setTrackingForm] = useState({ carrier: "FedEx", trackingNumber: "" });
  const [resolveForm, setResolveForm] = useState<"refund_buyer" | "release_supplier" | "split">("refund_buyer");
  const [resolveNotes, setResolveNotes] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const isBusy = (action: string) => busyKey === `${txn.id}-${action}`;

  return (
    <div
      className={`rounded-xl border bg-bg-card transition ${
        expanded ? "border-brand-500/60 shadow-glow" : "border-bg-border hover:border-brand-500/30"
      }`}
    >
      {/* Header row */}
      <button
        onClick={onToggle}
        className="flex w-full flex-wrap items-start justify-between gap-3 p-5 text-left"
      >
        <div className="flex items-start gap-3">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${tone.bg}`}>
            <cfg.Icon className={`h-5 w-5 ${tone.text}`} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Slice 117: click-to-copy transaction ID. Was static
                  truncated text; now a button that copies the FULL
                  id (Stripe/Connect tickets, support refs, log
                  greps). Tooltip shows the untruncated value. */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(txn.id).then(
                    () => toast("Transaction ID copied"),
                    () => toast("Clipboard blocked"),
                  );
                }}
                title={`Copy ${txn.id}`}
                className="inline-flex items-center gap-1 rounded font-mono text-[11px] text-ink-tertiary hover:bg-bg-hover hover:text-brand-300"
              >
                {txn.id.slice(0, 14)}…
                <Clipboard className="h-2.5 w-2.5" />
              </button>
              <span className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${tone.bg} ${tone.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                {cfg.label}
              </span>
              {txn.aiConfidenceScore !== undefined && (
                <span className="flex items-center gap-1 rounded-md bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold text-brand-200">
                  <Sparkles className="h-2.5 w-2.5" /> AI {txn.aiConfidenceScore}
                </span>
              )}
            </div>
            <div className="mt-1 font-semibold">{txn.buyerCompany}</div>
            <div className="text-[11px] text-ink-tertiary">
              {txn.buyerName} · {txn.productName} × {txn.quantity.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="text-right">
            <div className="text-xl font-bold">{fmtCents(txn.productTotalCents)}</div>
            <div className="text-[11px] text-ink-tertiary">
              Platform <span className="font-medium text-accent-green">{fmtCents(txn.platformFeeCents)}</span>
              {" · "}Supplier <span className="text-brand-300">{fmtCents(txn.supplierPayoutCents)}</span>
            </div>
            <div className="text-[10px] text-ink-tertiary">Updated {relTime(txn.updatedAt)}</div>
          </div>
          {expanded ? <ChevronDown className="h-4 w-4 mt-1 text-ink-tertiary" /> : <ChevronRight className="h-4 w-4 mt-1 text-ink-tertiary" />}
        </div>
      </button>

      {/* Progress bar */}
      <div className="px-5 pb-3">
        <div className="mb-1 flex items-center justify-between text-[10px] text-ink-tertiary">
          <span>{cfg.label}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-bg-hover">
          <div
            className={`h-full rounded-full transition-all ${
              txn.state === "disputed"
                ? "bg-accent-red"
                : txn.state === "completed"
                ? "bg-accent-green"
                : "bg-gradient-brand"
            }`}
            style={{ width: `${stageIdx >= 0 ? pct : 4}%` }}
          />
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-bg-border p-5 space-y-4">
          {/* Money breakdown */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Buyer Pays" value={fmtCents(txn.productTotalCents)} />
            <MiniStat label="Platform Fee" value={fmtCents(txn.platformFeeCents)} tone="green" />
            <MiniStat label="Escrow Fee" value={fmtCents(txn.escrowFeeCents)} tone="brand" />
            <MiniStat label="Supplier Out" value={fmtCents(txn.supplierPayoutCents)} />
          </div>

          {/* Slice 49: freight estimate panel -- shown when slice 47
              auto-attached an estimate at quote-accept time. Renders
              cheapest mode + cost + transit days + provider source.
              Slice 75: Recompute button -- re-hits estimateLane()
              against the current supplier+destination so an estimate
              that's been sitting stale for days can be refreshed. */}
          {txn.freightEstimate && txn.freightEstimate.rates.length > 0 && (
            <FreightPanel
              estimate={txn.freightEstimate}
              txnId={txn.id}
              onRecompute={onAction}
              busyKey={busyKey}
            />
          )}

          {/* Slice 66+67: buyer-side preview snapshot. Distinct from
              the panel above (operator-side estimate at acceptance) --
              this shows what the BUYER saw on /quote/[id] while still
              evaluating. Compact one-line row, intentionally low-key. */}
          {txn.freightPreview && (
            <div className="rounded-lg border border-bg-border bg-bg-hover/30 px-3 py-2 text-[11px] text-ink-secondary">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                Buyer preview
              </span>
              <span className="ml-2">
                {txn.freightPreview.destCountry}
                {txn.freightPreview.destState ? `-${txn.freightPreview.destState}` : ""}
                {" · cheapest "}
                <span className="font-mono">{txn.freightPreview.cheapestMode}</span>
                {" · "}
                <span className="font-semibold text-ink-primary">
                  ${txn.freightPreview.cheapestUsd.toLocaleString()}
                </span>
                {" · "}
                {txn.freightPreview.transitDaysMin}-{txn.freightPreview.transitDaysMax}d transit
                {" · "}
                <span className="text-ink-tertiary">
                  {txn.freightPreview.rateCount} mode{txn.freightPreview.rateCount === 1 ? "" : "s"} ·{" "}
                  {txn.freightPreview.provider}
                </span>
              </span>
            </div>
          )}

          {/* Stripe Connect supplier onboarding */}
          <SupplierConnectPanel txn={txn} />

          {/* Operator notes — free-form scratchpad, private to operators */}
          <OperatorNotes txn={txn} />

          {/* Action panel — varies by state */}
          <ActionPanel
            txn={txn}
            isBusy={isBusy}
            trackingForm={trackingForm}
            setTrackingForm={setTrackingForm}
            resolveForm={resolveForm}
            setResolveForm={setResolveForm}
            resolveNotes={resolveNotes}
            setResolveNotes={setResolveNotes}
            cancelReason={cancelReason}
            setCancelReason={setCancelReason}
            onAction={onAction}
            onCopyLink={onCopyLink}
          />

          {/* Timeline */}
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Activity Timeline
            </div>
            <div className="space-y-1.5">
              {txn.stateHistory.slice(-8).reverse().map((ev, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <div className={`h-4 w-4 mt-0.5 shrink-0 grid place-items-center rounded-full ${TONE_CLASS[STATE_CONFIG[ev.to].tone].bg}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${TONE_CLASS[STATE_CONFIG[ev.to].tone].dot}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{ev.from ? `${STATE_CONFIG[ev.from].label} → ` : ""}{STATE_CONFIG[ev.to].label}</span>
                      <span className="rounded-sm bg-bg-hover px-1 py-0.5 text-[9px] uppercase text-ink-tertiary">{ev.actor}</span>
                      <span className="text-ink-tertiary">· {relTime(ev.ts)}</span>
                    </div>
                    {ev.detail && <div className="text-ink-tertiary truncate">{ev.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Action panel — state-specific
// ─────────────────────────────────────────────────────────────────────────────

function ActionPanel({
  txn, isBusy, trackingForm, setTrackingForm, resolveForm, setResolveForm,
  resolveNotes, setResolveNotes, cancelReason, setCancelReason, onAction, onCopyLink,
}: {
  txn: Transaction;
  isBusy: (action: string) => boolean;
  trackingForm: { carrier: string; trackingNumber: string };
  setTrackingForm: (v: { carrier: string; trackingNumber: string }) => void;
  resolveForm: "refund_buyer" | "release_supplier" | "split";
  setResolveForm: (v: "refund_buyer" | "release_supplier" | "split") => void;
  resolveNotes: string;
  setResolveNotes: (v: string) => void;
  cancelReason: string;
  setCancelReason: (v: string) => void;
  onAction: (txnId: string, path: string, body?: any, label?: string) => Promise<void>;
  onCopyLink: () => void;
}) {
  const buyerLinkBtn = (
    <button
      onClick={onCopyLink}
      className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-xs hover:bg-bg-hover"
    >
      <Clipboard className="h-3 w-3" /> Copy Buyer Link
    </button>
  );

  const viewBtn = (
    <Link
      href={`/transaction/${txn.id}?t=${txn.shareToken}`}
      target="_blank"
      className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-xs hover:bg-bg-hover"
    >
      <Eye className="h-3 w-3" /> Preview Buyer View
    </Link>
  );

  const cancellable = ["draft", "proposed", "signed", "payment_pending"].includes(txn.state);

  return (
    <div className="rounded-lg border border-bg-border bg-bg-hover/30 p-3">
      {txn.state === "draft" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-ink-secondary">Send proposal to buyer to start signature flow.</span>
          <button
            disabled={isBusy("send")}
            onClick={() => onAction(txn.id, "send", undefined, "Proposal sent")}
            className="flex items-center gap-1.5 rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow disabled:opacity-50"
          >
            {isBusy("send") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Send Proposal
          </button>
          {buyerLinkBtn}
          {viewBtn}
        </div>
      )}

      {txn.state === "proposed" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-ink-secondary">Awaiting buyer signature. Share the buyer link.</span>
          {buyerLinkBtn}
          {viewBtn}
        </div>
      )}

      {txn.state === "signed" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-ink-secondary">Signed — buyer must complete payment.</span>
          {buyerLinkBtn}
          {viewBtn}
        </div>
      )}

      {txn.state === "payment_pending" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-accent-amber">
            <Clock className="inline h-3 w-3" /> Awaiting Stripe webhook. Refund/cancel available.
          </span>
          {buyerLinkBtn}
        </div>
      )}

      {txn.state === "escrow_held" && (
        <div className="space-y-2">
          <div className="text-[11px] text-ink-secondary">
            <ShieldCheck className="inline h-3 w-3 text-accent-green" /> Funds escrowed. Mark shipped to advance.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={trackingForm.carrier}
              onChange={(e) => setTrackingForm({ ...trackingForm, carrier: e.target.value })}
              className="rounded-md border border-bg-border bg-bg-card px-2 py-1 text-xs"
            >
              <option value="FedEx">FedEx</option>
              <option value="UPS">UPS</option>
              <option value="DHL">DHL</option>
              <option value="USPS">USPS</option>
              <option value="Other">Other</option>
            </select>
            <input
              value={trackingForm.trackingNumber}
              onChange={(e) => setTrackingForm({ ...trackingForm, trackingNumber: e.target.value })}
              placeholder="Tracking number"
              className="flex-1 min-w-[160px] rounded-md border border-bg-border bg-bg-card px-2 py-1 text-xs"
            />
            <button
              disabled={isBusy("ship") || !trackingForm.trackingNumber}
              onClick={() => onAction(txn.id, "ship", trackingForm, "Marked shipped")}
              className="flex items-center gap-1.5 rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow disabled:opacity-50"
            >
              {isBusy("ship") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
              Mark Shipped
            </button>
          </div>
        </div>
      )}

      {txn.state === "shipped" && (
        <div className="space-y-2">
          <div className="text-[11px] text-ink-secondary">
            Shipping with {txn.carrierName}{txn.trackingNumber ? ` · #${txn.trackingNumber}` : ""}.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={isBusy("deliver")}
              onClick={() => onAction(txn.id, "deliver", { actor: "operator" }, "Marked delivered")}
              className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-xs hover:bg-bg-hover disabled:opacity-50"
            >
              {isBusy("deliver") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Package className="h-3 w-3" />}
              Confirm Delivered
            </button>
            {buyerLinkBtn}
          </div>
        </div>
      )}

      {txn.state === "delivered" && (() => {
        const deliveredMs = txn.deliveredAt ? new Date(txn.deliveredAt).getTime() : 0;
        const ageMs = deliveredMs ? Date.now() - deliveredMs : 0;
        const autoHours = 168;
        const remainingHours = Math.max(0, autoHours - ageMs / (60 * 60 * 1000));
        const willAutoSoon = remainingHours <= 24 && remainingHours > 0;
        const overdue = remainingHours <= 0;
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-ink-secondary">
                Delivered{txn.deliveredAt ? ` ${relTime(txn.deliveredAt)}` : ""}.
                {overdue ? (
                  <span className="ml-1 text-accent-amber">
                    Eligible for auto-release at next cron tick.
                  </span>
                ) : willAutoSoon ? (
                  <span className="ml-1 text-accent-amber">
                    Auto-releases in ~{Math.ceil(remainingHours)}h if no dispute.
                  </span>
                ) : (
                  <span className="ml-1 text-ink-tertiary">
                    Auto-releases in ~{Math.ceil(remainingHours / 24)}d if no dispute.
                  </span>
                )}
              </span>
              <button
                disabled={isBusy("release")}
                onClick={() => onAction(txn.id, "release", undefined, "Funds released")}
                className="flex items-center gap-1.5 rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow disabled:opacity-50"
              >
                {isBusy("release") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Banknote className="h-3 w-3" />}
                Release Now
              </button>
              {buyerLinkBtn}
            </div>
          </div>
        );
      })()}

      {txn.state === "disputed" && (
        <div className="space-y-2">
          <div className="rounded-md border border-accent-red/40 bg-accent-red/10 p-2 text-[11px] text-accent-red">
            <ShieldAlert className="inline h-3 w-3" /> Dispute open
            {txn.disputedAt ? ` ${relTime(txn.disputedAt)}` : ""}
            {txn.disputeReason ? `: "${txn.disputeReason.slice(0, 140)}"` : ""}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={resolveForm}
              onChange={(e) => setResolveForm(e.target.value as any)}
              className="rounded-md border border-bg-border bg-bg-card px-2 py-1 text-xs"
            >
              <option value="refund_buyer">Refund buyer (full)</option>
              <option value="release_supplier">Release to supplier</option>
              <option value="split">50/50 split</option>
            </select>
            <button
              disabled={isBusy("resolve")}
              onClick={() => onAction(
                txn.id,
                "resolve",
                { resolution: resolveForm, notes: resolveNotes.trim() || undefined },
                "Dispute resolved",
              )}
              className="flex items-center gap-1.5 rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow disabled:opacity-50"
            >
              {isBusy("resolve") ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
              Resolve
            </button>
          </div>
          <textarea
            value={resolveNotes}
            onChange={(e) => setResolveNotes(e.target.value.slice(0, 500))}
            placeholder="Resolution rationale (optional, 500 chars max) — what evidence convinced you, what's the precedent, etc. Persisted to the audit trail."
            rows={2}
            className="w-full rounded-md border border-bg-border bg-bg-card p-2 text-[11px] placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
          />
          {resolveNotes.length > 0 && (
            <div className="text-right text-[10px] text-ink-tertiary">
              {resolveNotes.length}/500
            </div>
          )}
        </div>
      )}

      {(txn.state === "released" || txn.state === "completed") && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="flex items-center gap-1 rounded-md bg-accent-green/15 px-2 py-1 text-accent-green">
            <CheckCircle2 className="h-3 w-3" /> Settled — supplier paid {fmtCents(txn.supplierPayoutCents)}
          </span>
          {viewBtn}
        </div>
      )}

      {(txn.state === "cancelled" || txn.state === "refunded") && (
        <div className="space-y-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 rounded-md bg-bg-hover px-2 py-1 text-ink-secondary">
              <PauseCircle className="h-3 w-3" /> {txn.state === "refunded" ? "Refunded — closed" : "Cancelled — closed"}
            </span>
            {viewBtn}
          </div>
          {txn.disputeResolutionNotes && (
            <div className="rounded-md border border-bg-border bg-bg-hover/30 p-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                Resolution rationale
              </div>
              <div className="mt-0.5 text-[11px] text-ink-secondary">
                {txn.disputeResolutionNotes}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Show rationale on released-post-dispute too (release_supplier path) */}
      {(txn.state === "released" || txn.state === "completed") &&
        txn.disputeResolutionNotes && (
          <div className="rounded-md border border-bg-border bg-bg-hover/30 p-2.5 text-[11px]">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Resolution rationale (post-dispute)
            </div>
            <div className="mt-0.5 text-ink-secondary">{txn.disputeResolutionNotes}</div>
          </div>
        )}

      {/* Cancel row — visible for early states only */}
      {cancellable && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-bg-border pt-2">
          <input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Cancel reason (optional)"
            className="flex-1 min-w-[200px] rounded-md border border-bg-border bg-bg-card px-2 py-1 text-xs"
          />
          <button
            disabled={isBusy("cancel")}
            onClick={() => onAction(txn.id, "cancel", cancelReason ? { reason: cancelReason } : undefined, "Cancelled")}
            className="flex items-center gap-1.5 rounded-md border border-accent-red/40 bg-accent-red/10 px-3 py-1.5 text-xs text-accent-red hover:bg-accent-red/20 disabled:opacity-50"
          >
            {isBusy("cancel") ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small components
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, tone = "default", Icon, href, cta,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "brand" | "green" | "red" | "amber";
  Icon: React.ComponentType<{ className?: string }>;
  /** When set, the whole card becomes a navigation link. */
  href?: string;
  /** Hover hint shown bottom-right when href is set. */
  cta?: string;
}) {
  const valueClass =
    tone === "brand" ? "text-brand-200" :
    tone === "green" ? "text-accent-green" :
    tone === "red"   ? "text-accent-red" :
    tone === "amber" ? "text-accent-amber" :
    "";
  const ringClass =
    tone === "brand" ? "hover:border-brand-500/50" :
    tone === "green" ? "hover:border-accent-green/50" :
    tone === "red"   ? "hover:border-accent-red/50" :
    tone === "amber" ? "hover:border-accent-amber/50" :
    "hover:border-bg-border";
  const ctaClass =
    tone === "brand" ? "text-brand-300" :
    tone === "green" ? "text-accent-green" :
    tone === "red"   ? "text-accent-red" :
    tone === "amber" ? "text-accent-amber" :
    "text-ink-secondary";

  const inner = (
    <>
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
        <Icon className="h-3.5 w-3.5 text-ink-tertiary" />
      </div>
      <div className={`mt-1 text-2xl font-bold ${valueClass}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-ink-tertiary">{sub}</div>}
      {href && cta && (
        <div className="mt-2 text-right">
          <span className={`text-[10px] opacity-60 transition group-hover:opacity-100 ${ctaClass}`}>
            {cta}
          </span>
        </div>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        title={cta}
        className={`group block rounded-xl border border-bg-border bg-bg-card p-4 transition focus:outline-none focus:ring-2 focus:ring-brand-500/40 ${ringClass} hover:bg-bg-hover/30`}
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

function MiniStat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "green" | "brand" }) {
  const cls = tone === "green" ? "text-accent-green" : tone === "brand" ? "text-brand-300" : "";
  return (
    <div className="rounded-md border border-bg-border bg-bg-card p-2">
      <div className="text-[9px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className={`text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function ModeBadge({ label, value }: { label: string; value: string }) {
  const live = value === "live";
  const sandbox = value === "sandbox" || value === "shippo" || value === "docusign";
  const cls = live
    ? "bg-accent-green/15 text-accent-green"
    : sandbox
    ? "bg-accent-blue/15 text-accent-blue"
    : "bg-bg-hover text-ink-secondary";
  return (
    <span className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {label}: <span className="uppercase">{value}</span>
    </span>
  );
}

function EmptyState({ filter, totalCount }: { filter: string; totalCount: number }) {
  return (
    <div className="rounded-xl border border-dashed border-bg-border bg-bg-card p-10 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-bg-hover">
        <ArrowLeftRight className="h-5 w-5 text-ink-tertiary" />
      </div>
      <div className="mt-3 text-sm font-semibold">No transactions {filter !== "all" ? `in "${filter}"` : "yet"}</div>
      <div className="mx-auto mt-1 max-w-md text-xs text-ink-tertiary">
        {totalCount === 0
          ? "Transactions are created from accepted quotes. Open a quote in /deals and click Create Transaction."
          : "Try a different filter to see other deals."}
      </div>
      {totalCount === 0 && (
        <Link
          href="/deals"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-xs font-medium shadow-glow"
        >
          <FileText className="h-3 w-3" /> Go to Deals
        </Link>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Supplier Stripe Connect onboarding panel
// ─────────────────────────────────────────────────────────────────────────────

type ConnectStatus = {
  connected: boolean;
  accountId: string | null;
  status: {
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    requirementsDue: number;
  } | null;
};

function SupplierConnectPanel({ txn }: { txn: Transaction }) {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/transactions/${txn.id}/connect-supplier`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setStatus(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [txn.id, txn.supplierStripeAccountId]);

  async function startOnboarding() {
    setBusy(true);
    try {
      const r = await fetch(`/api/transactions/${txn.id}/connect-supplier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) {
        alert(`Onboarding failed: ${d.error ?? r.statusText}`);
        return;
      }
      // Open in a new tab so the operator can copy the link to the supplier
      window.open(d.url, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  }

  const connected = status?.connected ?? !!txn.supplierStripeAccountId;
  const s = status?.status;
  const ready = !!s && s.chargesEnabled && s.payoutsEnabled;

  return (
    <div className="rounded-lg border border-bg-border bg-bg-hover/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {ready ? (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-green" />
          ) : connected ? (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber" />
          ) : (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-ink-tertiary" />
          )}
          <div>
            <div className="text-[12px] font-semibold">
              {ready
                ? "Supplier connected — payouts ready"
                : connected
                ? "Supplier onboarding in progress"
                : "Supplier not connected to Stripe"}
            </div>
            <div className="mt-0.5 text-[11px] text-ink-tertiary">
              {ready ? (
                <>
                  Stripe acct <span className="font-mono">{status?.accountId?.slice(0, 16)}…</span> · Charges + payouts enabled. Funds release to supplier on settlement.
                </>
              ) : connected ? (
                <>
                  Stripe acct <span className="font-mono">{status?.accountId?.slice(0, 16)}…</span> ·{" "}
                  {s?.requirementsDue ? `${s.requirementsDue} field${s.requirementsDue === 1 ? "" : "s"} still due` : "Awaiting Stripe verification"}.
                  {" "}Re-open onboarding to refresh the link.
                </>
              ) : (
                <>
                  No Stripe Connect account yet. Without one, escrow release will simulate locally instead of paying out.
                </>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={startOnboarding}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-[11px] font-semibold hover:bg-bg-hover disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CreditCard className="h-3 w-3" />}
          {connected && !ready ? "Refresh onboarding" : connected ? "Update account" : "Onboard Supplier"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Operator notes — free-form, private scratchpad per transaction
// ─────────────────────────────────────────────────────────────────────────────

function OperatorNotes({ txn }: { txn: Transaction }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(txn.operatorNotes ?? "");
  const [saving, setSaving] = useState(false);

  // If parent txn updates (poll/refresh), drop stale draft when not actively editing
  useEffect(() => {
    if (!editing) setDraft(txn.operatorNotes ?? "");
  }, [txn.operatorNotes, editing]);

  async function save() {
    setSaving(true);
    try {
      const r = await fetch(`/api/transactions/${txn.id}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: draft }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(`Save failed: ${d.error ?? r.statusText}`);
        return;
      }
      setEditing(false);
      // The parent /transactions page polls every 20s, so the txn prop will
      // refresh with the new operatorNotes shortly. We could optimistically
      // mutate but the parent handles it.
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(txn.operatorNotes ?? "");
    setEditing(false);
  }

  const hasNote = !!txn.operatorNotes;

  if (!editing && !hasNote) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-bg-border bg-bg-hover/20 px-3 py-2 text-[11px] text-ink-tertiary hover:border-brand-500/40 hover:bg-bg-hover/40 hover:text-ink-secondary"
      >
        <FileText className="h-3 w-3" />
        Add operator note (private — not visible to buyer)
      </button>
    );
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-brand-500/40 bg-bg-hover/30 p-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold">
          <FileText className="h-3 w-3 text-brand-300" />
          Operator note
          <span className="text-ink-tertiary">· private</span>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
          autoFocus
          placeholder="Anything not state-machine driven — 'Sarah said she'd ship by Friday', 'Watch this one — first order over $50K', etc."
          rows={3}
          className="mt-2 w-full rounded-md border border-bg-border bg-bg-card p-2 text-[11px] placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between text-[10px]">
          <span className="text-ink-tertiary">{draft.length}/1000 · Cmd+Enter to save</span>
          <div className="flex items-center gap-2">
            <button
              onClick={cancel}
              className="rounded-md border border-bg-border bg-bg-card px-2.5 py-1 hover:bg-bg-hover"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1 rounded-md bg-gradient-brand px-2.5 py-1 font-semibold shadow-glow disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Display mode — has note, not editing
  return (
    <button
      onClick={() => setEditing(true)}
      className="w-full rounded-lg border border-bg-border bg-bg-hover/30 p-3 text-left transition hover:border-brand-500/40"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold">
          <FileText className="h-3 w-3 text-brand-300" />
          Operator note
          <span className="text-ink-tertiary">· private</span>
        </div>
        <span className="text-[10px] text-ink-tertiary">
          {txn.operatorNotesUpdatedAt ? `Edited ${relTime(txn.operatorNotesUpdatedAt)}` : ""}
          <span className="ml-2 text-brand-300">Edit</span>
        </span>
      </div>
      <div className="mt-1.5 whitespace-pre-wrap text-[11px] text-ink-secondary">
        {txn.operatorNotes}
      </div>
    </button>
  );
}

// ─── FreightPanel (slice 49) ───────────────────────────────────────

function FreightPanel({
  estimate,
  txnId,
  onRecompute,
  busyKey,
}: {
  estimate: NonNullable<Transaction["freightEstimate"]>;
  txnId?: string;
  // Slice 75: optional -- when present, exposes a Recompute button
  // that re-runs estimateLane() against current state. Wired via
  // the parent's action() helper so it gets the same load/toast
  // behavior as ship/release/etc.
  onRecompute?: (
    txnId: string,
    path: string,
    body?: unknown,
    label?: string,
  ) => Promise<void> | void;
  busyKey?: string | null;
}) {
  const cheapest = estimate.rates[0];
  const fmtUsd = (n: number) =>
    `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const ageMs = Date.now() - new Date(estimate.computedAt).getTime();
  const isStale = ageMs > 7 * 24 * 60 * 60 * 1000; // >7 days
  const recomputing =
    !!txnId && busyKey === `${txnId}-freight-recompute`;
  return (
    <div className="rounded-lg border border-accent-blue/30 bg-accent-blue/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-accent-blue">
          Freight estimate · {estimate.laneKey}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-md bg-bg-card px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-tertiary">
            {estimate.provider}
          </span>
          {onRecompute && txnId && (
            <button
              type="button"
              onClick={() =>
                onRecompute(txnId, "freight-recompute", undefined, "Freight recomputed")
              }
              disabled={recomputing}
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition disabled:opacity-60 ${
                isStale
                  ? "border-accent-amber/50 bg-accent-amber/15 text-accent-amber hover:bg-accent-amber/25"
                  : "border-bg-border bg-bg-card text-ink-secondary hover:bg-bg-hover"
              }`}
              title={
                isStale
                  ? "Estimate is over 7 days old -- recompute against current rates"
                  : "Recompute against current supplier + destination"
              }
            >
              {recomputing ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : (
                <RefreshCw className="h-2.5 w-2.5" />
              )}
              Recompute
            </button>
          )}
        </div>
      </div>
      {cheapest && (
        <div className="mb-2 flex flex-wrap items-baseline gap-2 text-[12px]">
          <span className="text-ink-tertiary">Cheapest:</span>
          <span className="font-mono font-semibold text-accent-green">
            {fmtUsd(cheapest.estimateUsd)}
          </span>
          <span className="text-ink-secondary">via {cheapest.mode}</span>
          <span className="text-ink-tertiary">
            · {cheapest.transitDaysMin}-{cheapest.transitDaysMax} days
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {estimate.rates.slice(0, 4).map((r) => (
          <div
            key={r.mode}
            className="flex items-center justify-between gap-2 rounded-md border border-bg-border bg-bg-app px-2 py-1 text-[11px]"
          >
            <span className="font-mono text-ink-secondary">{r.mode}</span>
            <div className="flex items-center gap-2 text-ink-tertiary">
              <span>{r.transitDaysMin}-{r.transitDaysMax}d</span>
              <span className="font-mono text-accent-green">{fmtUsd(r.estimateUsd)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-ink-tertiary">
        Computed {new Date(estimate.computedAt).toLocaleString()}
        {cheapest?.notes ? ` · ${cheapest.notes}` : ""}
      </div>
    </div>
  );
}
