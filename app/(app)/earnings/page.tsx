"use client";
import {
  AlertCircle,
  ArrowDownToLine,
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock,
  DollarSign,
  ExternalLink,
  Loader2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RefundsPanel from "@/components/earnings/RefundsPanel";
import { useChartColors } from "@/components/dashboard/useChartColors";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { COMMISSION_TIERS } from "@/lib/earnings";

type LiveRevenueStats = {
  totalPlatformFeesCents: number;
  totalEscrowFeesCents: number;
  totalSupplierPayoutsCents: number;
  totalRefundsCents: number;
  netPlatformRevenueCents: number;
  inFlightEscrowCents: number;
  byMonth: { month: string; platformFeesCents: number; escrowFeesCents: number }[];
  txnsByState: Record<string, number>;
};

type Transaction = {
  id: string;
  buyerCompany: string;
  buyerName: string;
  productName: string;
  productTotalCents: number;
  platformFeeCents: number;
  platformFeePctBps: number;
  state: string;
  createdAt: string;
  paymentReceivedAt?: string;
  escrowReleasedAt?: string;
};

const STATE_TONE: Record<string, string> = {
  draft: "bg-bg-hover text-ink-tertiary",
  proposed: "bg-bg-hover text-ink-secondary",
  signed: "bg-accent-blue/15 text-accent-blue",
  payment_pending: "bg-accent-amber/15 text-accent-amber",
  escrow_held: "bg-accent-amber/15 text-accent-amber",
  shipped: "bg-accent-blue/15 text-accent-blue",
  delivered: "bg-accent-blue/15 text-accent-blue",
  released: "bg-accent-green/15 text-accent-green",
  completed: "bg-accent-green/15 text-accent-green",
  disputed: "bg-accent-red/15 text-accent-red",
  refunded: "bg-accent-red/15 text-accent-red",
  cancelled: "bg-bg-hover text-ink-tertiary",
};

function fmtCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function fmtCentsPrecise(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatMonthLabel(yyyymm: string) {
  // "2024-05" → "May '24"
  const [y, m] = yyyymm.split("-").map((s) => parseInt(s, 10));
  if (!y || !m) return yyyymm;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

const SETTLED_STATES = new Set(["released", "completed"]);
const IN_FLIGHT_STATES = new Set(["payment_pending", "escrow_held", "shipped", "delivered"]);

export default function EarningsPage() {
  const [live, setLive] = useState<LiveRevenueStats | null>(null);
  const [txns, setTxns] = useState<Transaction[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const c = useChartColors();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [statsRes, txnsRes] = await Promise.all([
        fetch("/api/transactions/stats", { cache: "no-store" }),
        fetch("/api/transactions", { cache: "no-store" }),
      ]);
      if (statsRes.status === 401 || txnsRes.status === 401) {
        setLoadError("Not signed in — visit /signin and try again.");
        return;
      }
      if (!statsRes.ok) {
        setLoadError(`Stats API returned ${statsRes.status}`);
        return;
      }
      const statsData = await statsRes.json();
      setLive(statsData.stats ?? null);
      if (txnsRes.ok) {
        const txnsData = await txnsRes.json();
        setTxns(txnsData.transactions ?? []);
      } else {
        setTxns([]);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  // Anything to show? If no live stats AND no transactions, render the
  // honest empty state instead of pretending we have a ledger.
  const hasAnyData = useMemo(() => {
    if (!live) return false;
    return (
      live.totalPlatformFeesCents > 0 ||
      live.inFlightEscrowCents > 0 ||
      Object.values(live.txnsByState ?? {}).some((n) => n > 0) ||
      (txns?.length ?? 0) > 0
    );
  }, [live, txns]);

  // KPI tiles — derived from real data
  const tiles = useMemo(() => {
    const settledCount = (txns ?? []).filter((t) => SETTLED_STATES.has(t.state)).length;
    const inFlightCount = (txns ?? []).filter((t) => IN_FLIGHT_STATES.has(t.state)).length;
    const lifetimePlatform = live?.totalPlatformFeesCents ?? 0;
    const lifetimeEscrow = live?.totalEscrowFeesCents ?? 0;
    const inFlightEscrow = live?.inFlightEscrowCents ?? 0;
    const netRevenue = live?.netPlatformRevenueCents ?? 0;
    return { lifetimePlatform, lifetimeEscrow, inFlightEscrow, netRevenue, settledCount, inFlightCount };
  }, [live, txns]);

  // Per-month chart data — show all months in the byMonth array (already sorted asc)
  const chartData = useMemo(() => {
    return (live?.byMonth ?? []).map((m) => ({
      m: formatMonthLabel(m.month),
      platform: Math.round(m.platformFeesCents / 100),
      escrow: Math.round(m.escrowFeesCents / 100),
    }));
  }, [live]);

  // Commission ledger rows — every transaction is a row.
  const ledgerRows = useMemo(() => {
    const list = txns ?? [];
    return list
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);
  }, [txns]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Earnings &amp; Commissions</h1>
            <p className="text-xs text-ink-secondary">
              Platform fees on AI-closed deals · derived from real transactions
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {loadError && (
        <div className="rounded-xl border border-accent-red/40 bg-accent-red/5 px-4 py-3 text-xs text-accent-red">
          <strong className="font-semibold">Couldn&apos;t load earnings:</strong> {loadError}
        </div>
      )}

      {/* Honest empty state — no fake "$1,240 earned in Dec '23" */}
      {!loading && live && !hasAnyData && (
        <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/5 p-4">
          <div className="flex items-start gap-3 text-[12px]">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-amber/15">
              <AlertCircle className="h-3.5 w-3.5 text-accent-amber" />
            </div>
            <div className="flex-1 text-ink-secondary">
              <span className="font-semibold text-accent-amber">No transactions yet</span>
              {" "}— platform fees appear here once buyers sign quotes and pay through escrow.
              Once a transaction lands, this page will show real platform fees, real per-month
              charts, and a real commission ledger. Until then, no fake numbers.
              {" "}
              <Link href="/transactions" className="text-brand-300 hover:underline">
                Open transactions →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* KPI tiles — real numbers (zero is honest, not faked) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Net Platform Revenue"
          value={fmtCents(tiles.netRevenue)}
          delta="Platform + escrow fees, less refunds"
          tone="brand"
          Icon={CircleDollarSign}
          href="/reports"
        />
        <KpiCard
          label="In-flight Escrow"
          value={fmtCents(tiles.inFlightEscrow)}
          delta={`${tiles.inFlightCount} txn${tiles.inFlightCount === 1 ? "" : "s"} held`}
          tone="amber"
          Icon={Clock}
          href="/escrow"
        />
        <KpiCard
          label="Lifetime Platform Fees"
          value={fmtCents(tiles.lifetimePlatform)}
          delta={`Escrow fees: ${fmtCents(tiles.lifetimeEscrow)}`}
          tone="blue"
          Icon={TrendingUp}
          href="/reports"
        />
        <KpiCard
          label="Settled Deals"
          value={tiles.settledCount.toLocaleString()}
          delta="Released or completed"
          tone="green"
          Icon={CheckCircle2}
          href="/transactions"
        />
      </div>

      <RefundsPanel />

      {/* Monthly platform fees chart — only render when there's data */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-bg-border bg-bg-card">
          <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-brand-300" />
              Monthly Platform Fees
              <span className="rounded bg-accent-green/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-accent-green">
                Live
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-brand-400" /> Platform
              </span>
              <span className="flex items-center gap-1.5 text-ink-tertiary">
                <span className="h-2 w-2 rounded-full bg-ink-tertiary" /> Escrow
              </span>
            </div>
          </div>
          {chartData.length === 0 ? (
            <div className="px-5 py-12 text-center text-xs text-ink-tertiary">
              No fees recorded yet. The chart fills in as deals close.
            </div>
          ) : (
            <div className="h-72 px-3 py-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="m" tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: c.tooltipBg,
                      border: "1px solid #252538",
                      borderRadius: 8,
                    }}
                    labelStyle={{ color: c.tooltipLabel }}
                    formatter={(v: number) => `$${v.toLocaleString()}`}
                  />
                  <Bar dataKey="platform" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="escrow" fill="#6e6e85" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-bg-border bg-bg-card">
          <div className="border-b border-bg-border px-5 py-3.5 text-sm font-semibold">
            Commission Tiers
          </div>
          <div className="divide-y divide-bg-border">
            {COMMISSION_TIERS.map((t) => (
              <div
                key={t.label}
                className="flex items-center justify-between px-5 py-3 text-xs"
              >
                <div>
                  <div className="font-medium">{t.label}</div>
                  <div className="text-[11px] text-ink-tertiary">
                    {t.dealMin === 0 ? "Up to" : "From"} ${t.dealMin.toLocaleString()}
                    {t.dealMax !== Infinity ? ` - $${t.dealMax.toLocaleString()}` : "+"}
                  </div>
                </div>
                <span className="font-semibold text-brand-200">
                  {(t.rate * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-bg-border px-5 py-3 text-[11px] text-ink-tertiary">
            Tiered rates apply on top of plan rate. Enterprise plans negotiate custom splits.
          </div>
        </div>
      </div>

      {/* Real commission ledger — every transaction is one row */}
      <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
        <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Banknote className="h-4 w-4 text-brand-300" />
            Commission Ledger
            <span className="rounded bg-accent-green/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-accent-green">
              Live
            </span>
          </div>
          <Link href="/transactions" className="text-[11px] text-brand-300 hover:underline">
            Full transactions list →
          </Link>
        </div>
        {txns === null ? (
          <div className="px-5 py-12 text-center text-xs text-ink-tertiary">
            <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : ledgerRows.length === 0 ? (
          <div className="px-5 py-12 text-center text-xs text-ink-tertiary">
            <Banknote className="mx-auto mb-2 h-5 w-5" />
            <div className="text-ink-secondary font-medium">No commissions yet</div>
            <p className="mt-1 max-w-md mx-auto">
              Each transaction creates one row here with its real platform fee, fee rate,
              and current state. Run a pipeline and convert a quote to start the flow.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">Deal</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total</th>
                  <th className="px-3 py-2.5 text-right font-medium">Rate</th>
                  <th className="px-3 py-2.5 text-right font-medium">Platform Fee</th>
                  <th className="px-3 py-2.5 text-left font-medium">State</th>
                  <th className="px-5 py-2.5 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((t) => (
                  <tr key={t.id} className="border-t border-bg-border hover:bg-bg-hover/30">
                    <td className="px-5 py-3">
                      <div className="font-medium">{t.buyerCompany}</div>
                      <div className="text-[11px] text-ink-tertiary">{t.productName}</div>
                    </td>
                    <td className="px-3 py-3 text-right">{fmtCents(t.productTotalCents)}</td>
                    <td className="px-3 py-3 text-right text-ink-secondary">
                      {(t.platformFeePctBps / 100).toFixed(2)}%
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-brand-200">
                      {fmtCentsPrecise(t.platformFeeCents)}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATE_TONE[t.state] ?? "bg-bg-hover text-ink-tertiary"}`}>
                        {t.state}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">
                      <Calendar className="mr-1 inline h-3 w-3" />
                      {new Date(t.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "2-digit",
                        year: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payouts — honest "not wired yet" state */}
      <div className="rounded-xl border border-bg-border bg-bg-card">
        <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ArrowDownToLine className="h-4 w-4 text-brand-300" />
            Payouts
          </div>
          <span className="text-[11px] text-ink-tertiary">Stripe Connect</span>
        </div>
        <div className="px-5 py-8 text-center text-[12px] text-ink-tertiary">
          <ArrowDownToLine className="mx-auto mb-2 h-5 w-5" />
          <div className="text-ink-secondary font-medium">No payouts to show</div>
          <p className="mt-1 max-w-md mx-auto">
            Platform fees are collected via Stripe Connect destination charges as part of each
            buyer payment — there&apos;s no separate payout cycle. When Stripe Connect is fully
            wired, real payout history from the connected account will appear here.
          </p>
          <a
            href="https://dashboard.stripe.com/connect/accounts/overview"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-brand-300 hover:underline"
          >
            Open Stripe Connect dashboard <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* How earnings work — honest about commission model */}
      <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/20">
            <Sparkles className="h-4 w-4 text-brand-200" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-brand-200">
              How earnings work
            </div>
            <p className="mt-1 text-xs text-ink-secondary">
              Every escrow-routed transaction takes a platform fee (default 8%, configurable
              per-deal at proposal time via <code className="rounded bg-bg-hover px-1">platformFeePctBps</code>).
              Smaller deals can use the tiered commission rates to make sub-$10K outreach
              worthwhile. Fees are taken on top of Stripe Connect&apos;s payment fees and net
              out into platform revenue once escrow releases.
            </p>
            <Link
              href="/transactions"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-300 hover:text-brand-200"
            >
              See the live transaction ledger <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  tone,
  Icon,
  href,
}: {
  label: string;
  value: string;
  delta: string;
  tone: "brand" | "amber" | "blue" | "green";
  Icon: React.ComponentType<{ className?: string }>;
  href?: string;
}) {
  const toneMap = {
    brand: { bg: "bg-brand-500/15", text: "text-brand-300", ring: "hover:ring-brand-500/40" },
    amber: { bg: "bg-accent-amber/15", text: "text-accent-amber", ring: "hover:ring-accent-amber/40" },
    blue: { bg: "bg-accent-blue/15", text: "text-accent-blue", ring: "hover:ring-accent-blue/40" },
    green: { bg: "bg-accent-green/15", text: "text-accent-green", ring: "hover:ring-accent-green/40" },
  };
  const t = toneMap[tone];
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <div className={`grid h-9 w-9 place-items-center rounded-lg ${t.bg}`}>
          <Icon className={`h-4 w-4 ${t.text}`} />
        </div>
        <span className="text-[11px] text-ink-tertiary">{delta}</span>
      </div>
      <div className="mt-3 text-[11px] uppercase tracking-wider text-ink-tertiary">
        {label}
      </div>
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
