"use client";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  DollarSign,
  Loader2,
  Mail,
  Package,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const PRODUCT_CATEGORIES = [
  "Auto-detect",
  "Home & Kitchen",
  "Pet Supplies",
  "Beauty & Personal Care",
  "Sports & Outdoors",
  "Electronics",
  "Home Decor",
];

type StepLog = {
  agent: "trend-hunter" | "buyer-discovery" | "outreach";
  status: "success" | "error";
  durationMs: number;
  detail: string;
  forName?: string;
  cost?: number;
  usedFallback: boolean;
};

type PipelineResult = {
  pipelineId: string;
  startedAt: string;
  finishedAt: string;
  steps: StepLog[];
  products: { id: string; name: string; category: string; emoji: string; demandScore: number; rationale?: string }[];
  buyers: { id: string; company: string; decisionMaker: string; fit: number; forProduct: string; rationale?: string }[];
  drafts: {
    id: string;
    buyerCompany: string;
    buyerName: string;
    productName: string;
    email: { subject: string; body: string };
  }[];
  totals: { products: number; buyers: number; drafts: number; totalCost: number; totalMs: number };
};

const AGENT_INFO = {
  "trend-hunter": { name: "Trend Hunter", Icon: Sparkles, color: "text-brand-300", bg: "bg-brand-500/15" },
  "buyer-discovery": { name: "Buyer Discovery", Icon: Users, color: "text-accent-blue", bg: "bg-accent-blue/15" },
  outreach: { name: "Outreach", Icon: Mail, color: "text-accent-cyan", bg: "bg-accent-cyan/15" },
} as const;

type StageState = "idle" | "running" | "success" | "error" | "skipped";

