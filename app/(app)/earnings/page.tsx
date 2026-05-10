"use client";
import {
  ArrowDownToLine,
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock,
  DollarSign,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  COMMISSION_TIERS,
  EARNINGS,
  MONTHLY_EARNINGS,
  PAYOUTS,
  totals,
} from "@/lib/earnings";

const STATUS_TONE: Record<string, string> = {
  Earned: "bg-bg-hover text-ink-secondary",
  "Pending Payout": "bg-accent-amber/15 text-accent-amber",
  Paid: "bg-accent-green/15 text-accent-green",
  Processing: "bg-accent-amber/15 text-accent-amber",
};

const SOURCE_COLOR: Record<string, string> = {
  "Outreach Agent": "#7c3aed",
  LinkedIn: "#3b82f6",
  Referral: "#22c55e",
  Inbound: "#06b6d4",
};

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

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

function fmtCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default function EarningsPage() {
  const t = totals();
  const lifetime = MONTHLY_EARNINGS.reduce((s, m) => s + m.earned, 0) + t.earned;
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  const [live, setLive] = useState<LiveRevenueStats | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    async function fetchLive() {
      try {
        const r = await fetch("/api/transactions/stats", { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setLive(d.stats);
      } catch {
        // Silent fail — live panel just won't render. Demo cards still work.
      }
    }
    fetchLive();
    const id = setInterval(fetchLive, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const hasLive = !!live && (
    live.totalPlatformFeesCents > 0
    || live.totalEscrowFeesCents > 0
    || live.inFlightEscrowCents > 0
    || Object.values(live.txnsByState ?? {}).some((n) => n > 0)
  );

  function handleConfirmPayout() {
    setRequested(true);
    setPayoutOpen(false);
    toast(`Payout request submitted for ${fmt(t.pending)} · expect ACH in 1-3 business days`);
  }

  // Source breakdown
  const sourceMap = EARNINGS.reduce((acc, e) => {
    acc[e.source] = (acc[e.source] ?? 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);
  const sourceData = Object.entries(sourceMap).map(([name, value]) => ({
    name,
    value: +value.toFixed(0),
    fill: SOURCE_COLOR[name] ?? "#a87dff",
  }));

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
              Platform takes a % of every AI-closed deal · current plan: {" "}
              <span className="text-brand-300">{t.plan.name}</span> ({(t.plan.commissionRate * 100).toFixed(0)}% base · tiered up for smaller deals)
            </p>
          </div>
        </div>
        <button
          onClick={() => setPayoutOpen(true)}
          disabled={t.pending === 0 || requested}
          className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-semibold shadow-glow disabled:opacity-50"
        >
          {requested ? (
            <><CheckCircle2 className="h-4 w-4" /> Payout requested</>
          ) : (
            <><ArrowDownToLine className="h-4 w-4" /> Request Payout</>
          )}
        </button>
      </div>

      {payoutOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPayoutOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-bg-border bg-bg-panel shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-bg-border px-5 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Banknote className="h-4 w-4 text-accent-green" /> Confirm payout request
              </div>
              <button
                onClick={() => setPayoutOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="rounded-lg border border-bg-border bg-bg-card p-4">
                <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                  Pending payout
                </div>
                <div className="mt-1 text-3xl font-bold">{fmt(t.pending)}</div>
                <div className="mt-1 text-[11px] text-ink-tertiary">
                  Across {EARNINGS.filter((e) => e.status === "Pending Payout").length} closed deals
                </div>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-ink-secondary">Method</span>
                  <span className="font-medium">ACH (1-3 business days)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-secondary">Bank account</span>
                  <span className="font-mono">•••• 8842</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-secondary">Reference</span>
                  <span className="font-mono">PR-{Date.now().toString(36).toUpperCase()}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-bg-border px-5 py-3">
              <button
                onClick={() => setPayoutOpen(false)}
                className="rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPayout}
                className="rounded-lg bg-gradient-brand px-3 py-2 text-sm font-semibold shadow-glow"
              >
                Confirm payout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live platform revenue from transaction ledger */}
      {hasLive && live && (
        <div className="rounded-xl border border-accent-green/30 bg-gradient-to-br from-accent-green/5 to-transparent p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent-green">
              <Sparkles className="h-3.5 w-3.5" /> Live Platform Revenue · Transaction Ledger
            </div>
            <Link
              href="/transactions"
              className="text-[11px] text-brand-300 hover:underline"
            >
              View transactions →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-bg-border bg-bg-card p-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Net Platform Revenue</div>
              <div className="mt-1 text-2xl font-bold text-accent-green">
                {fmtCents(live.netPlatformRevenueCents)}
              </div>
              <div className="mt-0.5 text-[11px] text-ink-tertiary">
                Platform + escrow fees, less refunds
              </div>
            </div>
            <div className="rounded-lg border border-bg-border bg-bg-card p-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">In-flight Escrow</div>
              <div className="mt-1 text-2xl font-bold text-accent-amber">
                {fmtCents(live.inFlightEscrowCents)}
              </div>
              <div className="mt-0.5 text-[11px] text-ink-tertiary">
                Held until delivery confirmed
              </div>
            </div>
            <div className="rounded-lg border border-bg-border bg-bg-card p-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Platform Fees</div>
              <div className="mt-1 text-2xl font-bold">{fmtCents(live.totalPlatformFeesCents)}</div>
              <div className="mt-0.5 text-[11px] text-ink-tertiary">
                Escrow fees: {fmtCents(live.totalEscrowFeesCents)}
              </div>
            </div>
            <div className="rounded-lg border border-bg-border bg-bg-card p-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Supplier Payouts</div>
              <div className="mt-1 text-2xl font-bold">{fmtCents(live.totalSupplierPayoutsCents)}</div>
              <div className="mt-0.5 text-[11px] text-ink-tertiary">
                Refunds: {fmtCents(live.totalRefundsCents)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Lifetime Earned"
          value={fmt(lifetime)}
          delta="+31% YoY"
          tone="brand"
          Icon={CircleDollarSign}
        />
        <KpiCard
          label="Pending Payout"
          value={fmt(t.pending)}
          delta="Next: Jun 2"
          tone="amber"
          Icon={Clock}
        />
        <KpiCard
          label="In-Flight (Open Deals)"
          value={fmt(t.inFlight)}
          delta={`${EARNINGS.filter((e) => e.status === "Earned").length} deals`}
          tone="blue"
          Icon={TrendingUp}
        />
        <KpiCard
          label="30-Day Forecast"
          value={fmt(t.forecast)}
          delta="Probability-weighted"
          tone="green"
          Icon={Sparkles}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-bg-border bg-bg-card">
          <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
            <div className="text-sm font-semibold">Monthly Commissions</div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-brand-400" /> Earned
              </span>
              <span className="flex items-center gap-1.5 text-ink-tertiary">
                <span className="h-2 w-2 rounded-full bg-ink-tertiary" /> Paid
              </span>
            </div>
          </div>
          <div className="h-72 px-3 py-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MONTHLY_EARNINGS} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#252538" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="m" tick={{ fill: "#6e6e85", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6e6e85", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "#161624",
                    border: "1px solid #252538",
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: "#9b9bb5" }}
                />
                <Bar dataKey="earned" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                <Bar dataKey="paid" fill="#6e6e85" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-bg-border bg-bg-card">
          <div className="border-b border-bg-border px-5 py-3.5 text-sm font-semibold">
            Earnings by Source
          </div>
          <div className="h-72 px-3 py-3">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sourceData}
                  dataKey="value"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  stroke="none"
                >
                  {sourceData.map((s) => (
                    <Cell key={s.name} fill={s.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#161624", border: "1px solid #252538", borderRadius: 8 }}
                  formatter={(v: number) => fmt(v)}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11, color: "#9b9bb5" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-bg-border bg-bg-card">
          <div className="border-b border-bg-border px-5 py-3.5 text-sm font-semibold">
            Commission Ledger
          </div>
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">Deal</th>
                <th className="px-3 py-2.5 text-left font-medium">Source</th>
                <th className="px-3 py-2.5 text-right font-medium">Deal Value</th>
                <th className="px-3 py-2.5 text-right font-medium">Rate</th>
                <th className="px-3 py-2.5 text-right font-medium">Commission</th>
                <th className="px-5 py-2.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {EARNINGS.map((e) => (
                <tr
                  key={e.id}
                  className="border-t border-bg-border hover:bg-bg-hover/30"
                >
                  <td className="px-5 py-3">
                    <div className="font-medium">{e.deal.company}</div>
                    <div className="text-[11px] text-ink-tertiary">{e.deal.product}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        background: `${SOURCE_COLOR[e.source]}25`,
                        color: SOURCE_COLOR[e.source],
                      }}
                    >
                      {e.source}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    {fmt(e.deal.value)}
                  </td>
                  <td className="px-3 py-3 text-right text-ink-secondary">
                    {(e.rate * 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-brand-200">
                    {fmt(e.amount)}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[e.status]}`}
                    >
                      {e.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
            <div className="border-b border-bg-border px-5 py-3.5 text-sm font-semibold">
              Payout History
            </div>
            <div className="divide-y divide-bg-border">
              {PAYOUTS.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Banknote className="h-3.5 w-3.5 text-accent-green" />
                      {fmt(p.amount)}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-ink-tertiary">
                      <Calendar className="h-3 w-3" /> {p.date} · {p.method}
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[p.status]}`}
                    >
                      {p.status}
                    </span>
                    <div className="text-[11px] text-ink-tertiary">{p.ref}</div>
                  </div>
                </div>
              ))}
            </div>
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
      </div>

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
              Every deal sourced and closed by an AI agent earns the platform a commission.
              Plan rate ({(t.plan.commissionRate * 100).toFixed(0)}%) sets the floor — smaller deals earn a higher tier rate to make sub-$10K outreach worthwhile.
              Payouts run monthly via ACH. Inbound + Referral deals do not earn commission.
            </p>
            <button className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-300 hover:text-brand-200">
              Read commission terms <ChevronRight className="h-3 w-3" />
            </button>
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
}: {
  label: string;
  value: string;
  delta: string;
  tone: "brand" | "amber" | "blue" | "green";
  Icon: React.ComponentType<{ className?: string }>;
}) {
  const toneMap = {
    brand: { bg: "bg-brand-500/15", text: "text-brand-300" },
    amber: { bg: "bg-accent-amber/15", text: "text-accent-amber" },
    blue: { bg: "bg-accent-blue/15", text: "text-accent-blue" },
    green: { bg: "bg-accent-green/15", text: "text-accent-green" },
  };
  const t = toneMap[tone];
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
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
    </div>
  );
}
