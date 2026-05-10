"use client";
import {
  Boxes,
  Briefcase,
  DollarSign,
  Flame,
  MessageCircle,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import Sparkline from "@/components/ui/Sparkline";

type Stats = {
  hasAnyData: boolean;
  totals: {
    opportunities: number;
    highDemandProducts: number;
    buyersContacted: number;
    responsesReceived: number;
    dealsInPipeline: number;
    pipelineValueCents: number;
    estRevenueCents: number;
  };
};

const sparkData = (seed: number) =>
  Array.from({ length: 16 }, (_, i) =>
    Math.round(40 + Math.sin(i / 2 + seed) * 12 + i * (1 + (seed % 3))),
  );

function fmtCents(n: number) {
  if (n >= 1_000_000_00) return `$${(n / 1_000_000_00).toFixed(2)}M`;
  if (n >= 1_000_00) return `$${(n / 1_000_00).toFixed(1)}K`;
  return `$${(n / 100).toFixed(0)}`;
}

function fmtNum(n: number) {
  return n.toLocaleString("en-US");
}

export default function KpiGrid() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/stats", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setStats(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Empty state on a fresh install — surface the path to first run instead
  // of pretending demo numbers are real.
  if (stats && !stats.hasAnyData) {
    return (
      <div className="rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-500/5 to-transparent p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-500/15">
            <Sparkles className="h-6 w-6 text-brand-300" />
          </div>
          <div className="flex-1">
            <div className="text-base font-semibold">No data yet — let's run your first pipeline</div>
            <p className="mt-1 text-sm text-ink-secondary">
              Once you click <strong>Run Pipeline</strong>, the AVYN agents discover trending products,
              find buyers, and draft outreach. KPIs and lead tables fill in automatically.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/pipeline"
                className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-xs font-semibold shadow-glow"
              >
                <Sparkles className="h-3.5 w-3.5" /> Run first pipeline
              </Link>
              <Link
                href="/products"
                className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-xs hover:bg-bg-hover"
              >
                <Boxes className="h-3.5 w-3.5" /> Browse Product Discovery
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const t = stats?.totals;
  const cards = [
    { label: "Total Opportunities", Icon: Boxes, tone: "brand", value: t ? fmtNum(t.opportunities) : "—", sub: "products + buyers + drafts" },
    { label: "High Demand Products", Icon: Flame, tone: "amber", value: t ? fmtNum(t.highDemandProducts) : "—", sub: "demand score ≥ 70" },
    { label: "Buyers Contacted", Icon: Users, tone: "blue", value: t ? fmtNum(t.buyersContacted) : "—", sub: "outreach drafts sent" },
    {
      label: "Responses Received",
      Icon: MessageCircle,
      tone: "cyan",
      value: t ? fmtNum(t.responsesReceived) : "—",
      sub: t && t.buyersContacted > 0
        ? `${((t.responsesReceived / t.buyersContacted) * 100).toFixed(1)}% reply rate`
        : "no replies yet",
    },
    { label: "Deals in Pipeline", Icon: Briefcase, tone: "green", value: t ? fmtNum(t.dealsInPipeline) : "—", sub: t ? `Value ${fmtCents(t.pipelineValueCents)}` : "—" },
    { label: "Est. Revenue", Icon: DollarSign, tone: "amber", value: t ? fmtCents(t.estRevenueCents) : "—", sub: "in-flight + released" },
  ] as const;

  const toneMap: Record<string, { bg: string; text: string; line: string }> = {
    brand: { bg: "bg-brand-500/10", text: "text-brand-300", line: "#a87dff" },
    amber: { bg: "bg-accent-amber/10", text: "text-accent-amber", line: "#f59e0b" },
    blue: { bg: "bg-accent-blue/10", text: "text-accent-blue", line: "#3b82f6" },
    cyan: { bg: "bg-accent-cyan/10", text: "text-accent-cyan", line: "#06b6d4" },
    green: { bg: "bg-accent-green/10", text: "text-accent-green", line: "#22c55e" },
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((k, idx) => {
        const tone = toneMap[k.tone] ?? toneMap.brand;
        return (
          <div key={k.label} className="rounded-xl border border-bg-border bg-bg-card p-4">
            <div className="flex items-center justify-between">
              <div className={`grid h-9 w-9 place-items-center rounded-lg ${tone.bg}`}>
                <k.Icon className={`h-4 w-4 ${tone.text}`} />
              </div>
            </div>
            <div className="mt-3 text-[11px] uppercase tracking-wider text-ink-tertiary">
              {k.label}
            </div>
            <div className="mt-1 text-2xl font-bold">{k.value}</div>
            <div className="mt-0.5 text-[11px] text-ink-tertiary">{k.sub}</div>
            <div className="mt-2">
              <Sparkline data={sparkData(idx)} color={tone.line} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
