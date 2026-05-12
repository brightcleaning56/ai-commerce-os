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
  // Each tile is a Link to the most relevant detail page. The href +
  // hint match the metric so an operator clicking "Buyers Contacted"
  // lands on the surface where they can act on those drafts.
  type TileTone = "brand" | "amber" | "blue" | "cyan" | "green";
  type Tile = {
    label: string;
    Icon: typeof Boxes;
    tone: TileTone;
    value: string;
    sub: string;
    href: string;
    cta: string;          // hover hint shown bottom-right of the card
  };
  const cards: Tile[] = [
    {
      label: "Total Opportunities",
      Icon: Boxes,
      tone: "brand",
      value: t ? fmtNum(t.opportunities) : "—",
      sub: "products + buyers + drafts",
      href: "/products",
      cta: "Open Product Discovery →",
    },
    {
      label: "High Demand Products",
      Icon: Flame,
      tone: "amber",
      value: t ? fmtNum(t.highDemandProducts) : "—",
      sub: "demand score ≥ 70",
      href: "/products",
      cta: "Filter by demand →",
    },
    {
      label: "Buyers Contacted",
      Icon: Users,
      tone: "blue",
      value: t ? fmtNum(t.buyersContacted) : "—",
      sub: "outreach drafts sent",
      href: "/outreach",
      cta: "Open Outreach →",
    },
    {
      label: "Responses Received",
      Icon: MessageCircle,
      tone: "cyan",
      value: t ? fmtNum(t.responsesReceived) : "—",
      sub:
        t && t.buyersContacted > 0
          ? `${((t.responsesReceived / t.buyersContacted) * 100).toFixed(1)}% reply rate`
          : "no replies yet",
      href: "/outreach",
      cta: "View threads →",
    },
    {
      label: "Deals in Pipeline",
      Icon: Briefcase,
      tone: "green",
      value: t ? fmtNum(t.dealsInPipeline) : "—",
      sub: t ? `Value ${fmtCents(t.pipelineValueCents)}` : "—",
      href: "/crm",
      cta: "Open CRM →",
    },
    {
      label: "Est. Revenue",
      Icon: DollarSign,
      tone: "amber",
      value: t ? fmtCents(t.estRevenueCents) : "—",
      sub: "in-flight + released",
      href: "/earnings",
      cta: "Open Earnings →",
    },
  ];

  const toneMap: Record<TileTone, { bg: string; text: string; ring: string }> = {
    brand: { bg: "bg-brand-500/10", text: "text-brand-300", ring: "hover:border-brand-500/50" },
    amber: { bg: "bg-accent-amber/10", text: "text-accent-amber", ring: "hover:border-accent-amber/50" },
    blue: { bg: "bg-accent-blue/10", text: "text-accent-blue", ring: "hover:border-accent-blue/50" },
    cyan: { bg: "bg-accent-cyan/10", text: "text-accent-cyan", ring: "hover:border-accent-cyan/50" },
    green: { bg: "bg-accent-green/10", text: "text-accent-green", ring: "hover:border-accent-green/50" },
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((k) => {
        const tone = toneMap[k.tone];
        return (
          <Link
            key={k.label}
            href={k.href}
            // The whole card is the click target. Group lets the cta
            // appear on hover. Keyboard-focusable since it's a Link.
            className={`group block rounded-xl border border-bg-border bg-bg-card p-4 transition focus:outline-none focus:ring-2 focus:ring-brand-500/40 ${tone.ring} hover:bg-bg-hover/30`}
            title={k.cta}
          >
            <div className="flex items-center justify-between">
              <div className={`grid h-9 w-9 place-items-center rounded-lg ${tone.bg}`}>
                <k.Icon className={`h-4 w-4 ${tone.text}`} />
              </div>
              <span
                className={`text-[10px] font-semibold opacity-0 transition group-hover:opacity-100 ${tone.text}`}
              >
                Open
              </span>
            </div>
            <div className="mt-3 text-[11px] uppercase tracking-wider text-ink-tertiary">
              {k.label}
            </div>
            <div className="mt-1 text-2xl font-bold">{k.value}</div>
            <div className="mt-0.5 text-[11px] text-ink-tertiary">{k.sub}</div>
            <div className="mt-3 flex items-center justify-between">
              <div className={`h-0.5 flex-1 rounded-full bg-bg-hover/60`} />
              <span
                className={`ml-2 text-[10px] opacity-60 transition group-hover:opacity-100 ${tone.text}`}
              >
                {k.cta}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
