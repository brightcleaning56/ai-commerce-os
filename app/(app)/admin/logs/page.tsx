"use client";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  Info,
  Pause,
  Play,
  Search,
  XCircle,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { downloadCSV } from "@/lib/csv";

type LogLevel = "info" | "warn" | "error" | "success";
type LogEntry = {
  id: string;
  ts: string;
  level: LogLevel;
  agent: string;
  jobId: string;
  message: string;
  meta?: Record<string, string | number | boolean>;
};

const AGENTS = [
  "Trend Hunter",
  "Demand Intel",
  "Buyer Discovery",
  "Outreach Agent",
  "Negotiation",
  "Risk Agent",
  "CRM Intel",
  "Supplier Finder",
  "Learning Agent",
];

const SAMPLE_LOGS: LogEntry[] = [
  { id: "l1", ts: "12:42:18.124", level: "info", agent: "Trend Hunter", jobId: "trd-9842", message: "Started scan of TikTok #pets · velocity threshold 200%" },
  { id: "l2", ts: "12:42:18.901", level: "info", agent: "Trend Hunter", jobId: "trd-9842", message: "Pulled 1,420 hashtag impressions in 280ms", meta: { window_min: 60 } },
  { id: "l3", ts: "12:42:19.310", level: "success", agent: "Trend Hunter", jobId: "trd-9842", message: "Found 3 trending products above threshold", meta: { count: 3 } },
  { id: "l4", ts: "12:42:19.450", level: "info", agent: "Demand Intel", jobId: "dmd-4011", message: "Scoring product 'Pet Hair Remover Roller'" },
  { id: "l5", ts: "12:42:19.872", level: "success", agent: "Demand Intel", jobId: "dmd-4011", message: "Demand score: 89 · saturation 24% · margin 67%" },
  { id: "l6", ts: "12:42:20.103", level: "info", agent: "Buyer Discovery", jobId: "bdy-7724", message: "Searching 12 directories for matched buyers" },
  { id: "l7", ts: "12:42:20.844", level: "warn", agent: "Buyer Discovery", jobId: "bdy-7724", message: "Apollo rate limit hit (429), retrying with backoff", meta: { retry_in_ms: 1500 } },
  { id: "l8", ts: "12:42:22.401", level: "success", agent: "Buyer Discovery", jobId: "bdy-7724", message: "Enriched 68 new buyer leads", meta: { intent_avg: 84 } },
  { id: "l9", ts: "12:42:22.612", level: "info", agent: "Outreach Agent", jobId: "out-2204", message: "Drafting personalized email for FitLife Stores", meta: { model: "claude-sonnet-4-6" } },
  { id: "l10", ts: "12:42:23.028", level: "success", agent: "Outreach Agent", jobId: "out-2204", message: "Email queued · 286 tokens · $0.0009 cost" },
  { id: "l11", ts: "12:42:24.412", level: "error", agent: "Negotiation", jobId: "neg-1119", message: "Failed to parse buyer reply (malformed quote)", meta: { buyer_id: "b14", retry: true } },
  { id: "l12", ts: "12:42:25.001", level: "info", agent: "Risk Agent", jobId: "rsk-0042", message: "Re-checking supplier 'Shenzhen Unitop Tech'" },
  { id: "l13", ts: "12:42:25.221", level: "warn", agent: "Risk Agent", jobId: "rsk-0042", message: "Domain registered 142 days ago (below 180-day threshold)" },
  { id: "l14", ts: "12:42:25.880", level: "error", agent: "Risk Agent", jobId: "rsk-0042", message: "Risk score 71 → flagged + paused outbound", meta: { rule: "scam_domain_recent" } },
  { id: "l15", ts: "12:42:26.011", level: "info", agent: "CRM Intel", jobId: "crm-5512", message: "Routing 4 new leads to Sarah Chen" },
  { id: "l16", ts: "12:42:26.310", level: "success", agent: "CRM Intel", jobId: "crm-5512", message: "Pipeline updated · 12 deals advanced" },
  { id: "l17", ts: "12:42:27.110", level: "info", agent: "Learning Agent", jobId: "lrn-9981", message: "Re-scoring 38 prior outreach drafts against last week's reply rates" },
  { id: "l18", ts: "12:42:28.401", level: "success", agent: "Learning Agent", jobId: "lrn-9981", message: "Updated outreach prompt v2.4 · projected +2.1pp reply rate" },
];

const LEVEL_TONE: Record<LogLevel, { bg: string; text: string; Icon: React.ComponentType<{ className?: string }> }> = {
  info: { bg: "bg-bg-hover", text: "text-ink-secondary", Icon: Info },
  warn: { bg: "bg-accent-amber/15", text: "text-accent-amber", Icon: AlertTriangle },
  error: { bg: "bg-accent-red/15", text: "text-accent-red", Icon: XCircle },
  success: { bg: "bg-accent-green/15", text: "text-accent-green", Icon: CheckCircle2 },
};

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
  const { toast } = useToast();

  function handleExport() {
    const rows = SAMPLE_LOGS.map((l) => ({
      timestamp: l.ts,
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

  const filtered = useMemo(() => {
    return SAMPLE_LOGS.filter((l) => {
      if (!levels[l.level]) return false;
      if (filterAgent !== "All" && l.agent !== filterAgent) return false;
      if (
        query &&
        !l.message.toLowerCase().includes(query.toLowerCase()) &&
        !l.jobId.includes(query) &&
        !l.agent.toLowerCase().includes(query.toLowerCase())
      ) return false;
      return true;
    });
  }, [levels, filterAgent, query]);

  const counts = {
    info: SAMPLE_LOGS.filter((l) => l.level === "info").length,
    warn: SAMPLE_LOGS.filter((l) => l.level === "warn").length,
    error: SAMPLE_LOGS.filter((l) => l.level === "error").length,
    success: SAMPLE_LOGS.filter((l) => l.level === "success").length,
  };

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
              Real-time stream from {AGENTS.length} agents · 30-day retention on Growth, 1y on Enterprise
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          {AGENTS.map((a) => (
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
            <span className="text-ink-tertiary">{filtered.length} of {SAMPLE_LOGS.length} entries</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-ink-tertiary">
            <Zap className="h-3 w-3" /> 28 events/sec average
          </div>
        </div>

        <div className="max-h-[600px] overflow-y-auto">
          {filtered.length === 0 ? (
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
