"use client";
import {
  Bot, Brain, ChevronRight, Clock, Factory, MessageSquare,
  Play, Search, Send, Settings, ShieldAlert, TrendingUp, Users, Workflow,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type AgentStatus = "Running" | "Idle" | "Paused" | "Learning";

// Static agent metadata — describes the system architecture. Runtime stats
// (tasks24h, lastRun, successRate, etc.) are computed from real agent runs
// in useAgentRuntime() below.
type Agent = {
  /** Internal agent key, matches AgentRun.agent values from /api/agent-runs */
  key: "trend-hunter" | "demand-intelligence" | "supplier-finder" | "buyer-discovery"
       | "outreach" | "negotiation" | "crm-intelligence" | "risk" | "learning";
  name: string;
  desc: string;
  defaultStatus: AgentStatus;
  Icon: React.ComponentType<{ className?: string }>;
  mode: string;
  color: string;
};

const AGENTS: Agent[] = [
  { key: "trend-hunter",        name: "Trend Hunter",         desc: "Scans Reddit, Hacker News, and product launch feeds 24/7",     defaultStatus: "Idle", Icon: Search,         mode: "Auto",       color: "#7c3aed" },
  { key: "demand-intelligence", name: "Demand Intelligence",  desc: "Scores demand 0–100 from multi-source signals",                 defaultStatus: "Idle", Icon: TrendingUp,     mode: "Auto",       color: "#a87dff" },
  { key: "supplier-finder",     name: "Supplier Finder",      desc: "Surfaces verified manufacturers & dropshippers",                defaultStatus: "Idle", Icon: Factory,        mode: "Auto",       color: "#3b82f6" },
  { key: "buyer-discovery",     name: "Buyer Discovery",      desc: "Finds retailers and decision-makers with intent",               defaultStatus: "Idle", Icon: Users,          mode: "Auto",       color: "#06b6d4" },
  { key: "outreach",            name: "Outreach Agent",       desc: "Personalized email, SMS, and LinkedIn sequences",               defaultStatus: "Idle", Icon: Send,           mode: "Auto",       color: "#22c55e" },
  { key: "negotiation",         name: "Negotiation Agent",    desc: "Handles objections, counters, and books calls",                 defaultStatus: "Idle", Icon: MessageSquare,  mode: "Supervised", color: "#10b981" },
  { key: "crm-intelligence",    name: "CRM Intelligence",     desc: "Routes leads, updates stages, predicts churn",                  defaultStatus: "Idle", Icon: Workflow,       mode: "Auto",       color: "#f59e0b" },
  { key: "risk",                name: "Risk Agent",           desc: "Detects fraud, scam suppliers, trademark hits",                 defaultStatus: "Idle", Icon: ShieldAlert,    mode: "Auto",       color: "#ef4444" },
  { key: "learning",            name: "Learning Agent",       desc: "Optimizes prompts, sources, and pricing weekly",                defaultStatus: "Idle", Icon: Brain,          mode: "Scheduled",  color: "#8b5cf6" },
];

type AgentRun = {
  id: string;
  agent: string;
  startedAt: string;
  finishedAt: string;
  status: "success" | "error";
  estCostUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  usedFallback?: boolean;
};

type RuntimeStats = {
  tasks24h: number;
  lastRunAt: string | null;
  successRate: number; // 0..100
  totalRuns: number;
  tokensUsed: number;
  status: AgentStatus;
};

function relTime(iso: string | null): string {
  if (!iso) return "Never";
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

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function useAgentRuntime() {
  const [stats, setStats] = useState<Record<string, RuntimeStats> | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch("/api/agent-runs", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled) return;
          const runs: AgentRun[] = d?.runs ?? [];
          const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
          const byAgent: Record<string, RuntimeStats> = {};
          for (const a of AGENTS) {
            byAgent[a.key] = {
              tasks24h: 0, lastRunAt: null, successRate: 0, totalRuns: 0, tokensUsed: 0,
              status: a.defaultStatus,
            };
          }
          for (const r of runs) {
            const k = r.agent;
            if (!byAgent[k]) continue;
            const cur = byAgent[k];
            cur.totalRuns++;
            if (new Date(r.startedAt).getTime() >= dayAgo) cur.tasks24h++;
            if (!cur.lastRunAt || r.startedAt > cur.lastRunAt) cur.lastRunAt = r.startedAt;
            cur.tokensUsed += (r.inputTokens ?? 0) + (r.outputTokens ?? 0);
          }
          // Compute success rate
          for (const k of Object.keys(byAgent)) {
            const successCount = runs.filter((r) => r.agent === k && r.status === "success").length;
            const total = byAgent[k].totalRuns;
            byAgent[k].successRate = total === 0 ? 0 : Math.round((successCount / total) * 1000) / 10;
            // Mark Running if ran in the last 5 min, otherwise Idle (or default)
            if (byAgent[k].lastRunAt) {
              const recent = Date.now() - new Date(byAgent[k].lastRunAt!).getTime() < 5 * 60 * 1000;
              byAgent[k].status = recent ? "Running" : "Idle";
            }
          }
          setStats(byAgent);
        })
        .catch(() => {
          if (!cancelled) setStats({});
        });
    }
    load();
    const id = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return stats;
}

