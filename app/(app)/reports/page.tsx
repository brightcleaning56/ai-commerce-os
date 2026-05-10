"use client";
import {
  Activity,
  BarChart3,
  Calendar,
  Download,
  Filter,
  TrendingDown,
  TrendingUp,
  Users,
  Workflow,
} from "lucide-react";
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
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const REVENUE_BY_MONTH = [
  { m: "Dec", revenue: 38_400, deals: 6 },
  { m: "Jan", revenue: 52_100, deals: 9 },
  { m: "Feb", revenue: 71_800, deals: 12 },
  { m: "Mar", revenue: 98_600, deals: 17 },
  { m: "Apr", revenue: 142_300, deals: 22 },
  { m: "May", revenue: 218_900, deals: 31 },
  { m: "Jun", revenue: 287_400, deals: 38 },
];

const AGENT_ROI = [
  { agent: "Outreach", spend: 1240, revenue: 86_400, roi: 6868 },
  { agent: "Buyer Discovery", spend: 980, revenue: 72_100, roi: 7257 },
  { agent: "Negotiation", spend: 2100, revenue: 64_300, roi: 2962 },
  { agent: "Trend Hunter", spend: 420, revenue: 41_800, roi: 9852 },
  { agent: "CRM Intel", spend: 310, revenue: 28_500, roi: 9094 },
  { agent: "Demand Intel", spend: 280, revenue: 18_400, roi: 6471 },
];

const FUNNEL = [
  { stage: "Buyers identified", value: 4_812, fill: "#7c3aed" },
  { stage: "Contacted", value: 2_451, fill: "#a87dff" },
  { stage: "Opened", value: 1_134, fill: "#3b82f6" },
  { stage: "Replied", value: 654, fill: "#06b6d4" },
  { stage: "Meetings", value: 142, fill: "#22c55e" },
  { stage: "Closed Won", value: 31, fill: "#10b981" },
];

const COHORTS = [
  { week: "W-7", contacted: 412, replied: 58, meetings: 14, closed: 4 },
  { week: "W-6", contacted: 524, replied: 71, meetings: 18, closed: 5 },
  { week: "W-5", contacted: 612, replied: 84, meetings: 21, closed: 6 },
  { week: "W-4", contacted: 698, replied: 97, meetings: 24, closed: 7 },
  { week: "W-3", contacted: 754, replied: 112, meetings: 27, closed: 6 },
  { week: "W-2", contacted: 821, replied: 128, meetings: 31, closed: 8 },
  { week: "W-1", contacted: 897, replied: 142, meetings: 35, closed: 9 },
];

