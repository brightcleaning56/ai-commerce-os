"use client";
import {
  Activity,
  BarChart3,
  Bot,
  Calendar,
  DollarSign,
  Download,
  Flame,
  Inbox,
  MailX,
  Snowflake,
  Sparkles,
  Telescope,
  ThermometerSun,
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
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
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
  // ── New sections (added with the reports expansion)
  leadFunnel: { stage: string; value: number; fill: string }[];
  leadsByTier: { tier: string; count: number; fill: string }[];
  leadsBySource: { source: string; count: number }[];
  leadStats: {
    total: number;
    aiReplied: number;
    followedUp: number;
    promoted: number;
    autoPromoted: number;
    qualified: number;
    won: number;
  };
  aiSpendByDay: { d: string; cost: number; calls: number }[];
  aiSpendByAgent: { agent: string; cost: number; calls: number }[];
  aiSpendStats: { total14dUsd: number; calls14d: number; dailyBudgetUsd: number | null };
  discoveryByDay: { d: string; products: number; buyers: number; suppliers: number }[];
  discoveryStats: { products: number; buyers: number; suppliers: number };
  complianceSummary: {
    suppressionTotal: number;
    bySource: { source: string; count: number }[];
    bounces: number;
    complaints: number;
    unsubscribes: number;
    manualAdds: number;
    imports: number;
  };
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
    // Every section the page renders is also a row group in the CSV.
    // `section` is the first column so the export is grep-able / pivot-able.
    const rows = [
      ...data.revenueByMonth.map((m) => ({ section: "revenue_by_month", month: m.m, revenue_usd: m.revenue, deals: m.deals })),
      ...data.agentROI.map((a) => ({ section: "agent_roi", agent: a.agent, spend_usd: a.spend, revenue_usd: a.revenue, roi_pct: a.roi })),
      ...data.funnel.map((f) => ({ section: "outreach_funnel", stage: f.stage, count: f.value })),
      ...data.cohorts.map((c) => ({ section: "weekly_cohorts", week: c.week, contacted: c.contacted, replied: c.replied, meetings: c.meetings, closed: c.closed })),
      ...data.categoryRevenue.map((c) => ({ section: "category_revenue", category: c.name, revenue_usd: c.value })),
      ...data.leadFunnel.map((f) => ({ section: "lead_funnel", stage: f.stage, count: f.value })),
      ...data.leadsByTier.map((t) => ({ section: "leads_by_tier", tier: t.tier, count: t.count })),
      ...data.leadsBySource.map((s) => ({ section: "leads_by_source", source: s.source, count: s.count })),
      ...data.aiSpendByDay.map((d) => ({ section: "ai_spend_by_day", day: d.d, cost_usd: d.cost, calls: d.calls })),
      ...data.aiSpendByAgent.map((a) => ({ section: "ai_spend_by_agent", agent: a.agent, cost_usd: a.cost, calls: a.calls })),
      ...data.discoveryByDay.map((d) => ({ section: "discovery_by_day", day: d.d, products: d.products, buyers: d.buyers, suppliers: d.suppliers })),
      ...data.complianceSummary.bySource.map((s) => ({ section: "suppressions_by_source", source: s.source, count: s.count })),
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
          {/* Display-only chip — the window is fixed at 7 months in /api/reports.
              Was previously a <button> with no onClick, which pretended to be
              a date picker. */}
          <span className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm text-ink-secondary">
            <Calendar className="h-4 w-4" /> Last 7 months
          </span>
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
          href="/earnings"
          cta="View earnings"
        />
        <Kpi
          label="Deals Closed (latest mo)"
          value={String(lastMonth?.deals ?? 0)}
          delta={lastMonth && prevMonth ? `${lastMonth.deals - prevMonth.deals >= 0 ? "+" : ""}${lastMonth.deals - prevMonth.deals}` : "—"}
          positive={!lastMonth || !prevMonth || lastMonth.deals >= prevMonth.deals}
          Icon={Workflow}
          href="/transactions"
          cta="See deals"
        />
        <Kpi
          label="Reply Rate"
          value={replyRatePct != null ? `${replyRatePct.toFixed(1)}%` : "—"}
          delta="vs sent"
          positive
          Icon={Activity}
          href="/outreach"
          cta="Open outreach"
        />
        <Kpi
          label="Total Closed Deals"
          value={String(totalDeals)}
          delta="lifetime"
          positive
          Icon={Users}
          href="/crm"
          cta="View pipeline"
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

      {/* ── Lead pipeline reports ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 pt-2 text-[11px] uppercase tracking-wider text-ink-tertiary">
        <span className="h-px flex-1 bg-bg-border" />
        <Inbox className="h-3 w-3" /> Lead pipeline
        <span className="h-px flex-1 bg-bg-border" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Lead Funnel */}
        <div className="lg:col-span-2 rounded-xl border border-bg-border bg-bg-card">
          <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Inbox className="h-4 w-4 text-brand-300" /> Lead Funnel
            </div>
            <div className="text-[11px] text-ink-tertiary">
              {data?.leadStats.total ?? 0} total ·{" "}
              <Link href="/leads" className="text-brand-300 hover:text-brand-200">
                open /leads
              </Link>
            </div>
          </div>
          <div className="h-64 px-3 py-3">
            {(data?.leadFunnel?.reduce((s, f) => s + f.value, 0) ?? 0) === 0 ? (
              <ChartEmpty line="Leads land here when someone submits /contact or /signup. Wire the form first." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data!.leadFunnel} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="stage" tick={{ fill: c.axis, fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8 }} labelStyle={{ color: c.tooltipLabel }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {data!.leadFunnel.map((s, i) => <Cell key={i} fill={s.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-bg-border px-5 py-3 text-[11px] sm:grid-cols-4">
            <Pct label="AI-reply rate" num={data?.leadStats.aiReplied} den={data?.leadStats.total} />
            <Pct label="Followed up" num={data?.leadStats.followedUp} den={data?.leadStats.aiReplied} />
            <Pct label="Promotion rate" num={data?.leadStats.promoted} den={data?.leadStats.total} />
            <Pct label="Win rate" num={data?.leadStats.won} den={data?.leadStats.promoted} />
          </div>
        </div>

        {/* Lead tier donut */}
        <div className="rounded-xl border border-bg-border bg-bg-card">
          <div className="border-b border-bg-border px-5 py-3.5 text-sm font-semibold">
            <span className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-accent-red" /> Lead temperature
            </span>
          </div>
          <div className="h-56 px-3 py-3">
            {(data?.leadsByTier?.reduce((s, t) => s + t.count, 0) ?? 0) === 0 ? (
              <ChartEmpty line="Lead scoring runs on every submission. Hot=70+, Warm=40+, Cold=below." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data!.leadsByTier}
                    dataKey="count"
                    nameKey="tier"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {data!.leadsByTier.map((t, i) => <Cell key={i} fill={t.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8 }} labelStyle={{ color: c.tooltipLabel }} />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    iconType="circle"
                    formatter={(v: string) => {
                      const t = data?.leadsByTier.find((x) => x.tier === v);
                      return `${v} · ${t?.count ?? 0}`;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="grid grid-cols-3 border-t border-bg-border text-center text-[11px]">
            {data?.leadsByTier.map((t) => {
              const Icon = t.tier === "Hot" ? Flame : t.tier === "Warm" ? ThermometerSun : Snowflake;
              return (
                <div key={t.tier} className="border-r border-bg-border px-2 py-2 last:border-r-0">
                  <Icon className="mx-auto h-3 w-3" style={{ color: t.fill }} />
                  <div className="mt-0.5 font-semibold">{t.count}</div>
                  <div className="text-[10px] text-ink-tertiary">{t.tier.toLowerCase()}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── AI spend reports ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 pt-2 text-[11px] uppercase tracking-wider text-ink-tertiary">
        <span className="h-px flex-1 bg-bg-border" />
        <Bot className="h-3 w-3" /> AI spend &amp; agent productivity
        <span className="h-px flex-1 bg-bg-border" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-bg-border bg-bg-card">
          <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <DollarSign className="h-4 w-4 text-accent-green" /> Anthropic spend · last 14 days
            </div>
            <div className="text-[11px] text-ink-tertiary">
              ${(data?.aiSpendStats.total14dUsd ?? 0).toFixed(4)} · {data?.aiSpendStats.calls14d ?? 0} calls
              {data?.aiSpendStats.dailyBudgetUsd != null && <> · budget ${data.aiSpendStats.dailyBudgetUsd}/day</>}
            </div>
          </div>
          <div className="h-56 px-3 py-3">
            {(data?.aiSpendByDay?.length ?? 0) === 0 || data!.aiSpendByDay.every((d) => d.cost === 0) ? (
              <ChartEmpty line="Anthropic spend posts here as agents run. Set ANTHROPIC_API_KEY to start the meter." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data!.aiSpendByDay} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="aiSpend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="d" tick={{ fill: c.axis, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8 }}
                    labelStyle={{ color: c.tooltipLabel }}
                    formatter={(v: number, n: string) => (n === "cost" ? `$${v.toFixed(4)}` : v)}
                  />
                  <Area type="monotone" dataKey="cost" stroke="#22c55e" strokeWidth={2} fill="url(#aiSpend)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-bg-border bg-bg-card">
          <div className="border-b border-bg-border px-5 py-3.5 text-sm font-semibold">
            <span className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-brand-300" /> Spend by agent
            </span>
          </div>
          <div className="space-y-2 px-5 py-3">
            {(data?.aiSpendByAgent?.length ?? 0) === 0 ? (
              <div className="py-6 text-center text-[11px] text-ink-tertiary">
                No agent calls yet. Run a pipeline to see costs.
              </div>
            ) : (
              data!.aiSpendByAgent.map((a) => {
                const max = Math.max(1, ...data!.aiSpendByAgent.map((x) => x.cost));
                return (
                  <div key={a.agent} className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-ink-secondary">{a.agent}</span>
                      <span className="font-mono font-semibold">${a.cost.toFixed(4)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-hover">
                      <div className="h-full bg-gradient-brand" style={{ width: `${(a.cost / max) * 100}%` }} />
                    </div>
                    <div className="mt-0.5 text-[10px] text-ink-tertiary">{a.calls.toLocaleString()} calls</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Discovery output ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 pt-2 text-[11px] uppercase tracking-wider text-ink-tertiary">
        <span className="h-px flex-1 bg-bg-border" />
        <Telescope className="h-3 w-3" /> Top-of-funnel discovery
        <span className="h-px flex-1 bg-bg-border" />
      </div>

      <div className="rounded-xl border border-bg-border bg-bg-card">
        <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Telescope className="h-4 w-4 text-brand-300" /> Discovery output · last 14 days
          </div>
          <div className="text-[11px] text-ink-tertiary">
            {data?.discoveryStats.products ?? 0} products · {data?.discoveryStats.buyers ?? 0} buyers ·{" "}
            {data?.discoveryStats.suppliers ?? 0} suppliers
          </div>
        </div>
        <div className="h-56 px-3 py-3">
          {(data?.discoveryByDay?.reduce(
            (s, d) => s + d.products + d.buyers + d.suppliers,
            0,
          ) ?? 0) === 0 ? (
            <ChartEmpty line="Trend Hunter, Buyer Discovery, and Supplier Finder posts to this chart as agents run." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data!.discoveryByDay} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="d" tick={{ fill: c.axis, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8 }} labelStyle={{ color: c.tooltipLabel }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                <Bar dataKey="products" stackId="d" fill="#a87dff" />
                <Bar dataKey="buyers" stackId="d" fill="#22c55e" />
                <Bar dataKey="suppliers" stackId="d" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Compliance ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 pt-2 text-[11px] uppercase tracking-wider text-ink-tertiary">
        <span className="h-px flex-1 bg-bg-border" />
        <MailX className="h-3 w-3" /> Compliance &amp; deliverability
        <span className="h-px flex-1 bg-bg-border" />
      </div>

      <div className="rounded-xl border border-bg-border bg-bg-card">
        <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MailX className="h-4 w-4 text-accent-amber" /> Suppression list breakdown
          </div>
          <Link href="/admin/suppressions" className="text-[11px] text-brand-300 hover:text-brand-200">
            Open suppressions →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-5">
          <ComplianceTile label="Total suppressed" value={data?.complianceSummary.suppressionTotal ?? 0} tone="default" />
          <ComplianceTile label="Bounces" value={data?.complianceSummary.bounces ?? 0} tone="red" hint="hard bounces" />
          <ComplianceTile label="Complaints" value={data?.complianceSummary.complaints ?? 0} tone="red" hint="spam reports" />
          <ComplianceTile label="Unsubscribes" value={data?.complianceSummary.unsubscribes ?? 0} tone="amber" hint="opt-outs" />
          <ComplianceTile label="Manual / import" value={(data?.complianceSummary.manualAdds ?? 0) + (data?.complianceSummary.imports ?? 0)} tone="default" hint="operator-added" />
        </div>
      </div>
    </div>
  );
}

function ComplianceTile({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: "default" | "red" | "amber";
  hint?: string;
}) {
  const valueClass =
    tone === "red" ? "text-accent-red" : tone === "amber" ? "text-accent-amber" : "";
  return (
    <div className="rounded-lg border border-bg-border bg-bg-hover/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${valueClass}`}>{value.toLocaleString()}</div>
      {hint && <div className="text-[10px] text-ink-tertiary">{hint}</div>}
    </div>
  );
}

function Pct({ label, num, den }: { label: string; num: number | undefined; den: number | undefined }) {
  const pct = den && den > 0 ? ((num ?? 0) / den) * 100 : null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold">
        {pct == null ? "—" : `${pct.toFixed(0)}%`}
      </div>
      <div className="text-[10px] text-ink-tertiary">
        {num ?? 0} of {den ?? 0}
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
  href,
  cta,
}: {
  label: string;
  value: string;
  delta: string;
  positive?: boolean;
  Icon: React.ComponentType<{ className?: string }>;
  href?: string;
  cta?: string;
}) {
  const inner = (
    <>
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
      {href && cta && (
        <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary group-hover:text-ink-primary transition-colors">
          {cta} <TrendingUp className="h-3 w-3" />
        </div>
      )}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="group block rounded-xl border border-bg-border bg-bg-card p-4 ring-1 ring-transparent transition-all hover:bg-bg-hover hover:ring-brand-500/40"
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
