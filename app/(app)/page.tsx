"use client";
import { Calendar, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import KpiGrid from "@/components/dashboard/KpiGrid";
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

export default function DashboardPage() {
  const [name, setName] = useState<string | null>(null);
  const [today] = useState(() => fmtDate(new Date()));

  useEffect(() => {
    fetch("/api/operator")
      .then((r) => r.json())
      .then((d) => { if (d?.name) setName(d.name.split(" ")[0]); })
      .catch(() => {});
  }, []);

  const displayName = name ?? "there";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {greeting()}, {displayName}! <span className="inline-block">👋</span>
          </h1>
          <p className="text-sm text-ink-secondary">
            Your AI agents have generated 47 new opportunities overnight.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm text-ink-secondary">
            <Calendar className="h-4 w-4" />
            {today}
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow">
            <Plus className="h-4 w-4" />
            Create New
          </button>
        </div>
      </div>

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