const CATEGORY_REVENUE = [
  { name: "Sports & Outdoors", value: 124_300 },
  { name: "Pet Supplies", value: 86_700 },
  { name: "Home & Kitchen", value: 71_200 },
  { name: "Beauty & Care", value: 52_400 },
  { name: "Electronics", value: 38_900 },
  { name: "Home Decor", value: 24_100 },
];

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export default function ReportsPage() {
  const totalRev = REVENUE_BY_MONTH.reduce((s, m) => s + m.revenue, 0);
  const totalDeals = REVENUE_BY_MONTH.reduce((s, m) => s + m.deals, 0);
  const lastMonth = REVENUE_BY_MONTH.at(-1)!;
  const prevMonth = REVENUE_BY_MONTH.at(-2)!;
  const delta = ((lastMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100;
  const { toast } = useToast();

  function handleExport() {
    const rows = [
      ...REVENUE_BY_MONTH.map((m) => ({ section: "revenue_by_month", month: m.m, revenue_usd: m.revenue, deals: m.deals })),
      ...AGENT_ROI.map((a) => ({ section: "agent_roi", agent: a.agent, spend_usd: a.spend, revenue_usd: a.revenue, roi_pct: a.roi })),
      ...FUNNEL.map((f) => ({ section: "outreach_funnel", stage: f.stage, count: f.value })),
      ...COHORTS.map((c) => ({ section: "weekly_cohorts", week: c.week, contacted: c.contacted, replied: c.replied, meetings: c.meetings, closed: c.closed })),
      ...CATEGORY_REVENUE.map((c) => ({ section: "category_revenue", category: c.name, revenue_usd: c.value })),
    ];
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(`avyn-commerce-report-${date}.csv`, rows);
    toast(`Exported ${rows.length} rows to CSV`);
  }

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
              Trailing 7 months · {totalDeals} deals closed · {fmtUSD(totalRev)} total revenue
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
        <Kpi label="Revenue (latest)" value={fmtUSD(lastMonth.revenue)} delta={`+${delta.toFixed(1)}%`} positive Icon={TrendingUp} />
        <Kpi label="Deals Closed" value={String(lastMonth.deals)} delta={`+${lastMonth.deals - prevMonth.deals}`} positive Icon={Workflow} />
        <Kpi label="Reply Rate" value="14.9%" delta="+1.4pp" positive Icon={Activity} />
        <Kpi label="CAC" value="$382" delta="−12%" positive Icon={Users} />
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
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={REVENUE_BY_MONTH} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a87dff" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#252538" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="m" tick={{ fill: "#6e6e85", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="rev" tick={{ fill: "#6e6e85", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                <YAxis yAxisId="deals" orientation="right" tick={{ fill: "#6e6e85", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#161624", border: "1px solid #252538", borderRadius: 8 }}
                  labelStyle={{ color: "#9b9bb5" }}
                  formatter={(v: number, n: string) => (n === "revenue" ? fmtUSD(v) : v)}
                />
                <Area yAxisId="rev" type="monotone" dataKey="revenue" stroke="#a87dff" strokeWidth={2} fill="url(#rev2)" />
                <Line yAxisId="deals" type="monotone" dataKey="deals" stroke="#22c55e" strokeWidth={2} dot={{ fill: "#22c55e", r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-bg-border bg-bg-card">
          <div className="border-b border-bg-border px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-brand-300" /> Outreach Funnel
            </div>
            <div className="mt-0.5 text-[11px] text-ink-tertiary">Last 30 days</div>
          </div>
          <div className="space-y-2 p-5">
            {FUNNEL.map((s, i) => {
              const pct = (s.value / FUNNEL[0].value) * 100;
              const drop = i > 0 ? ((FUNNEL[i - 1].value - s.value) / FUNNEL[i - 1].value) * 100 : 0;
              return (
                <div key={s.stage}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-secondary">{s.stage}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">{s.value.toLocaleString()}</span>
                      {i > 0 && (
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
              Token spend vs revenue attributed · last 90 days
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
              {AGENT_ROI.map((a) => {
                const max = Math.max(...AGENT_ROI.map((x) => x.roi));
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
                        <div
                          className="h-full bg-gradient-brand"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={CATEGORY_REVENUE} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke="#252538" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#6e6e85", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                <YAxis dataKey="name" type="category" tick={{ fill: "#9b9bb5", fontSize: 11 }} axisLine={false} tickLine={false} width={130} />
                <Tooltip
                  contentStyle={{ background: "#161624", border: "1px solid #252538", borderRadius: 8 }}
                  formatter={(v: number) => fmtUSD(v)}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {CATEGORY_REVENUE.map((_, i) => (
                    <Cell key={i} fill={`hsl(${260 + i * 12}, 70%, ${55 + i * 2}%)`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-bg-border bg-bg-card">
        <div className="border-b border-bg-border px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-brand-300" /> Weekly Cohorts
          </div>
          <div className="mt-0.5 text-[11px] text-ink-tertiary">
            Conversion of contacted buyers, last 7 weeks
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
            {COHORTS.map((c) => {
              const replyPct = (c.replied / c.contacted) * 100;
              const mtgPct = (c.meetings / c.replied) * 100;
              const winPct = (c.closed / c.meetings) * 100;
              return (
                <tr key={c.week} className="border-t border-bg-border">
                  <td className="px-5 py-3 font-medium">{c.week}</td>
                  <td className="px-3 py-3 text-right text-ink-secondary">{c.contacted.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right">{c.replied}</td>
                  <td className="px-3 py-3 text-right text-accent-cyan">{replyPct.toFixed(1)}%</td>
                  <td className="px-3 py-3 text-right">{c.meetings}</td>
                  <td className="px-3 py-3 text-right text-brand-200">{mtgPct.toFixed(1)}%</td>
                  <td className="px-3 py-3 text-right font-semibold">{c.closed}</td>
                  <td className="px-5 py-3 text-right font-bold text-accent-green">{winPct.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
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
