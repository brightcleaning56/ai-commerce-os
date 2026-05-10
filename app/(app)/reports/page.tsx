"use client";
import {
  Activity,
  BarChart3,
  Calendar,
  Download,
  Filter,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useChartColors } from "@/components/dashboard/useChartColors";
import { useToast } from "@/components/Toast";
import { downloadCSV } from "@/lib/csv";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ReportsData = {
  hasAnyData: boolean;
  revenueByMonth: { m: string; revenue: number; deals: number }[];
  agentROI: { agent: string; spend: number; revenue: number; roi: number }[];
  funnel: { stage: string; value: number; fill: string }[];
  cohorts: { week: string; contacted: number; replied: number; meetings: number; closed: number }[];
  categoryRevenue: { name: string; value: number }[];
  headline: { totalRevenue: number; totalDeals: number; lastMonthRevenue: number; prevMonthRevenue: number };
};

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null);
  const c = useChartColors();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/reports", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function handleExport() {
    if (!data) {
      toast("Nothing to export yet — run a pipeline first.", "info");
      return;
    }
    const rows = [
      ...data.revenueByMonth.map((m) => ({ section: "revenue_by_month", month: m.m, revenue_usd: m.revenue, deals: m.deals })),
      ...data.agentROI.map((a) => ({ section: "agent_roi", agent: a.agent, spend_usd: a.spend, revenue_usd: a.revenue, roi_pct: a.roi })),
      ...data.funnel.map((f) => ({ section: "outreach_funnel", stage: f.stage, count: f.value })),
      ...data.cohorts.map((c) => ({ section: "weekly_cohorts", week: c.week, contacted: c.contacted, replied: c.replied, meetings: c.meetings, closed: c.closed })),
      ...data.categoryRevenue.map((c) => ({ section: "category_revenue", category: c.name, revenue_usd: c.value })),
    ];
    if (rows.length === 0) {
      toast("Nothing to export — your store is empty.", "info");
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(`avyn-commerce-report-${date}.csv`, rows);
    toast(`Exported ${rows.length} rows to CSV`);
  }

  // ── Empty state for fresh installs ──────────────────────────────────
  if (data && !data.hasAnyData) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Reports &amp; Analytics</h1>
            <p className="text-xs text-ink-secondary">Live aggregations from your transaction ledger and agent runs</p>
          </div>
        </div>
        <div className="rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-500/5 to-transparent p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/15">
            <Sparkles className="h-7 w-7 text-brand-300" />
          </div>
          <div className="mt-4 text-base font-semibold">No data to report yet</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-secondary">
            Reports populate from your real transactions, drafts, and agent runs. Run your first pipeline,
            send some outreach, and close a deal — every chart below fills in automatically.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link href="/pipeline" className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-xs font-semibold shadow-glow">
              <Sparkles className="h-3 w-3" /> Run pipeline
            </Link>
            <Link href="/transactions" className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-xs hover:bg-bg-hover">
              <Workflow className="h-3 w-3" /> View Transactions
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const totalRev = data?.headline.totalRevenue ?? 0;
  const totalDeals = data?.headline.totalDeals ?? 0;
  const lastMonth = data?.revenueByMonth.at(-1);
  const prevMonth = data?.revenueByMonth.at(-2);
  const delta =
    lastMonth && prevMonth && prevMonth.revenue > 0
      ? ((lastMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100
      : null;

  const replyRatePct =
    data && data.funnel[1] && data.funnel[1].value > 0
      ? ((data.funnel[3]?.value ?? 0) / data.funnel[1].value) * 100
      : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Reports &amp; Analytics</h1>
            <p className="text-xs text-ink-secondary">
              Live · {totalDeals} deals closed · {fmtUSD(totalRev)} platform fees · trailing 7 months
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm">
            <Calendar className="h-4 w-4" /> Last 7 months
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm">
            <Filter className="h-4 w-4" /> Filters
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow"
          >
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Revenue (latest mo)"
          value={lastMonth ? fmtUSD(lastMonth.revenue) : "—"}
          delta={delta != null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%` : "—"}
          positive={delta == null || delta >= 0}
          Icon={TrendingUp}
        />
        <Kpi
          label="Deals Closed (latest mo)"
          value={String(lastMonth?.deals ?? 0)}
          delta={lastMonth && prevMonth ? `${lastMonth.deals - prevMonth.deals >= 0 ? "+" : ""}${lastMonth.deals - prevMonth.deals}` : "—"}
          positive={!lastMonth || !prevMonth || lastMonth.deals >= prevMonth.deals}
          Icon={Workflow}
        />
        <Kpi
          label="Reply Rate"
          value={replyRatePct != null ? `${replyRatePct.toFixed(1)}%` : "—"}
          delta="vs sent"
          positive
          Icon={Activity}
        />
        <Kpi
          label="Total Closed Deals"
          value={String(totalDeals)}
          delta="lifetime"
          positive
          Icon={Users}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-bg-border bg-bg-card">
          <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-brand-300" /> Revenue + Deals
            </div>
            <div className="text-[11px] text-ink-tertiary">Trailing 7 months</div>
          </div>
          <div className="h-72 px-3 py-3">
            {(data?.revenueByMonth.length ?? 0) === 0 ? (
              <ChartEmpty line="Revenue posts here once a transaction reaches Released or Completed." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data!.revenueByMonth} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rev2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a87dff" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="m" tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="rev" tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                  <YAxis yAxisId="deals" orientation="right" tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8 }}
                    labelStyle={{ color: c.tooltipLabel }}
                    formatter={(v: number, n: string) => (n === "revenue" ? fmtUSD(v) : v)}
                  />
                  <Area yAxisId="rev" type="monotone" dataKey="revenue" stroke="#a87dff" strokeWidth={2} fill="url(#rev2)" />
                  <Line yAxisId="deals" type="monotone" dataKey="deals" stroke="#22c55e" strokeWidth={2} dot={{ fill: "#22c55e", r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-bg-border bg-bg-card">
          <div className="border-b border-bg-border px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-brand-300" /> Outreach Funnel
            </div>
            <div className="mt-0.5 text-[11px] text-ink-tertiary">From buyers → closed</div>
          </div>
          <div className="space-y-2 p-5">
            {(data?.funnel ?? []).map((s, i) => {
              const top = data?.funnel[0]?.value ?? 0;
              const pct = top === 0 ? 0 : (s.value / top) * 100;
              const drop = i > 0 && data ? ((data.funnel[i - 1].value - s.value) / Math.max(1, data.funnel[i - 1].value)) * 100 : 0;
              return (
                <div key={s.stage}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-secondary">{s.stage}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">{s.value.toLocaleString()}</span>
                      {i > 0 && data && data.funnel[i - 1].value > 0 && (
                        <span className="text-[10px] text-ink-tertiary">−{drop.toFixed(0)}%</span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-bg-hover">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: s.fill }} />
                  </div>
                </div>
              );
            })}
            {data?.funnel.every((s) => s.value === 0) && (
              <div className="py-2 text-center text-[11px] text-ink-tertiary">
                Run outreach to populate this funnel.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-bg-border bg-bg-card">
          <div className="border-b border-bg-border px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BarChart3 className="h-4 w-4 text-brand-300" /> Agent ROI
            </div>
            <div className="mt-0.5 text-[11px] text-ink-tertiary">
              Anthropic spend per agent vs platform revenue (split evenly across agents that ran)
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">Agent</th>
                  <th className="px-3 py-2.5 text-right font-medium">Spend</th>
                  <th className="px-3 py-2.5 text-right font-medium">Revenue Attributed</th>
                  <th className="px-3 py-2.5 text-right font-medium">ROI</th>
                  <th className="px-5 py-2.5 text-left font-medium">Performance</th>
                </tr>
              </thead>
              <tbody>
                {(data?.agentROI ?? []).map((a) => {
                  const max = Math.max(1, ...(data?.agentROI ?? []).map((x) => x.roi));
                  const pct = (a.roi / max) * 100;
                  return (
                    <tr key={a.agent} className="border-t border-bg-border">
                      <td className="px-5 py-3 font-medium">{a.agent}</td>
                      <td className="px-3 py-3 text-right text-ink-secondary">${a.spend.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right font-semibold">{fmtUSD(a.revenue)}</td>
                      <td className="px-3 py-3 text-right font-bold text-accent-green">
                        {a.roi.toLocaleString()}%
                      </td>
                      <td className="w-44 px-5 py-3">
                        <div className="h-1.5 overflow-hidden rounded-full bg-bg-hover">
                          <div className="h-full bg-gradient-brand" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {data && data.agentROI.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-[11px] text-ink-tertiary">
                      No agent runs yet — fire a pipeline from <Link href="/pipeline" className="text-brand-300">Pipeline</Link>.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-bg-border bg-bg-card">
          <div className="border-b border-bg-border px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BarChart3 className="h-4 w-4 text-brand-300" /> Revenue by Category
            </div>
          </div>
          <div className="h-72 px-3 py-3">
            {(data?.categoryRevenue.length ?? 0) === 0 ? (
              <ChartEmpty line="Closes by product category appear once you settle a deal." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data!.categoryRevenue} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke={c.grid} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                  <YAxis dataKey="name" type="category" tick={{ fill: c.tooltipLabel, fontSize: 11 }} axisLine={false} tickLine={false} width={130} />
                  <Tooltip
                    contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8 }}
                    formatter={(v: number) => fmtUSD(v)}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {data!.categoryRevenue.map((_, i) => (
                      <Cell key={i} fill={`hsl(${260 + i * 12}, 70%, ${55 + i * 2}%)`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-bg-border bg-bg-card">
        <div className="border-b border-bg-border px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-brand-300" /> Weekly Cohorts
          </div>
          <div className="mt-0.5 text-[11px] text-ink-tertiary">
            Last 7 weeks · contacted → replied → meetings → closed
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">Week</th>
                <th className="px-3 py-2.5 text-right font-medium">Contacted</th>
                <th className="px-3 py-2.5 text-right font-medium">Replied</th>
                <th className="px-3 py-2.5 text-right font-medium">Reply %</th>
                <th className="px-3 py-2.5 text-right font-medium">Meetings</th>
                <th className="px-3 py-2.5 text-right font-medium">Mtg %</th>
                <th className="px-3 py-2.5 text-right font-medium">Closed</th>
                <th className="px-5 py-2.5 text-right font-medium">Win %</th>
              </tr>
            </thead>
            <tbody>
              {(data?.cohorts ?? []).map((c) => {
                const replyPct = c.contacted > 0 ? (c.replied / c.contacted) * 100 : 0;
                const mtgPct = c.replied > 0 ? (c.meetings / c.replied) * 100 : 0;
                const winPct = c.meetings > 0 ? (c.closed / c.meetings) * 100 : 0;
                return (
                  <tr key={c.week} className="border-t border-bg-border">
                    <td className="px-5 py-3 font-medium">{c.week}</td>
                    <td className="px-3 py-3 text-right text-ink-secondary">{c.contacted.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right">{c.replied}</td>
                    <td className="px-3 py-3 text-right text-accent-cyan">{c.contacted > 0 ? `${replyPct.toFixed(1)}%` : "—"}</td>
                    <td className="px-3 py-3 text-right">{c.meetings}</td>
                    <td className="px-3 py-3 text-right text-brand-200">{c.replied > 0 ? `${mtgPct.toFixed(1)}%` : "—"}</td>
                    <td className="px-3 py-3 text-right font-semibold">{c.closed}</td>
                    <td className="px-5 py-3 text-right font-bold text-accent-green">{c.meetings > 0 ? `${winPct.toFixed(1)}%` : "—"}</td>
                  </tr>
                );
              })}
              {data && data.cohorts.every((c) => c.contacted === 0) && (
                <tr>
                  <td colSpan={8} className="px-5 py-6 text-center text-[11px] text-ink-tertiary">
                    No outreach this period — drafts you mark Sent appear here weekly.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ChartEmpty({ line }: { line: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/15">
        <Sparkles className="h-5 w-5 text-brand-300" />
      </div>
      <div className="text-[11px] text-ink-tertiary max-w-xs">{line}</div>
    </div>
  );
}

function Kpi({
  label,
  value,
  delta,
  positive,
  Icon,
}: {
  label: string;
  value: string;
  delta: string;
  positive?: boolean;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/15">
          <Icon className="h-4 w-4 text-brand-300" />
        </div>
        <span
          className={`flex items-center gap-1 text-[11px] font-semibold ${
            positive ? "text-accent-green" : "text-accent-red"
          }`}
        >
          {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {delta}
        </span>
      </div>
      <div className="mt-3 text-[11px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
