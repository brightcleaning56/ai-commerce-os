"use client";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  Info,
  Pause,
  Play,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { downloadCSV } from "@/lib/csv";

type LogLevel = "info" | "warn" | "error" | "success";
type LogEntry = {
  id: string;
  ts: string;
  tsIso: string;
  level: LogLevel;
  agent: string;
  jobId: string;
  message: string;
  meta?: Record<string, string | number | boolean>;
};

type AgentRun = {
  id: string;
  agent: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: "success" | "error";
  inputCategory: string | null;
  inputProductName?: string;
  productCount: number;
  buyerCount?: number;
  supplierCount?: number;
  modelUsed: string;
  inputTokens?: number;
  outputTokens?: number;
  estCostUsd?: number;
  usedFallback: boolean;
  errorMessage?: string;
  signalsUsed?: number;
};

type CronRun = {
  id: string;
  ranAt: string;
  durationMs: number;
  status: "success" | "error";
  pipelineId: string;
  totals: { products: number; buyers: number; suppliers: number; drafts: number; totalCost: number };
  errorMessage?: string;
};

const AGENT_LABELS: Record<string, string> = {
  "trend-hunter": "Trend Hunter",
  "buyer-discovery": "Buyer Discovery",
  "supplier-finder": "Supplier Finder",
  outreach: "Outreach",
  negotiation: "Negotiation",
  risk: "Risk",
  "pipeline-cron": "Pipeline Cron",
};

