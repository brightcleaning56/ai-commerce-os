"use client";
import {
  ArrowUpRight,
  Building2,
  Calendar,
  Code2,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Globe,
  Lock,
  Sparkles,
  Telescope,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CURRENT_TIER,
  FORECASTS,
  INTENT_REPORTS,
  MARKETS,
  type Forecast,
  type IntentReport,
} from "@/lib/insights";
import Drawer from "@/components/ui/Drawer";

const COMP_TONE: Record<string, string> = {
  Low: "bg-accent-green/15 text-accent-green",
  Medium: "bg-accent-amber/15 text-accent-amber",
  High: "bg-accent-red/15 text-accent-red",
};

const TIER_TONE: Record<string, string> = {
  Free: "bg-bg-hover text-ink-secondary",
  Pro: "bg-brand-500/15 text-brand-200",
  Enterprise: "bg-gradient-brand text-white",
};

const FORMAT_ICON = {
  CSV: FileSpreadsheet,
  API: Code2,
  PDF: FileText,
} as const;

function isLocked(tier: "Free" | "Pro" | "Enterprise") {
  if (tier === "Free") return false;
  if (tier === "Pro") return CURRENT_TIER === "Free";
  return CURRENT_TIER !== "Enterprise";
}

function ForecastDetail({ f }: { f: Forecast }) {
  const locked = isLocked(f.tier);
  return (
    <div className="space-y-5 p-5">
      <div className="flex items-start gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-xl bg-gradient-card text-3xl">
          {f.emoji}
        </div>
        <div className="flex-1">
          <div className="text-xl font-bold">{f.product}</div>
          <div className="text-xs text-ink-tertiary">{f.category}</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-md bg-accent-green/15 px-2 py-0.5 text-[11px] font-semibold text-accent-green">
              +{f.predictedLift}% predicted
            </span>
            <span className="rounded-md bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-200">
              Confidence {f.confidence}%
            </span>
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${TIER_TONE[f.tier]}`}>
              {f.tier}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-bg-border bg-bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
            Horizon
          </div>
          <div className="mt-1 text-base font-semibold">{f.horizonDays}d</div>
        </div>
        <div className="rounded-lg border border-bg-border bg-bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
            Predicted Peak
          </div>
          <div className="mt-1 text-base font-semibold">{f.riseDate}</div>
        </div>
        <div className="rounded-lg border border-bg-border bg-bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
            Sources
          </div>
          <div className="mt-1 text-base font-semibold">{f.basedOn.length}</div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold">30-Day Projection</div>
        <div className="rounded-lg border border-bg-border bg-bg-card p-3">
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={f.series}>
                <defs>
                  <linearGradient id={`hist-${f.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a87dff" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#a87dff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id={`pred-${f.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="d" tick={{ fill: "#6e6e85", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6e6e85", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#161624", border: "1px solid #252538", borderRadius: 8 }}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#a87dff"
                  strokeWidth={2}
                  fill={`url(#hist-${f.id})`}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="predicted"
                  stroke="#22c55e"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  fill={`url(#pred-${f.id})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-3 rounded-full bg-brand-400" /> Observed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-3 rounded-full bg-accent-green" /> AI Forecast
            </span>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold">Signal Inputs</div>
        <div className="flex flex-wrap gap-1.5">
          {f.basedOn.map((s) => (
            <span
              key={s}
              className="rounded-md border border-bg-border bg-bg-hover/40 px-2 py-1 text-[11px] text-ink-secondary"
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-200">
          <Sparkles className="h-4 w-4" /> AI Rationale
        </div>
        <p className="mt-1 text-xs text-ink-secondary">{f.rationale}</p>
      </div>

      {locked ? (
        <div className="rounded-lg border border-accent-amber/40 bg-accent-amber/5 p-4 text-center">
          <Lock className="mx-auto h-6 w-6 text-accent-amber" />
          <div className="mt-2 text-sm font-semibold">Locked behind {f.tier}</div>
          <p className="mt-1 text-xs text-ink-secondary">
            Upgrade to unlock the full report, alert, and CSV export.
          </p>
          <button className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-xs font-semibold shadow-glow">
            Upgrade to {f.tier}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 pb-2">
          <button className="flex items-center justify-center gap-2 rounded-lg bg-gradient-brand py-2.5 text-sm font-semibold shadow-glow">
            <Zap className="h-4 w-4" /> Set Rise Alert
          </button>
          <button className="flex items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card py-2.5 text-sm">
            <Download className="h-4 w-4" /> Export Report
          </button>
        </div>
      )}
    </div>
  );
}

function IntentDetail({ r }: { r: IntentReport }) {
  const locked = isLocked(r.tier);
  return (
    <div className="space-y-5 p-5">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
          Buyer Intent Report
        </div>
        <div className="text-xl font-bold">{r.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md bg-brand-500/15 px-2 py-0.5 font-semibold text-brand-200">
            {r.buyerCount.toLocaleString()} buyers
          </span>
          <span className="text-ink-tertiary">·</span>
          <span className="text-ink-secondary">{r.industry}</span>
          <span className="text-ink-tertiary">·</span>
          <span className="text-ink-secondary">{r.region}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-bg-border bg-bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
            Signal
          </div>
          <div className="mt-1 text-xs">{r.signal}</div>
        </div>
        <div className="rounded-lg border border-bg-border bg-bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
            Freshness
          </div>
          <div className="mt-1 text-xs">{r.freshness}</div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold">
          Sample Buyers ({locked ? `${r.sample.length} of ${r.buyerCount}` : `${r.sample.length} preview`})
        </div>
        <div className="space-y-1.5">
          {r.sample.map((s) => (
            <div
              key={s.company}
              className="flex items-center justify-between rounded-lg border border-bg-border bg-bg-card px-3 py-2"
            >
              <div>
                <div className="text-sm font-medium">{s.company}</div>
                <div className="text-[11px] text-ink-tertiary">{s.trigger}</div>
              </div>
              <span className="rounded-md bg-brand-500/15 px-2 py-0.5 text-xs font-semibold text-brand-200">
                {s.score}
              </span>
            </div>
          ))}
          {locked && (
            <div className="rounded-lg border border-dashed border-bg-border bg-bg-hover/30 px-3 py-3 text-center text-xs text-ink-tertiary">
              + {r.buyerCount - r.sample.length} more buyers in full report
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold">Delivery Format</div>
        <div className="flex flex-wrap gap-1.5">
          {r.format.map((f) => {
            const I = FORMAT_ICON[f];
            return (
              <span
                key={f}
                className="flex items-center gap-1 rounded-md border border-bg-border bg-bg-hover/40 px-2 py-1 text-[11px] text-ink-secondary"
              >
                <I className="h-3 w-3 text-brand-300" /> {f}
              </span>
            );
          })}
        </div>
      </div>

      {locked ? (
        <div className="rounded-lg border border-accent-amber/40 bg-accent-amber/5 p-4 text-center">
          <Lock className="mx-auto h-6 w-6 text-accent-amber" />
          <div className="mt-2 text-sm font-semibold">
            {r.price > 0 ? `$${r.price.toLocaleString()} one-time` : `Included with ${r.tier}`}
          </div>
          <p className="mt-1 text-xs text-ink-secondary">
            Unlock {r.buyerCount.toLocaleString()} verified buyers with triggers, contacts, and intent scores.
          </p>
          <button className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-xs font-semibold shadow-glow">
            {r.price > 0 ? `Buy Report · $${r.price.toLocaleString()}` : `Upgrade to ${r.tier}`}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 pb-2">
          <button className="flex items-center justify-center gap-2 rounded-lg bg-gradient-brand py-2.5 text-sm font-semibold shadow-glow">
            <Download className="h-4 w-4" /> Download CSV
          </button>
          <button className="flex items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card py-2.5 text-sm">
            <Code2 className="h-4 w-4" /> Stream via API
          </button>
        </div>
      )}
    </div>
  );
}

export default function InsightsPage() {
  const [tab, setTab] = useState<"forecasts" | "intent" | "markets">("forecasts");
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [intent, setIntent] = useState<IntentReport | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Telescope className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Insights &amp; Forecasts</h1>
            <p className="text-xs text-ink-secondary">
              Predictive trends + buyer intent · current tier:{" "}
              <span className="text-brand-300">{CURRENT_TIER}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm">
            <Database className="h-4 w-4" /> Browse Data Catalog
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow">
            <ArrowUpRight className="h-4 w-4" /> Upgrade to Enterprise
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-bg-border bg-bg-card p-1 text-xs">
        {(
          [
            ["forecasts", "Trend Forecasts", FORECASTS.length],
            ["intent", "Buyer Intent Reports", INTENT_REPORTS.length],
            ["markets", "Market Snapshots", MARKETS.length],
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

      {tab === "forecasts" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {FORECASTS.map((f) => {
            const locked = isLocked(f.tier);
            return (
              <button
                key={f.id}
                onClick={() => setForecast(f)}
                className="group relative rounded-xl border border-bg-border bg-bg-card p-4 text-left transition hover:border-brand-500/50 hover:shadow-glow"
              >
                {locked && (
                  <div className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-accent-amber/15 text-accent-amber">
                    <Lock className="h-3.5 w-3.5" />
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-lg bg-gradient-card text-2xl">
                    {f.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold leading-tight">{f.product}</div>
                    <div className="text-[11px] text-ink-tertiary">{f.category}</div>
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-accent-green">
                    +{f.predictedLift}%
                  </span>
                  <span className="text-[11px] text-ink-tertiary">in {f.horizonDays}d</span>
                </div>
                <div className="mt-3 h-12">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={f.series}>
                      <defs>
                        <linearGradient id={`spark-${f.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#a87dff" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#a87dff" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="v"
                        stroke="#a87dff"
                        strokeWidth={1.5}
                        fill={`url(#spark-${f.id})`}
                        isAnimationActive={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="predicted"
                        stroke="#22c55e"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                        fill="transparent"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 text-ink-tertiary">
                    <Calendar className="h-3 w-3" /> {f.riseDate}
                  </span>
                  <span className="text-brand-300">Confidence {f.confidence}%</span>
                </div>
                <div className="mt-2">
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${TIER_TONE[f.tier]}`}>
                    {f.tier}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {tab === "intent" && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {INTENT_REPORTS.map((r) => {
            const locked = isLocked(r.tier);
            return (
              <button
                key={r.id}
                onClick={() => setIntent(r)}
                className="group relative rounded-xl border border-bg-border bg-bg-card p-5 text-left transition hover:border-brand-500/50 hover:shadow-glow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/15 text-brand-300">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${TIER_TONE[r.tier]}`}>
                    {r.tier}
                  </span>
                </div>
                <div className="mt-3 text-base font-semibold leading-tight">
                  {r.title}
                </div>
                <div className="mt-1 text-[11px] text-ink-tertiary">
                  {r.industry} · {r.region}
                </div>

                <div className="mt-4 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-brand-200">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {r.buyerCount.toLocaleString()} buyers
                  </div>
                  <div className="text-ink-tertiary">{r.freshness}</div>
                </div>

                <div className="mt-3 flex items-center gap-1.5">
                  {r.format.map((f) => {
                    const I = FORMAT_ICON[f];
                    return (
                      <span
                        key={f}
                        className="grid h-6 w-6 place-items-center rounded-md bg-bg-hover/60 text-brand-300"
                      >
                        <I className="h-3 w-3" />
                      </span>
                    );
                  })}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-bg-border pt-3 text-xs">
                  <span className="text-ink-tertiary">
                    {r.price > 0 ? `One-time` : `Included with ${r.tier}`}
                  </span>
                  <span className="font-bold">
                    {r.price > 0 ? `$${r.price.toLocaleString()}` : "Included"}
                  </span>
                </div>

                {locked && (
                  <div className="absolute inset-x-5 bottom-2 flex items-center gap-1.5 text-[10px] text-accent-amber">
                    <Lock className="h-3 w-3" /> Upgrade or buy to unlock full list
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {tab === "markets" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MARKETS.map((m) => (
            <div
              key={m.category}
              className="rounded-xl border border-bg-border bg-bg-card p-4"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-gradient-card text-2xl">
                  {m.emoji}
                </div>
                <div>
                  <div className="font-semibold">{m.category}</div>
                  <div className="text-[11px] text-ink-tertiary">
                    Top region: {m.topRegion}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-md bg-bg-hover/40 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                    30d Growth
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-accent-green">
                    +{m.growth30d.toFixed(1)}%
                  </div>
                </div>
                <div className="rounded-md bg-bg-hover/40 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                    Buyer Activity
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-brand-200">
                    {m.buyerActivity}/100
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px]">
                <span className="text-ink-tertiary">Competition</span>
                <span
                  className={`rounded-md px-2 py-0.5 font-medium ${COMP_TONE[m.competition]}`}
                >
                  {m.competition}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/20">
            <Globe className="h-5 w-5 text-brand-200" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">
              Sell your data to other AI Commerce OS users
            </div>
            <p className="mt-1 text-xs text-ink-secondary">
              Enterprise customers can publish proprietary buyer intent + trend data into the marketplace and earn 70% revenue share on every download.
            </p>
            <button className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-300 hover:text-brand-200">
              Apply to publish data <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      <Drawer
        open={!!forecast}
        onClose={() => setForecast(null)}
        title="Trend Forecast"
        width="max-w-2xl"
      >
        {forecast && <ForecastDetail f={forecast} />}
      </Drawer>
      <Drawer
        open={!!intent}
        onClose={() => setIntent(null)}
        title="Buyer Intent Report"
        width="max-w-2xl"
      >
        {intent && <IntentDetail r={intent} />}
      </Drawer>
    </div>
  );
}
