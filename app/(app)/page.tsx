"use client";
import { Calendar, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import KpiGrid from "@/components/dashboard/KpiGrid";
import SetupChecklist from "@/components/dashboard/SetupChecklist";
import TopProductsTable from "@/components/dashboard/TopProductsTable";
import TopBuyersTable from "@/components/dashboard/TopBuyersTable";
import AgentFeed from "@/components/dashboard/AgentFeed";
import {
  CategoryDonut,
  DemandRadar,
  RevenueArea,
} from "@/components/dashboard/Charts";
import {
  AlertsCard,
  CampaignsCard,
  PipelineCard,
  QuickActionsCard,
  TopAgentsCard,
} from "@/components/dashboard/BottomRow";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", weekday: "short" });
}

type StatsHeadline = {
  hasAnyData: boolean;
  totals: { opportunities: number; dealsInPipeline: number; pipelineValueCents: number };
  counts: { products: number; buyers: number; drafts: number; runs: number; transactions: number };
};

export default function DashboardPage() {
  const [name, setName] = useState<string | null>(null);
  const [today] = useState(() => fmtDate(new Date()));
  const [stats, setStats] = useState<StatsHeadline | null>(null);

  useEffect(() => {
    fetch("/api/operator")
      .then((r) => r.json())
      .then((d) => { if (d?.name) setName(d.name.split(" ")[0]); })
      .catch(() => {});
    fetch("/api/dashboard/stats", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (s) setStats(s); })
      .catch(() => {});
  }, []);

  const displayName = name ?? "there";

  // Real subhead — derived from store totals, not a hardcoded "47 overnight"
  function subheadline(): string {
    if (!stats) return "Loading your workspace…";
    if (!stats.hasAnyData) {
      return "Welcome to AVYN Commerce. Run your first pipeline to start surfacing real opportunities.";
    }
    const parts: string[] = [];
    if (stats.counts.products > 0) parts.push(`${stats.counts.products} product${stats.counts.products === 1 ? "" : "s"} discovered`);
    if (stats.counts.buyers > 0) parts.push(`${stats.counts.buyers} buyer${stats.counts.buyers === 1 ? "" : "s"} matched`);
    if (stats.counts.drafts > 0) parts.push(`${stats.counts.drafts} draft${stats.counts.drafts === 1 ? "" : "s"}`);
    if (stats.totals.dealsInPipeline > 0) parts.push(`${stats.totals.dealsInPipeline} active deal${stats.totals.dealsInPipeline === 1 ? "" : "s"}`);
    if (parts.length === 0) return "Workspace ready. Run a pipeline to surface opportunities.";
    return `Live: ${parts.join(" · ")}.`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {greeting()}, {displayName}! <span className="inline-block">👋</span>
          </h1>
          <p className="text-sm text-ink-secondary">{subheadline()}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm text-ink-secondary">
            <Calendar className="h-4 w-4" />
            {today}
          </button>
          <Link
            href="/pipeline"
            className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow"
          >
            <Plus className="h-4 w-4" />
            Run Pipeline
          </Link>
        </div>
      </div>

      <SetupChecklist />

      <KpiGrid />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TopProductsTable />
        </div>
        <div className="grid grid-cols-1 gap-4">
          <TopBuyersTable />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DemandRadar />
        <RevenueArea />
        <CategoryDonut />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AgentFeed />
        <CampaignsCard />
        <AlertsCard />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PipelineCard />
        <TopAgentsCard />
        <QuickActionsCard />
      </div>
    </div>
  );
}
