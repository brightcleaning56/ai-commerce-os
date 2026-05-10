"use client";
import { Activity, AlertTriangle, Bot, CheckCircle2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";

type AgentRun = {
  id: string;
  agent: "trend-hunter" | "buyer-discovery" | "supplier-finder" | "outreach" | "negotiation" | "risk";
  startedAt: string;
  finishedAt: string;
  status: "success" | "error";
  productCount: number;
  buyerCount?: number;
  supplierCount?: number;
  inputProductName?: string;
  estCostUsd?: number;
  errorMessage?: string;
  usedFallback?: boolean;
};

const AGENT_LABEL: Record<string, string> = {
  "trend-hunter": "Trend Hunter Agent",
  "buyer-discovery": "Buyer Discovery Agent",
  "supplier-finder": "Supplier Finder Agent",
  outreach: "Outreach Agent",
  negotiation: "Negotiation Agent",
  risk: "Risk Agent",
};

const AGENT_TONE: Record<string, string> = {
  "trend-hunter": "bg-brand-400/20",
  "buyer-discovery": "bg-accent-blue/20",
  "supplier-finder": "bg-accent-amber/20",
  outreach: "bg-accent-cyan/20",
  negotiation: "bg-accent-green/20",
  risk: "bg-accent-red/20",
};

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function describeRun(r: AgentRun): string {
  switch (r.agent) {
    case "trend-hunter":
      return r.status === "success"
        ? `Discovered ${r.productCount} trending product${r.productCount === 1 ? "" : "s"}`
        : "Failed to discover products";
    case "buyer-discovery":
      return r.status === "success"
        ? `Matched ${r.buyerCount ?? 0} buyer${r.buyerCount === 1 ? "" : "s"}${r.inputProductName ? ` for "${r.inputProductName}"` : ""}`
        : "Buyer discovery failed";
    case "supplier-finder":
      return r.status === "success"
        ? `Surfaced ${r.supplierCount ?? 0} supplier${r.supplierCount === 1 ? "" : "s"}${r.inputProductName ? ` for "${r.inputProductName}"` : ""}`
        : "Supplier finder failed";
    case "outreach":
      return r.status === "success"
        ? `Drafted outreach${r.inputProductName ? ` for ${r.inputProductName}` : ""}`
        : "Outreach drafting failed";
    case "negotiation":
      return r.status === "success" ? "Reviewed negotiation thread" : "Negotiation step failed";
    case "risk":
      return r.status === "success" ? "Risk scan complete" : "Risk scan failed";
    default:
      return r.status === "success" ? "Step complete" : "Step failed";
  }
}

export default function AgentFeed() {
  const [runs, setRuns] = useState<AgentRun[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch("/api/agent-runs", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled) return;
          const all: AgentRun[] = d?.runs ?? [];
          // Newest first, top 8
          const sorted = [...all].sort(
            (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
          );
          setRuns(sorted.slice(0, 8));
        })
        .catch(() => {
          if (!cancelled) setRuns([]);
        });
    }
    load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="AI Agent Activity Feed"
        icon={<Activity className="h-4 w-4 text-brand-300" />}
        right={
          runs && runs.length > 0 ? (
            <span className="flex items-center gap-1.5 text-[11px] text-accent-green">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-green shadow-[0_0_8px_#22c55e]" />
              Live
            </span>
          ) : null
        }
      />
      <div className="flex-1 divide-y divide-bg-border">
        {runs && runs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/15">
              <Sparkles className="h-5 w-5 text-brand-300" />
            </div>
            <div className="text-sm font-medium">No agent runs yet</div>
            <div className="text-[11px] text-ink-tertiary max-w-sm">
              When AVYN agents fire (manual or scheduled), each step lands here in real time.
            </div>
          </div>
        ) : (
          (runs ?? []).map((r) => (
            <div key={r.id} className="flex items-start gap-3 px-5 py-3">
              <div className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md ${AGENT_TONE[r.agent] ?? "bg-brand-400/20"}`}>
                <Bot className="h-3.5 w-3.5 text-ink-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  {AGENT_LABEL[r.agent] ?? r.agent}
                  {r.status === "success" ? (
                    <CheckCircle2 className="h-3 w-3 text-accent-green" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-accent-red" />
                  )}
                  {r.usedFallback && (
                    <span className="rounded-sm bg-bg-hover px-1 py-0.5 text-[9px] uppercase text-ink-tertiary">
                      fallback
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-ink-secondary">{describeRun(r)}</div>
              </div>
              <div className="text-[11px] text-ink-tertiary">{relTime(r.startedAt)}</div>
            </div>
          ))
        )}
        {runs === null &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={`skel-${i}`} className="px-5 py-3">
              <div className="h-9 animate-pulse rounded-md bg-bg-hover/40" />
            </div>
          ))}
      </div>
      <div className="border-t border-bg-border px-5 py-3 text-center">
        <Link href="/agent-runs" className="text-xs text-brand-300 hover:text-brand-200">
          View All Activity →
        </Link>
      </div>
    </Card>
  );
}
