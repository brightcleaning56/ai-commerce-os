"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Activity, BarChart3, PieChart as PieIcon, Sparkles } from "lucide-react";

type ChartData = {
  hasAnyData: boolean;
  charts: {
    categorySeries: Array<{ name: string; value: number; fill: string }>;
    revenueSeries: Array<{ d: string; v: number }>;
    radarSeries: Array<{ axis: string; you: number; market: number }>;
  };
};

let inflight: Promise<ChartData | null> | null = null;
let lastFetched = 0;

async function fetchCharts(): Promise<ChartData | null> {
  const now = Date.now();
  if (inflight && now - lastFetched < 5000) return inflight;
  lastFetched = now;
  inflight = fetch("/api/dashboard/stats", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return inflight;
}

function useChartData() {
  const [data, setData] = useState<ChartData | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchCharts().then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}

function EmptyChart({ title, line }: { title: string; line?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/15">
        <Sparkles className="h-5 w-5 text-brand-300" />
      </div>
      <div className="text-sm font-medium">{title}</div>
      {line && <div className="text-[11px] text-ink-tertiary max-w-xs">{line}</div>}
      <Link
        href="/pipeline"
        className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow"
      >
        <Sparkles className="h-3 w-3" /> Run pipeline
      </Link>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function DemandRadar() {
  const data = useChartData();
  const series = data?.charts.radarSeries ?? [];
  const hasNone = data && series.every((s) => s.you === 0);

  return (
    <Card className="h-full">
      <CardHeader title="Demand Intelligence Overview" icon={<Activity className="h-4 w-4 text-brand-300" />} />
      <div className="h-72 px-3 py-2">
        {hasNone ? (
          <EmptyChart
            title="No products to analyze"
            line="Discover products via /pipeline. Demand axes are computed from real product scores."
          />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={series} outerRadius="70%">
              <PolarGrid stroke="#252538" />
              <PolarAngleAxis dataKey="axis" tick={{ fill: "#9b9bb5", fontSize: 11 }} />
              <Radar name="Your Catalog" dataKey="you" stroke="#a87dff" fill="#7c3aed" fillOpacity={0.35} />
              <Radar name="Market Avg" dataKey="market" stroke="#6e6e85" fill="#6e6e85" fillOpacity={0.1} />
            </RadarChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="flex items-center justify-center gap-5 pb-3 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-brand-400" /> Your Catalog
        </span>
        <span className="flex items-center gap-1.5 text-ink-tertiary">
          <span className="h-2 w-2 rounded-full bg-ink-tertiary" /> Market Avg
        </span>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function RevenueArea() {
  const data = useChartData();
  const series = data?.charts.revenueSeries ?? [];
  const hasNone = data && series.length === 0;

  return (
    <Card className="h-full">
      <CardHeader
        title="Platform Revenue Over Time"
        icon={<BarChart3 className="h-4 w-4 text-brand-300" />}
        right={<span className="text-[11px] text-ink-tertiary">Last 12 months</span>}
      />
      <div className="h-72 px-2 py-3">
        {hasNone ? (
          <EmptyChart
            title="No revenue yet"
            line="Once a transaction reaches Released or Refunded, platform fees + escrow fees post here per month."
          />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a87dff" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#252538" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="d" tick={{ fill: "#6e6e85", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6e6e85", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#161624", border: "1px solid #252538", borderRadius: 8 }}
                labelStyle={{ color: "#9b9bb5" }}
                formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "Platform fees"]}
              />
              <Area type="monotone" dataKey="v" stroke="#a87dff" strokeWidth={2} fill="url(#rev)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function CategoryDonut() {
  const data = useChartData();
  const series = data?.charts.categorySeries ?? [];
  const hasNone = data && series.length === 0;
  const total = series.reduce((s, c) => s + c.value, 0);

  return (
    <Card className="h-full">
      <CardHeader title="Opportunities by Category" icon={<PieIcon className="h-4 w-4 text-brand-300" />} />
      {hasNone ? (
        <div className="h-56 px-4">
          <EmptyChart title="No products yet" line="Categories are derived from discovered products." />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 px-4 py-2">
          <div className="relative h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={series} dataKey="value" innerRadius={48} outerRadius={78} paddingAngle={2} stroke="none">
                  {series.map((c) => (
                    <Cell key={c.name} fill={c.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-2xl font-bold">{total.toLocaleString()}</div>
              <div className="text-[11px] text-ink-tertiary">Total</div>
            </div>
          </div>
          <div className="flex flex-col justify-center gap-2 text-xs">
            {series.map((c) => {
              const pct = total === 0 ? 0 : ((c.value / total) * 100).toFixed(0);
              return (
                <div key={c.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: c.fill }} />
                    <span className="text-ink-secondary truncate">{c.name}</span>
                  </span>
                  <span className="text-ink-tertiary">
                    {pct}% ({c.value})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="border-t border-bg-border px-5 py-3 text-center">
        <Link href="/products" className="text-xs text-brand-300 hover:text-brand-200">
          View Product Discovery →
        </Link>
      </div>
    </Card>
  );
}