const LEVEL_TONE: Record<LogLevel, { bg: string; text: string; Icon: React.ComponentType<{ className?: string }> }> = {
  info: { bg: "bg-bg-hover", text: "text-ink-secondary", Icon: Info },
  warn: { bg: "bg-accent-amber/15", text: "text-accent-amber", Icon: AlertTriangle },
  error: { bg: "bg-accent-red/15", text: "text-accent-red", Icon: XCircle },
  success: { bg: "bg-accent-green/15", text: "text-accent-green", Icon: CheckCircle2 },
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function summarizeAgentRun(r: AgentRun): string {
  if (r.status === "error") {
    return `${AGENT_LABELS[r.agent] ?? r.agent} failed${r.errorMessage ? ` · ${r.errorMessage}` : ""}`;
  }
  const parts: string[] = [];
  if (r.agent === "trend-hunter") parts.push(`discovered ${r.productCount} products`);
  else if (r.agent === "buyer-discovery") parts.push(`found ${r.buyerCount ?? 0} buyers`);
  else if (r.agent === "supplier-finder") parts.push(`found ${r.supplierCount ?? 0} suppliers`);
  else if (r.agent === "outreach") parts.push(`drafted outreach`);
  else if (r.agent === "negotiation") parts.push(`processed reply`);
  else if (r.agent === "risk") parts.push(`risk check complete`);
  if (r.inputProductName) parts.push(`for "${r.inputProductName}"`);
  else if (r.inputCategory) parts.push(`for ${r.inputCategory}`);
  return parts.join(" ");
}

function agentRunToLog(r: AgentRun): LogEntry {
  const fallback = r.usedFallback;
  const level: LogLevel =
    r.status === "error" ? "error" : fallback ? "warn" : "success";
  const meta: Record<string, string | number | boolean> = {
    duration_ms: r.durationMs,
  };
  if (r.modelUsed) meta.model = r.modelUsed;
  if (r.estCostUsd != null) meta.cost_usd = Number(r.estCostUsd.toFixed(4));
  if (r.inputTokens != null) meta.input_tokens = r.inputTokens;
  if (r.outputTokens != null) meta.output_tokens = r.outputTokens;
  if (fallback) meta.fallback = true;
  if (r.signalsUsed != null) meta.signals = r.signalsUsed;
  return {
    id: r.id,
    ts: fmtTime(r.finishedAt),
    tsIso: r.finishedAt,
    level,
    agent: AGENT_LABELS[r.agent] ?? r.agent,
    jobId: r.id,
    message: summarizeAgentRun(r),
    meta,
  };
}

function cronRunToLog(r: CronRun): LogEntry {
  const level: LogLevel = r.status === "error" ? "error" : "success";
  const message =
    r.status === "error"
      ? `Pipeline cron failed${r.errorMessage ? ` · ${r.errorMessage}` : ""}`
      : `Pipeline tick: ${r.totals.products} products · ${r.totals.buyers} buyers · ${r.totals.drafts} drafts`;
  return {
    id: r.id,
    ts: fmtTime(r.ranAt),
    tsIso: r.ranAt,
    level,
    agent: "Pipeline Cron",
    jobId: r.pipelineId || r.id,
    message,
    meta: {
      duration_ms: r.durationMs,
      cost_usd: Number(r.totals.totalCost.toFixed(4)),
    },
  };
}

export default function SystemLogsPage() {
  const [paused, setPaused] = useState(false);
  const [query, setQuery] = useState("");
  const [levels, setLevels] = useState<Record<LogLevel, boolean>>({
    info: true,
    warn: true,
    error: true,
    success: true,
  });
  const [filterAgent, setFilterAgent] = useState<string>("All");
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [runsRes, cronRes] = await Promise.all([
        fetch("/api/agent-runs", { cache: "no-store" }),
        fetch("/api/cron/status", { cache: "no-store" }),
      ]);
      const runsJson = runsRes.ok ? await runsRes.json() : { runs: [] };
      const cronJson = cronRes.ok ? await cronRes.json() : { recentRuns: [] };
      const runs: AgentRun[] = runsJson.runs ?? [];
      const crons: CronRun[] = cronJson.recentRuns ?? [];
      const merged: LogEntry[] = [
        ...runs.map(agentRunToLog),
        ...crons.map(cronRunToLog),
      ].sort((a, b) => new Date(b.tsIso).getTime() - new Date(a.tsIso).getTime());
      setLogs(merged);
      setLoadedAt(new Date().toISOString());
    } catch {
      setLogs((prev) => prev ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (!pausedRef.current) load();
    }, 10_000);
    return () => clearInterval(id);
  }, [load]);

  const agents = useMemo(() => {
    if (!logs) return [] as string[];
    return Array.from(new Set(logs.map((l) => l.agent))).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    if (!logs) return [];
    return logs.filter((l) => {
      if (!levels[l.level]) return false;
      if (filterAgent !== "All" && l.agent !== filterAgent) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !l.message.toLowerCase().includes(q) &&
          !l.jobId.toLowerCase().includes(q) &&
          !l.agent.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [logs, levels, filterAgent, query]);

  const counts = useMemo(() => {
    const c: Record<LogLevel, number> = { info: 0, warn: 0, error: 0, success: 0 };
    for (const l of logs ?? []) c[l.level] += 1;
    return c;
  }, [logs]);

  function handleExport() {
    if (!logs?.length) {
      toast("Nothing to export yet", "info");
      return;
    }
    const rows = logs.map((l) => ({
      timestamp_iso: l.tsIso,
      level: l.level,
      agent: l.agent,
      job_id: l.jobId,
      message: l.message,
      meta: l.meta ? JSON.stringify(l.meta) : "",
    }));
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(`system-logs-${date}.csv`, rows);
    toast(`Exported ${rows.length} log entries`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">System Logs</h1>
            <p className="text-xs text-ink-secondary">
              Real agent runs + pipeline cron ticks · auto-refreshes every 10s when live
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            onClick={() => setPaused(!paused)}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm"
          >
            {paused ? (
              <><Play className="h-4 w-4" /> Resume stream</>
            ) : (
              <><Pause className="h-4 w-4" /> Pause stream</>
            )}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
          >
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["info", "success", "warn", "error"] as LogLevel[]).map((lvl) => {
          const tone = LEVEL_TONE[lvl];
          const Icon = tone.Icon;
          return (
            <button
              key={lvl}
              onClick={() => setLevels({ ...levels, [lvl]: !levels[lvl] })}
              className={`flex items-center justify-between rounded-xl border p-4 text-left ${
                levels[lvl] ? "border-bg-border bg-bg-card" : "border-bg-border bg-bg-card opacity-50"
              }`}
            >
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                  {lvl}
                </div>
                <div className="mt-1 text-2xl font-bold">{counts[lvl]}</div>
              </div>
              <div className={`grid h-9 w-9 place-items-center rounded-lg ${tone.bg}`}>
                <Icon className={`h-4 w-4 ${tone.text}`} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by message, agent, or job ID…"
            className="h-9 w-full rounded-lg border border-bg-border bg-bg-card pl-9 pr-3 font-mono text-xs placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
          />
        </div>
        <select
          value={filterAgent}
          onChange={(e) => setFilterAgent(e.target.value)}
          className="h-9 rounded-lg border border-bg-border bg-bg-card px-3 text-sm"
        >
          <option>All</option>
          {agents.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-panel">
        <div className="flex items-center justify-between border-b border-bg-border bg-bg-card px-5 py-2.5">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                paused ? "bg-bg-hover text-ink-tertiary" : "bg-accent-green/15 text-accent-green"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  paused ? "bg-ink-tertiary" : "bg-accent-green shadow-[0_0_8px_#22c55e]"
                }`}
              />
              {paused ? "Paused" : "Live"}
            </span>
            <span className="text-ink-tertiary">
              {filtered.length} of {logs?.length ?? 0} entries
            </span>
          </div>
          <div className="text-[10px] text-ink-tertiary">
            {loadedAt ? `loaded ${fmtTime(loadedAt)}` : loading ? "loading…" : ""}
          </div>
        </div>

        <div className="max-h-[600px] overflow-y-auto">
          {logs === null ? (
            <div className="px-5 py-12 text-center text-xs text-ink-tertiary">
              Loading…
            </div>
          ) : logs.length === 0 ? (
            <div className="px-5 py-12 text-center text-xs text-ink-tertiary">
              No agent or cron runs yet. Trigger a run from <span className="font-mono">/agents</span> or wait for the cron tick.
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-12 text-center text-xs text-ink-tertiary">
              No log entries match your filters
            </div>
          ) : (
            <ul className="divide-y divide-bg-border font-mono text-[11px]">
              {filtered.map((l) => {
                const tone = LEVEL_TONE[l.level];
                const Icon = tone.Icon;
                return (
                  <li key={l.id} className="flex items-start gap-3 px-5 py-2 hover:bg-bg-hover/30">
                    <span className="shrink-0 text-ink-tertiary">{l.ts}</span>
                    <span
                      className={`flex w-16 shrink-0 items-center gap-1 rounded px-1.5 py-0.5 ${tone.bg} ${tone.text} text-[10px] uppercase`}
                    >
                      <Icon className="h-2.5 w-2.5" />
                      {l.level}
                    </span>
                    <span className="w-32 shrink-0 truncate text-brand-300">{l.agent}</span>
                    <span className="w-24 shrink-0 truncate text-ink-tertiary">{l.jobId}</span>
                    <span className="flex-1 text-ink-secondary">
                      {l.message}
                      {l.meta && (
                        <span className="ml-2 text-ink-tertiary">
                          {Object.entries(l.meta).map(([k, v]) => `${k}=${v}`).join(" ")}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