export default function PipelinePage() {
  const [running, setRunning] = useState(false);
  const [category, setCategory] = useState("Auto-detect");
  const [maxProducts, setMaxProducts] = useState(1);
  const [maxBuyers, setMaxBuyers] = useState(2);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<PipelineResult[]>([]);

  // Stage state for the live progress strip while a run is in flight
  const [stages, setStages] = useState<Record<string, StageState>>({
    "trend-hunter": "idle",
    "buyer-discovery": "idle",
    outreach: "idle",
  });

  // Hydrate history from sessionStorage
  useEffect(() => {
    const raw = typeof window !== "undefined" ? sessionStorage.getItem("pipeline-history") : null;
    if (raw) {
      try {
        setHistory(JSON.parse(raw));
      } catch {}
    }
  }, []);

  function persistHistory(h: PipelineResult[]) {
    try {
      sessionStorage.setItem("pipeline-history", JSON.stringify(h.slice(0, 10)));
    } catch {}
  }

  async function run() {
    // Respect global kill-switch
    try {
      if (typeof window !== "undefined" && localStorage.getItem("aicos:kill-switch") === "1") {
        setError("Pipeline blocked — global kill-switch is active. Deactivate it from Super Admin.");
        return;
      }
    } catch {}

    setRunning(true);
    setError(null);
    setResult(null);
    setStages({ "trend-hunter": "running", "buyer-discovery": "idle", outreach: "idle" });

    try {
      // Optimistic stage advancement (server processes sequentially; we estimate timings)
      const advanceTimer1 = setTimeout(
        () =>
          setStages((s) => ({
            ...s,
            "trend-hunter": "success",
            "buyer-discovery": "running",
          })),
        2200
      );
      const advanceTimer2 = setTimeout(
        () =>
          setStages((s) => ({
            ...s,
            "buyer-discovery": "success",
            outreach: "running",
          })),
        4500
      );

      const res = await fetch("/api/agents/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: category === "Auto-detect" ? null : category,
          maxProducts,
          maxBuyersPerProduct: maxBuyers,
        }),
      });
      clearTimeout(advanceTimer1);
      clearTimeout(advanceTimer2);

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Pipeline failed");

      // Compute final stage states from real result
      const next: Record<string, StageState> = {
        "trend-hunter": "skipped",
        "buyer-discovery": "skipped",
        outreach: "skipped",
      };
      for (const step of data.steps as StepLog[]) {
        next[step.agent] = step.status === "success" ? "success" : "error";
      }
      setStages(next);
      setResult(data);

      const updated = [data, ...history].slice(0, 10);
      setHistory(updated);
      persistHistory(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pipeline failed");
      setStages({ "trend-hunter": "error", "buyer-discovery": "skipped", outreach: "skipped" });
    } finally {
      setRunning(false);
    }
  }

  function clearHistory() {
    setHistory([]);
    persistHistory([]);
    setResult(null);
  }

  const totalRunsToday = history.length;
  const totalProductsToday = useMemo(() => history.reduce((s, h) => s + h.totals.products, 0), [history]);
  const totalDraftsToday = useMemo(() => history.reduce((s, h) => s + h.totals.drafts, 0), [history]);
  const totalCostToday = useMemo(() => history.reduce((s, h) => s + h.totals.totalCost, 0), [history]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Auto Pipeline</h1>
            <p className="text-xs text-ink-secondary">
              One click runs Trend Hunter → Buyer Discovery → Outreach end-to-end
            </p>
          </div>
        </div>
      </div>

      {/* Config + Run */}
      <div className="rounded-xl border border-bg-border bg-bg-card p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                Category
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={running}
                className="h-10 w-full rounded-lg border border-bg-border bg-bg-card px-3 text-sm focus:border-brand-500 focus:outline-none disabled:opacity-60"
              >
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                Max products
              </div>
              <select
                value={maxProducts}
                onChange={(e) => setMaxProducts(+e.target.value)}
                disabled={running}
                className="h-10 w-full rounded-lg border border-bg-border bg-bg-card px-3 text-sm focus:border-brand-500 focus:outline-none disabled:opacity-60"
              >
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>{n} top product{n === 1 ? "" : "s"}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                Buyers per product
              </div>
              <select
                value={maxBuyers}
                onChange={(e) => setMaxBuyers(+e.target.value)}
                disabled={running}
                className="h-10 w-full rounded-lg border border-bg-border bg-bg-card px-3 text-sm focus:border-brand-500 focus:outline-none disabled:opacity-60"
              >
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>{n} buyer{n === 1 ? "" : "s"}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={run}
            disabled={running}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-gradient-brand px-6 text-sm font-semibold shadow-glow disabled:opacity-60"
          >
            {running ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Running pipeline…</>
            ) : (
              <><Play className="h-4 w-4" /> Run Pipeline</>
            )}
          </button>
        </div>

        {/* Live stage strip */}
        <div className="mt-5 flex items-center gap-2">
          {(["trend-hunter", "buyer-discovery", "outreach"] as const).map((agent, idx) => {
            const info = AGENT_INFO[agent];
            const state = stages[agent];
            return (
              <div key={agent} className="flex items-center gap-2 flex-1 min-w-0">
                <div
                  className={`flex flex-1 items-center gap-2 rounded-lg border p-3 min-w-0 ${
                    state === "running"
                      ? "border-brand-500/60 bg-brand-500/10 shadow-glow"
                      : state === "success"
                      ? "border-accent-green/40 bg-accent-green/5"
                      : state === "error"
                      ? "border-accent-red/40 bg-accent-red/5"
                      : state === "skipped"
                      ? "border-bg-border bg-bg-hover/30 opacity-60"
                      : "border-bg-border bg-bg-card"
                  }`}
                >
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${info.bg}`}>
                    {state === "running" ? (
                      <Loader2 className={`h-4 w-4 animate-spin ${info.color}`} />
                    ) : state === "success" ? (
                      <CheckCircle2 className="h-4 w-4 text-accent-green" />
                    ) : state === "error" ? (
                      <AlertTriangle className="h-4 w-4 text-accent-red" />
                    ) : (
                      <info.Icon className={`h-4 w-4 ${info.color}`} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold">{info.name}</div>
                    <div className="text-[10px] text-ink-tertiary capitalize truncate">
                      {state === "idle" ? "Ready" : state}
                    </div>
                  </div>
                </div>
                {idx < 2 && (
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-tertiary" />
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-accent-red/30 bg-accent-red/5 p-3 text-xs text-accent-red">
            <AlertTriangle className="h-3.5 w-3.5" /> {error}
          </div>
        )}
      </div>

      {/* Today's totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pipelines (session)" v={totalRunsToday} Icon={Workflow} />
        <Stat label="Products surfaced" v={totalProductsToday} Icon={Package} />
        <Stat label="Outreach drafts" v={totalDraftsToday} Icon={Send} />
        <Stat
          label="Total cost"
          v={totalCostToday > 0 ? `$${totalCostToday.toFixed(4)}` : "$0.00"}
          Icon={DollarSign}
        />
      </div>

      {/* Latest result */}
      {result && (
        <div className="rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-500/5 to-transparent p-5 shadow-glow">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4 text-accent-green" /> Pipeline complete
            </div>
            <div className="text-[11px] text-ink-tertiary">
              {result.totals.totalMs > 0 && <>Total {(result.totals.totalMs / 1000).toFixed(2)}s · </>}
              {result.totals.totalCost > 0 ? `$${result.totals.totalCost.toFixed(5)}` : "fallback mode"}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Products */}
            <div className="rounded-lg border border-bg-border bg-bg-card">
              <div className="flex items-center justify-between border-b border-bg-border px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Package className="h-3.5 w-3.5 text-brand-300" /> Products ({result.products.length})
                </div>
                <Link href="/products" className="text-[11px] text-brand-300 hover:text-brand-200">
                  View all →
                </Link>
              </div>
              <ul className="divide-y divide-bg-border">
                {result.products.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 px-4 py-2.5 text-xs">
                    <span className="text-base">{p.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="truncate text-[10px] text-ink-tertiary">{p.category}</div>
                    </div>
                    <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-200">
                      {p.demandScore}
                    </span>
                  </li>
                ))}
                {result.products.length === 0 && (
                  <li className="px-4 py-3 text-center text-[11px] text-ink-tertiary">
                    No products surfaced
                  </li>
                )}
              </ul>
            </div>

            {/* Buyers */}
            <div className="rounded-lg border border-bg-border bg-bg-card">
              <div className="flex items-center justify-between border-b border-bg-border px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Users className="h-3.5 w-3.5 text-accent-blue" /> Buyers ({result.buyers.length})
                </div>
                <Link href="/buyers" className="text-[11px] text-brand-300 hover:text-brand-200">
                  View all →
                </Link>
              </div>
              <ul className="divide-y divide-bg-border">
                {result.buyers.map((b) => (
                  <li key={b.id} className="px-4 py-2.5 text-xs">
                    <div className="font-medium">{b.company}</div>
                    <div className="text-[10px] text-ink-tertiary">
                      {b.decisionMaker} · fit {b.fit}% · for{" "}
                      <span className="text-brand-300">{b.forProduct}</span>
                    </div>
                  </li>
                ))}
                {result.buyers.length === 0 && (
                  <li className="px-4 py-3 text-center text-[11px] text-ink-tertiary">
                    No buyers matched
                  </li>
                )}
              </ul>
            </div>

            {/* Drafts */}
            <div className="rounded-lg border border-bg-border bg-bg-card">
              <div className="flex items-center justify-between border-b border-bg-border px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Mail className="h-3.5 w-3.5 text-accent-cyan" /> Drafts ({result.drafts.length})
                </div>
                <Link href="/outreach" className="text-[11px] text-brand-300 hover:text-brand-200">
                  Review queue →
                </Link>
              </div>
              <ul className="divide-y divide-bg-border">
                {result.drafts.map((d) => (
                  <li key={d.id} className="px-4 py-2.5 text-xs">
                    <div className="truncate font-medium">{d.email.subject}</div>
                    <div className="truncate text-[10px] text-ink-tertiary">
                      → {d.buyerName} @ {d.buyerCompany}
                    </div>
                  </li>
                ))}
                {result.drafts.length === 0 && (
                  <li className="px-4 py-3 text-center text-[11px] text-ink-tertiary">
                    No drafts created
                  </li>
                )}
              </ul>
            </div>
          </div>

          {/* Step timeline */}
          <div className="mt-4 rounded-lg border border-bg-border bg-bg-panel">
            <div className="border-b border-bg-border px-4 py-2.5 text-xs font-semibold">
              Step timeline
            </div>
            <ol className="divide-y divide-bg-border">
              {result.steps.map((s, i) => {
                const info = AGENT_INFO[s.agent];
                return (
                  <li key={i} className="flex items-start gap-3 px-4 py-2.5">
                    <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${info.bg}`}>
                      <info.Icon className={`h-3.5 w-3.5 ${info.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium">{info.name}</span>
                        {s.status === "success" ? (
                          <CheckCircle2 className="h-3 w-3 text-accent-green" />
                        ) : (
                          <AlertTriangle className="h-3 w-3 text-accent-red" />
                        )}
                        <span className="text-[10px] text-ink-tertiary">
                          {(s.durationMs / 1000).toFixed(2)}s
                          {s.cost != null && s.cost > 0 && <> · ${s.cost.toFixed(5)}</>}
                          {s.usedFallback && <> · fallback</>}
                        </span>
                      </div>
                      <div className="text-[11px] text-ink-secondary">{s.detail}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Link
              href="/outreach"
              className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-xs font-semibold shadow-glow"
            >
              Review &amp; approve drafts <ArrowRight className="h-3 w-3" />
            </Link>
            <button
              onClick={run}
              className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-xs hover:bg-bg-hover"
            >
              <RefreshCw className="h-3 w-3" /> Run again
            </button>
          </div>
        </div>
      )}

      {/* Session history */}
      {history.length > 0 && (
        <div className="rounded-xl border border-bg-border bg-bg-card">
          <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="h-4 w-4 text-brand-300" /> Pipeline history
              <span className="text-[10px] text-ink-tertiary">(this session)</span>
            </div>
            <button
              onClick={clearHistory}
              className="text-[11px] text-ink-tertiary hover:text-accent-red"
            >
              Clear
            </button>
          </div>
          <ul className="divide-y divide-bg-border text-sm">
            {history.map((h) => (
              <li key={h.pipelineId} className="flex items-center gap-3 px-5 py-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-500/15">
                  <Workflow className="h-3.5 w-3.5 text-brand-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px]">{h.pipelineId}</div>
                  <div className="text-[11px] text-ink-tertiary">
                    {new Date(h.startedAt).toLocaleTimeString()}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-ink-secondary">
                  <span>{h.totals.products} products</span>
                  <span>{h.totals.buyers} buyers</span>
                  <span>{h.totals.drafts} drafts</span>
                  {h.totals.totalCost > 0 && <span>${h.totals.totalCost.toFixed(5)}</span>}
                </div>
                <button
                  onClick={() => setResult(h)}
                  className="text-[11px] text-brand-300 hover:text-brand-200"
                >
                  View
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Architecture explainer */}
      <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/20">
            <Cpu className="h-5 w-5 text-brand-200" />
          </div>
          <div className="flex-1 text-xs text-ink-secondary">
            <div className="text-sm font-semibold text-brand-200">How the pipeline runs</div>
            <p className="mt-1">
              Each click chains 3 real agent calls. <strong className="text-ink-primary">Trend Hunter</strong> scrapes Reddit + HN, then asks Claude Haiku 4.5 for trending products.{" "}
              <strong className="text-ink-primary">Buyer Discovery</strong> takes the top product and asks Haiku 4.5 to invent matched buyers.{" "}
              <strong className="text-ink-primary">Outreach</strong> takes the top buyer and asks Claude Sonnet 4.6 (smart tier) to draft email + LinkedIn + SMS — personalized to that buyer&apos;s company, decision-maker, and the product.
            </p>
            <p className="mt-2">
              Without an <code className="rounded bg-bg-hover px-1 text-[10px]">ANTHROPIC_API_KEY</code>, every agent falls back to a deterministic stub. Set the key in <code className="rounded bg-bg-hover px-1 text-[10px]">.env.local</code> and restart for live calls.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, v, Icon }: { label: string; v: string | number; Icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <Icon className="h-4 w-4 text-brand-300" />
      <div className="mt-2 text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className="mt-1 text-2xl font-bold">{v}</div>
    </div>
  );
}
