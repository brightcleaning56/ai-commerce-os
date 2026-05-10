"use client";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Cpu,
  DollarSign,
  Flame,
  Loader2,
  Package,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { AgentRun } from "@/lib/store";

type RunResp = { runs: AgentRun[] };

const STATUS_TONE: Record<string, { bg: string; text: string; Icon: React.ComponentType<{ className?: string }> }> = {
  success: { bg: "bg-accent-green/15", text: "text-accent-green", Icon: CheckCircle2 },
  error: { bg: "bg-accent-red/15", text: "text-accent-red", Icon: AlertTriangle },
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function AgentRunsPage() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchRuns() {
    setLoading(true);
    try {
      const r = await fetch("/api/agent-runs", { cache: "no-store" });
      const d: RunResp = await r.json();
      setRuns(d.runs ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load runs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRuns();
  }, []);

  async function runScan() {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/trend-hunter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      await fetchRuns();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  const totals = {
    runs: runs.length,
    products: runs.reduce((s, r) => s + r.productCount, 0),
    cost: runs.reduce((s, r) => s + (r.estCostUsd ?? 0), 0),
    avgMs: runs.length ? Math.round(runs.reduce((s, r) => s + r.durationMs, 0) / runs.length) : 0,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Agent Runs</h1>
            <p className="text-xs text-ink-secondary">
              Live execution history · {totals.runs} runs · {totals.products} products discovered
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchRuns}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            onClick={runScan}
            disabled={scanning}
            className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow disabled:opacity-60"
          >
            {scanning ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Running…</>
            ) : (
              <><Flame className="h-4 w-4" /> Run Trend Hunter</>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Runs" v={totals.runs} Icon={Zap} />
        <Stat label="Products discovered" v={totals.products} Icon={Package} />
        <Stat label="Total cost" v={totals.cost > 0 ? `$${totals.cost.toFixed(4)}` : "$0.00"} Icon={DollarSign} />
        <Stat label="Avg duration" v={totals.avgMs > 0 ? `${(totals.avgMs / 1000).toFixed(2)}s` : "—"} Icon={Clock} />
      </div>

      {error && (
        <div className="rounded-lg border border-accent-red/30 bg-accent-red/5 p-3 text-xs text-accent-red">
          {error}
        </div>
      )}

      {!error && runs.length === 0 && !loading && (
        <div className="rounded-xl border border-bg-border bg-bg-card p-12 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-brand-300" />
          <div className="mt-3 text-base font-semibold">No agent runs yet</div>
          <p className="mt-1 text-xs text-ink-tertiary">
            Click &ldquo;Run Trend Hunter&rdquo; to kick off your first scan.
          </p>
        </div>
      )}

      {runs.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
              <tr className="border-b border-bg-border">
                <th className="px-5 py-2.5 text-left font-medium">Run</th>
                <th className="px-3 py-2.5 text-left font-medium">Agent</th>
                <th className="px-3 py-2.5 text-left font-medium">Status</th>
                <th className="px-3 py-2.5 text-right font-medium">Products</th>
                <th className="px-3 py-2.5 text-right font-medium">Duration</th>
                <th className="px-3 py-2.5 text-left font-medium">Model</th>
                <th className="px-3 py-2.5 text-right font-medium">Tokens</th>
                <th className="px-5 py-2.5 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const tone = STATUS_TONE[r.status];
                const Icon = tone.Icon;
                return (
                  <tr key={r.id} className="border-t border-bg-border hover:bg-bg-hover/30">
                    <td className="px-5 py-3">
                      <div className="font-mono text-[11px] text-ink-primary">{r.id}</div>
                      <div className="text-[11px] text-ink-tertiary">
                        {relativeTime(r.startedAt)}
                        {r.inputCategory && (
                          <> · category=<span className="text-ink-secondary">{r.inputCategory}</span></>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-md bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-200">
                        {r.agent}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${tone.bg} ${tone.text}`}>
                        <Icon className="h-3 w-3" /> {r.status}
                      </span>
                      {r.errorMessage && (
                        <div className="mt-0.5 max-w-xs truncate text-[10px] text-accent-red" title={r.errorMessage}>
                          {r.errorMessage}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">{r.productCount}</td>
                    <td className="px-3 py-3 text-right text-ink-secondary">
                      {(r.durationMs / 1000).toFixed(2)}s
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Cpu className={`h-3 w-3 ${r.usedFallback ? "text-ink-tertiary" : "text-brand-300"}`} />
                        <span className={r.usedFallback ? "text-ink-tertiary" : "text-ink-secondary"}>
                          {r.modelUsed}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right text-[11px] text-ink-secondary">
                      {r.inputTokens != null ? (
                        <>
                          <span className="text-ink-tertiary">in</span> {r.inputTokens.toLocaleString()}
                          <br />
                          <span className="text-ink-tertiary">out</span> {r.outputTokens?.toLocaleString()}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold">
                      {r.estCostUsd != null ? `$${r.estCostUsd.toFixed(5)}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/20">
            <Sparkles className="h-5 w-5 text-brand-200" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">How the Trend Hunter works</div>
            <p className="mt-1 text-xs text-ink-secondary">
              Each scan monitors TikTok, Reddit, Amazon BSR, and Google Trends simultaneously. Claude analyzes cross-platform momentum to surface 4–6 high-confidence products ranked by demand score, margin potential, and competition level.
            </p>
            <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-ink-tertiary">
              <span>⚡ Avg scan time: ~8 seconds</span>
              <span>🔄 Rate limit: 10 scans/min</span>
              <span>💾 Results saved automatically</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  v,
  Icon,
}: {
  label: string;
  v: string | number;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 text-brand-300" />
      </div>
      <div className="mt-2 text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className="mt-1 text-2xl font-bold">{v}</div>
    </div>
  );
}