const STATUS_STYLE: Record<AgentStatus, { bg: string; text: string; dot: string }> = {
  Running:  { bg: "bg-accent-green/10",  text: "text-accent-green",  dot: "bg-accent-green" },
  Idle:     { bg: "bg-bg-hover",          text: "text-ink-tertiary",   dot: "bg-ink-tertiary" },
  Paused:   { bg: "bg-accent-amber/10",  text: "text-accent-amber",   dot: "bg-accent-amber" },
  Learning: { bg: "bg-brand-500/10",     text: "text-brand-200",      dot: "bg-brand-400" },
};

export default function AgentsPage() {
  const runtime = useAgentRuntime();

  const totalTasks = runtime ? Object.values(runtime).reduce((s, r) => s + r.tasks24h, 0) : 0;
  const totalRuns = runtime ? Object.values(runtime).reduce((s, r) => s + r.totalRuns, 0) : 0;
  const running = runtime
    ? Object.values(runtime).filter((r) => r.status === "Running").length
    : 0;
  const totalTokens = runtime ? Object.values(runtime).reduce((s, r) => s + r.tokensUsed, 0) : 0;
  // Average success rate weighted by run count (so agents with no runs don't drag the avg to 0)
  const weightedSuccessRate = (() => {
    if (!runtime) return 0;
    const entries = Object.values(runtime).filter((r) => r.totalRuns > 0);
    if (entries.length === 0) return 0;
    const total = entries.reduce((s, r) => s + r.successRate * r.totalRuns, 0);
    const denom = entries.reduce((s, r) => s + r.totalRuns, 0);
    return denom === 0 ? 0 : total / denom;
  })();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AI Agents</h1>
            <p className="text-xs text-ink-secondary">
              {running} of {AGENTS.length} running · {totalTasks.toLocaleString()} tasks in last 24h · {totalRuns.toLocaleString()} total runs
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/pipeline" className="flex items-center gap-1.5 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover">
            <Play className="h-3.5 w-3.5" /> Run Pipeline
          </Link>
          <Link href="/agent-runs" className="flex items-center gap-1.5 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow">
            View Logs <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Running", v: running, tone: "text-accent-green" },
          { label: "Tasks (24h)", v: totalTasks.toLocaleString(), tone: "text-brand-200" },
          { label: "Tokens used", v: fmtTokens(totalTokens), tone: "text-white" },
          {
            label: "Avg success rate",
            v: totalRuns === 0 ? "—" : `${weightedSuccessRate.toFixed(1)}%`,
            tone: "text-accent-green",
          },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-bg-border bg-bg-card p-4">
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{s.label}</div>
            <div className={`mt-1 text-2xl font-bold ${s.tone}`}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {AGENTS.map((a) => {
          const r = runtime?.[a.key];
          const status: AgentStatus = r?.status ?? a.defaultStatus;
          const st = STATUS_STYLE[status];
          const successText = r && r.totalRuns > 0 ? `${r.successRate.toFixed(1)}% success` : "no runs yet";
          const tokensText = r && r.tokensUsed > 0 ? `${fmtTokens(r.tokensUsed)} tokens` : "—";
          return (
            <div
              key={a.key}
              className="rounded-xl border border-bg-border bg-bg-card p-4 transition hover:border-brand-500/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="grid h-10 w-10 place-items-center rounded-lg"
                    style={{ background: `${a.color}18` }}
                  >
                    <a.Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold">{a.name}</div>
                    <div className="text-[11px] text-ink-tertiary">{a.desc}</div>
                  </div>
                </div>
                <span className={`shrink-0 flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold ${st.bg} ${st.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${st.dot} ${status === "Running" ? "shadow-[0_0_6px_currentColor]" : ""}`} />
                  {status}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-bg-hover/40 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Tasks 24h</div>
                  <div className="mt-0.5 text-sm font-semibold">{r?.tasks24h ?? 0}</div>
                </div>
                <div className="rounded-md bg-bg-hover/40 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Total Runs</div>
                  <div className="mt-0.5 text-sm font-semibold">{r?.totalRuns ?? 0}</div>
                </div>
                <div className="rounded-md bg-bg-hover/40 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Mode</div>
                  <div className="mt-0.5 text-sm font-semibold text-brand-200">{a.mode}</div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-bg-border pt-3 text-[11px] text-ink-tertiary">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {relTime(r?.lastRunAt ?? null)}
                </span>
                <span>{successText}</span>
                <span>{tokensText}</span>
              </div>

              <div className="mt-3 flex gap-2">
                <Link
                  href={`/agent-runs?agent=${a.key}`}
                  className="flex-1 rounded-md border border-bg-border bg-bg-hover/40 py-1.5 text-center text-xs hover:bg-bg-hover"
                >
                  View Logs
                </Link>
                <Link
                  href="/automations"
                  className="flex items-center justify-center gap-1 rounded-md border border-bg-border bg-bg-hover/40 px-3 py-1.5 text-xs hover:bg-bg-hover"
                  title="Configure in Automations"
                >
                  <Settings className="h-3 w-3" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
