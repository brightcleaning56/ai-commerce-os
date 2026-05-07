"use client";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Cpu,
  DollarSign,
  Eye,
  Link2,
  Loader2,
  Mail,
  Package,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldOff,
  Sparkles,
  UserPlus,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";

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
  agent: "trend-hunter" | "buyer-discovery" | "supplier-finder" | "outreach" | "risk";
  status: "success" | "error";
  durationMs: number;
  detail: string;
  forName?: string;
  cost?: number;
  usedFallback: boolean;
};

type CronRunSummary = {
  id: string;
  ranAt: string;
  durationMs: number;
  status: "success" | "error";
  pipelineId: string;
  totals: { products: number; buyers: number; suppliers: number; drafts: number; totalCost: number };
  errorMessage?: string;
};

type CronStatus = {
  deployed: boolean;
  enabled: boolean;
  secretConfigured: boolean;
  schedule: string;
  scheduleHuman: string;
  nextRunAt: string | null;
  lastRun: CronRunSummary | null;
  recentRuns: CronRunSummary[];
};

type PipelineResult = {
  pipelineId: string;
  shareToken: string;
  shareExpiresAt?: string;
  startedAt: string;
  finishedAt: string;
  steps: StepLog[];
  products: { id: string; name: string; category: string; emoji: string; demandScore: number; rationale?: string }[];
  buyers: { id: string; company: string; decisionMaker: string; fit: number; forProduct: string; rationale?: string }[];
  suppliers: { id: string; name: string; country: string; type: string; unitPrice: number; riskScore: number; forProduct: string }[];
  drafts: {
    id: string;
    buyerCompany: string;
    buyerName: string;
    productName: string;
    email: { subject: string; body: string };
  }[];
  totals: { products: number; buyers: number; suppliers: number; drafts: number; totalCost: number; totalMs: number };
};

const AGENT_INFO = {
  "trend-hunter": { name: "Trend Hunter", Icon: Sparkles, color: "text-brand-300", bg: "bg-brand-500/15" },
  "buyer-discovery": { name: "Buyer Discovery", Icon: Users, color: "text-accent-blue", bg: "bg-accent-blue/15" },
  "supplier-finder": { name: "Supplier Finder", Icon: Package, color: "text-accent-amber", bg: "bg-accent-amber/15" },
  risk: { name: "Risk Agent", Icon: AlertTriangle, color: "text-accent-red", bg: "bg-accent-red/15" },
  outreach: { name: "Outreach", Icon: Mail, color: "text-accent-cyan", bg: "bg-accent-cyan/15" },
} as const;

type StageState = "idle" | "running" | "success" | "error" | "skipped";

export default function PipelinePage() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [category, setCategory] = useState("Auto-detect");
  const [maxProducts, setMaxProducts] = useState(1);
  const [maxBuyers, setMaxBuyers] = useState(2);
  // TTL for the public /share link generated for this run.
  // 0 = never expires. Persisted in localStorage so the user's preference survives reload.
  const [shareTtlHours, setShareTtlHours] = useState<number>(168);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<PipelineResult[]>([]);
  const [cronStatus, setCronStatus] = useState<CronStatus | null>(null);

  function shareUrlFor(run: { pipelineId: string; shareToken?: string }): string | null {
    if (!run.shareToken || typeof window === "undefined") return null;
    return `${window.location.origin}/share/${run.pipelineId}?t=${run.shareToken}`;
  }

  async function copyShareLink(run: { pipelineId: string; shareToken?: string; shareExpiresAt?: string }) {
    const url = shareUrlFor(run);
    if (!url) {
      toast("This run can't be shared (missing token — re-run pipeline)", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      const suffix = run.shareExpiresAt ? ` (expires ${relTime(run.shareExpiresAt)})` : "";
      toast(`Share link copied — read-only${suffix}`, "success");
    } catch {
      // Fallback: show the URL inline so the user can copy manually
      window.prompt("Copy this share link:", url);
    }
  }

  // Stage state for the live progress strip while a run is in flight
  const [stages, setStages] = useState<Record<string, StageState>>({
    "trend-hunter": "idle",
    "buyer-discovery": "idle",
    "supplier-finder": "idle",
    outreach: "idle",
  });

  // Hydrate history from sessionStorage + share TTL preference from localStorage
  useEffect(() => {
    const raw = typeof window !== "undefined" ? sessionStorage.getItem("pipeline-history") : null;
    if (raw) {
      try {
        setHistory(JSON.parse(raw));
      } catch {}
    }
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("aicos:share-ttl-hours") : null;
      if (saved !== null) {
        const n = Number(saved);
        if (Number.isFinite(n)) setShareTtlHours(n);
      }
    } catch {}
  }, []);

  function persistShareTtl(n: number) {
    setShareTtlHours(n);
    try {
      localStorage.setItem("aicos:share-ttl-hours", String(n));
    } catch {}
  }

  // Fetch cron status (once on mount + after manual cron-test runs)
  async function refreshCronStatus() {
    try {
      const res = await fetch("/api/cron/status");
      if (res.ok) setCronStatus(await res.json());
    } catch {}
  }
  useEffect(() => {
    refreshCronStatus();
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
    setStages({
      "trend-hunter": "running",
      "buyer-discovery": "idle",
      "supplier-finder": "idle",
      outreach: "idle",
    });

    try {
      // Optimistic stage advancement (server processes Trend Hunter first,
      // then Buyer Discovery + Supplier Finder in parallel, then Outreach)
      const advanceTimer1 = setTimeout(
        () =>
          setStages((s) => ({
            ...s,
            "trend-hunter": "success",
            "buyer-discovery": "running",
            "supplier-finder": "running",
          })),
        2200
      );
      const advanceTimer2 = setTimeout(
        () =>
          setStages((s) => ({
            ...s,
            "buyer-discovery": "success",
            "supplier-finder": "success",
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
          shareTtlHours,
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
        "supplier-finder": "skipped",
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
      setStages({
        "trend-hunter": "error",
        "buyer-discovery": "skipped",
        "supplier-finder": "skipped",
        outreach: "skipped",
      });
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                <Link2 className="h-3 w-3" /> Share link expires in
              </div>
              <select
                value={shareTtlHours}
                onChange={(e) => persistShareTtl(+e.target.value)}
                disabled={running}
                className="h-10 w-full rounded-lg border border-bg-border bg-bg-card px-3 text-sm focus:border-brand-500 focus:outline-none disabled:opacity-60"
              >
                <option value={1}>1 hour</option>
                <option value={24}>24 hours</option>
                <option value={168}>7 days</option>
                <option value={720}>30 days</option>
                <option value={0}>Never</option>
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
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {/* Stage 1: Trend Hunter */}
          <StageCard agent="trend-hunter" state={stages["trend-hunter"]} />
          <ChevronRight className="hidden h-4 w-4 self-center text-ink-tertiary sm:block" />

          {/* Stage 2: Buyer + Supplier (parallel) */}
          <div className="grid grid-cols-1 gap-2">
            <StageCard agent="buyer-discovery" state={stages["buyer-discovery"]} />
            <StageCard agent="supplier-finder" state={stages["supplier-finder"]} />
          </div>
          <ChevronRight className="hidden h-4 w-4 self-center text-ink-tertiary sm:block" />

          {/* Stage 3: Outreach */}
          <StageCard agent="outreach" state={stages["outreach"]} />
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

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
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

            {/* Suppliers */}
            <div className="rounded-lg border border-bg-border bg-bg-card">
              <div className="flex items-center justify-between border-b border-bg-border px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Package className="h-3.5 w-3.5 text-accent-amber" /> Suppliers (
                  {result.suppliers?.length ?? 0})
                </div>
                <Link href="/suppliers" className="text-[11px] text-brand-300 hover:text-brand-200">
                  View all →
                </Link>
              </div>
              <ul className="divide-y divide-bg-border">
                {(result.suppliers ?? []).map((s) => (
                  <li key={s.id} className="px-4 py-2.5 text-xs">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-[10px] text-ink-tertiary">
                      {s.country} · {s.type} · ${s.unitPrice.toFixed(2)}/unit · risk{" "}
                      <span
                        className={
                          s.riskScore >= 60
                            ? "text-accent-red"
                            : s.riskScore >= 30
                            ? "text-accent-amber"
                            : "text-accent-green"
                        }
                      >
                        {s.riskScore}
                      </span>
                    </div>
                  </li>
                ))}
                {(result.suppliers ?? []).length === 0 && (
                  <li className="px-4 py-3 text-center text-[11px] text-ink-tertiary">
                    No suppliers surfaced
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

          <div className="mt-4 flex flex-wrap items-center gap-2">
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
            <button
              onClick={() => copyShareLink(result)}
              className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-xs hover:bg-bg-hover"
              title="Copy a public read-only link to this run"
            >
              <Link2 className="h-3 w-3" /> Share this run
            </button>
            {result.shareToken && (
              <a
                href={`/share/${result.pipelineId}?t=${result.shareToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-xs hover:bg-bg-hover"
              >
                Open public view <ArrowRight className="h-3 w-3" />
              </a>
            )}
            {result.shareExpiresAt && (
              <span className="text-[11px] text-ink-tertiary">
                Link expires {relTime(result.shareExpiresAt)}
              </span>
            )}
          </div>

          {/* Share governance — views + revoke */}
          {result.shareToken && (
            <ShareGovernancePanel
              pipelineId={result.pipelineId}
              shareToken={result.shareToken}
              shareExpiresAt={result.shareExpiresAt}
              onRevoked={() => {
                // After revoke, force the user to re-run for a fresh link
                toast("Share link revoked — generate a new run for a fresh link", "info");
              }}
            />
          )}
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
                {h.shareToken && (
                  <button
                    onClick={() => copyShareLink(h)}
                    className="flex items-center gap-1 text-[11px] text-ink-tertiary hover:text-brand-300"
                    title="Copy public share link"
                  >
                    <Link2 className="h-3 w-3" /> Share
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Cron / autonomy */}
      <CronPanel status={cronStatus} onTriggered={refreshCronStatus} />

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

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) {
    const future = -ms;
    if (future < 60_000) return `in ${Math.max(1, Math.floor(future / 1000))}s`;
    if (future < 3_600_000) return `in ${Math.floor(future / 60_000)}m`;
    if (future < 86_400_000) return `in ${Math.floor(future / 3_600_000)}h ${Math.floor((future % 3_600_000) / 60_000)}m`;
    return `in ${Math.floor(future / 86_400_000)}d`;
  }
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function CronPanel({
  status,
  onTriggered,
}: {
  status: CronStatus | null;
  onTriggered: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  async function triggerCronManually() {
    setTesting(true);
    setTestError(null);
    try {
      // GET /api/cron/pipeline — in dev with no CRON_SECRET set, this is allowed
      const res = await fetch("/api/cron/pipeline");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Cron trigger failed");
      onTriggered();
    } catch (e) {
      setTestError(e instanceof Error ? e.message : "Cron trigger failed");
    } finally {
      setTesting(false);
    }
  }

  if (!status) {
    return (
      <div className="rounded-xl border border-bg-border bg-bg-card p-5 text-xs text-ink-tertiary">
        Loading cron status…
      </div>
    );
  }

  const active = status.deployed && status.enabled;

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-bg-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className={`grid h-10 w-10 place-items-center rounded-lg ${
              active ? "bg-accent-green/15" : "bg-bg-hover"
            }`}
          >
            <Clock className={`h-5 w-5 ${active ? "text-accent-green" : "text-ink-tertiary"}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              Auto-pipeline
              {active ? (
                <span className="flex items-center gap-1 rounded-md bg-accent-green/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-green">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-green shadow-[0_0_8px_#22c55e]" />
                  Live
                </span>
              ) : status.deployed && !status.enabled ? (
                <span className="rounded-md bg-accent-amber/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-amber">
                  Paused
                </span>
              ) : (
                <span className="rounded-md bg-bg-hover px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">
                  Local
                </span>
              )}
            </div>
            <div className="text-[11px] text-ink-tertiary">
              {status.scheduleHuman}{" "}
              {status.deployed
                ? status.enabled
                  ? "· running on Vercel cron"
                  : "· kill-switch active (CRON_ENABLED=false)"
                : "· deploy to Vercel to activate"}
            </div>
          </div>
        </div>
        <button
          onClick={triggerCronManually}
          disabled={testing}
          className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-xs hover:bg-bg-hover disabled:opacity-60"
        >
          {testing ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Triggering…</>
          ) : (
            <><Play className="h-3.5 w-3.5" /> Trigger cron now</>
          )}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
        <CronStat
          label="Schedule"
          v={status.schedule}
          mono
          hint={status.scheduleHuman}
        />
        <CronStat
          label="Next run"
          v={status.nextRunAt ? relTime(status.nextRunAt) : "—"}
          hint={status.nextRunAt ? new Date(status.nextRunAt).toLocaleString() : ""}
        />
        <CronStat
          label="Last run"
          v={status.lastRun ? relTime(status.lastRun.ranAt) : "Never"}
          hint={
            status.lastRun
              ? `${status.lastRun.totals.products}p · ${status.lastRun.totals.buyers}b · ${status.lastRun.totals.suppliers}s · ${status.lastRun.totals.drafts}d`
              : ""
          }
          tone={status.lastRun?.status === "error" ? "red" : "default"}
        />
        <CronStat
          label="Cron runs"
          v={status.recentRuns.length}
          hint="this session"
        />
      </div>

      {testError && (
        <div className="mx-5 mb-3 rounded-md border border-accent-red/30 bg-accent-red/5 px-3 py-2 text-[11px] text-accent-red">
          {testError}
        </div>
      )}

      {status.recentRuns.length > 0 && (
        <div className="border-t border-bg-border">
          <div className="px-5 py-2.5 text-[10px] uppercase tracking-wider text-ink-tertiary">
            Recent cron runs
          </div>
          <ul className="divide-y divide-bg-border">
            {status.recentRuns.slice(0, 5).map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-2.5 text-xs">
                <div
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${
                    r.status === "success" ? "bg-accent-green/15" : "bg-accent-red/15"
                  }`}
                >
                  {r.status === "success" ? (
                    <CheckCircle2 className="h-3 w-3 text-accent-green" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-accent-red" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px]">{r.id}</div>
                  <div className="text-[10px] text-ink-tertiary">
                    {new Date(r.ranAt).toLocaleString()} · {(r.durationMs / 1000).toFixed(2)}s
                  </div>
                </div>
                <div className="text-[11px] text-ink-secondary">
                  {r.status === "success"
                    ? `${r.totals.products}p · ${r.totals.buyers}b · ${r.totals.suppliers}s · ${r.totals.drafts}d${
                        r.totals.totalCost > 0 ? ` · $${r.totals.totalCost.toFixed(5)}` : ""
                      }`
                    : r.errorMessage}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!status.deployed && (
        <div className="border-t border-bg-border bg-bg-hover/30 px-5 py-3 text-[11px] text-ink-tertiary">
          <strong className="text-ink-secondary">Local mode:</strong> the schedule is configured but
          Vercel cron only fires on a deployed instance. The &ldquo;Trigger cron now&rdquo; button
          calls the same endpoint to test the flow locally.
        </div>
      )}
    </div>
  );
}

function CronStat({
  label,
  v,
  hint,
  mono,
  tone,
}: {
  label: string;
  v: string | number;
  hint?: string;
  mono?: boolean;
  tone?: "default" | "red";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div
        className={`mt-1 text-sm font-semibold ${mono ? "font-mono" : ""} ${
          tone === "red" ? "text-accent-red" : ""
        }`}
      >
        {v}
      </div>
      {hint && <div className="text-[10px] text-ink-tertiary">{hint}</div>}
    </div>
  );
}

function StageCard({
  agent,
  state,
}: {
  agent: keyof typeof AGENT_INFO;
  state: StageState;
}) {
  const info = AGENT_INFO[agent];
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border p-3 min-w-0 ${
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
  );
}

type AccessLogEntry = {
  ts: string;
  ip?: string;
  userAgent?: string;
  referer?: string;
  linkToken?: string;
  linkLabel?: string;
};

type LinkSummary = {
  token: string;
  label: string;
  isDefault: boolean;
  createdAt: string;
  expiresAt?: string;
  revoked: boolean;
  revokedAt?: string;
  accessCount: number;
  lastViewedAt?: string;
  scope: "full" | "recipient";
};

type AccessLogResponse = {
  id: string;
  revoked: boolean;
  revokedAt: string | null;
  shareExpiresAt: string | null;
  accessLog: AccessLogEntry[];
  accessCount: number;
  links: LinkSummary[];
};

function ShareGovernancePanel({
  pipelineId,
  shareToken,
  shareExpiresAt,
  onRevoked,
}: {
  pipelineId: string;
  shareToken: string;
  shareExpiresAt?: string;
  onRevoked: () => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<AccessLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newTtl, setNewTtl] = useState<number>(168);
  const [newScope, setNewScope] = useState<"full" | "recipient">("recipient");
  const [minting, setMinting] = useState(false);

  async function refresh() {
    try {
      const res = await fetch(
        `/api/share/${pipelineId}/access-log?t=${encodeURIComponent(shareToken)}`,
      );
      if (res.ok) {
        const json = (await res.json()) as AccessLogResponse;
        setData(json);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId, shareToken]);

  async function mintNamed() {
    const label = newLabel.trim();
    if (!label) {
      toast("Add a recipient label first (e.g., 'John @ Acme')", "error");
      return;
    }
    setMinting(true);
    try {
      const res = await fetch(`/api/share/${pipelineId}/links?t=${encodeURIComponent(shareToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, ttlHours: newTtl, scope: newScope }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Mint failed");
      try {
        await navigator.clipboard.writeText(json.url);
        toast(`Link for "${label}" copied — share away`, "success");
      } catch {
        window.prompt(`Link for "${label}":`, json.url);
      }
      setNewLabel("");
      setAdding(false);
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Mint failed", "error");
    } finally {
      setMinting(false);
    }
  }

  async function revokeLink(linkToken: string, linkLabel: string, isDefault: boolean) {
    const confirmMsg = isDefault
      ? "Revoke the DEFAULT share link? Anyone holding the original URL will lose access."
      : `Revoke the link for "${linkLabel}"? They will lose access immediately.`;
    if (!window.confirm(confirmMsg)) return;
    try {
      const url = isDefault
        ? `/api/share/${pipelineId}/revoke`
        : `/api/share/${pipelineId}/revoke?token=${encodeURIComponent(linkToken)}`;
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) throw new Error("Revoke failed");
      await refresh();
      if (isDefault) onRevoked();
      toast(isDefault ? "Default link revoked" : `"${linkLabel}" revoked`, "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Revoke failed", "error");
    }
  }

  async function copyLink(linkToken: string, linkLabel: string) {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/share/${pipelineId}?t=${linkToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(`Link for "${linkLabel}" copied`, "success");
    } catch {
      window.prompt(`Link for "${linkLabel}":`, url);
    }
  }

  const totalViews = data?.accessCount ?? 0;
  const lastView = data?.accessLog?.[0];
  const defaultRevoked = data?.revoked === true;

  return (
    <div className="mt-4 rounded-lg border border-bg-border bg-bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bg-border px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Eye className="h-3.5 w-3.5 text-brand-300" /> Share governance
          {loading && <Loader2 className="h-3 w-3 animate-spin text-ink-tertiary" />}
        </div>
        <div className="flex items-center gap-2">
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card px-2.5 py-1 text-[11px] hover:bg-bg-hover"
              title="Mint a labeled per-recipient link"
            >
              <UserPlus className="h-3 w-3" /> Add recipient
            </button>
          )}
        </div>
      </div>

      {/* Inline mint form */}
      {adding && (
        <div className="border-b border-bg-border bg-bg-hover/30 px-4 py-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
            <input
              type="text"
              autoFocus
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") mintNamed();
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder="Recipient label, e.g. 'Sarah @ Acme'"
              className="h-8 w-full rounded-md border border-bg-border bg-bg-card px-2.5 text-[12px] focus:border-brand-500 focus:outline-none"
              maxLength={80}
            />
            <select
              value={newScope}
              onChange={(e) => setNewScope(e.target.value as "full" | "recipient")}
              className="h-8 rounded-md border border-bg-border bg-bg-card px-2 text-[11px] focus:border-brand-500 focus:outline-none"
              title="Recipient: hides other buyers + drafts. Full: shows everything (internal only)."
            >
              <option value="recipient">Recipient view</option>
              <option value="full">Full view (internal)</option>
            </select>
            <select
              value={newTtl}
              onChange={(e) => setNewTtl(+e.target.value)}
              className="h-8 rounded-md border border-bg-border bg-bg-card px-2 text-[11px] focus:border-brand-500 focus:outline-none"
            >
              <option value={1}>1h</option>
              <option value={24}>24h</option>
              <option value={168}>7d</option>
              <option value={720}>30d</option>
              <option value={0}>Never</option>
            </select>
            <div className="flex gap-1">
              <button
                onClick={mintNamed}
                disabled={minting || !newLabel.trim()}
                className="flex h-8 items-center gap-1 rounded-md bg-gradient-brand px-3 text-[11px] font-semibold shadow-glow disabled:opacity-60"
              >
                {minting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Mint &amp; copy
              </button>
              <button
                onClick={() => {
                  setAdding(false);
                  setNewLabel("");
                }}
                disabled={minting}
                className="h-8 rounded-md border border-bg-border bg-bg-card px-2.5 text-[11px] hover:bg-bg-hover"
              >
                Cancel
              </button>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-ink-tertiary">
            <strong className="text-ink-secondary">Recipient view</strong> hides other buyers + outreach drafts —
            safe to send to a prospect. <strong className="text-ink-secondary">Full view</strong> shows everything,
            for internal sharing only.
          </div>
        </div>
      )}

      {/* Top-line stats */}
      <div className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
        <Mini label="Total views" v={totalViews} />
        <Mini
          label="Last viewed"
          v={lastView ? relTime(lastView.ts) : totalViews > 0 ? "—" : "Never"}
          hint={lastView ? new Date(lastView.ts).toLocaleString() : ""}
        />
        <Mini label="Active links" v={data ? data.links.filter((l) => !l.revoked).length : "—"} />
        <Mini
          label="Default expires"
          v={shareExpiresAt ? relTime(shareExpiresAt) : "Never"}
          hint={shareExpiresAt ? new Date(shareExpiresAt).toLocaleString() : ""}
        />
      </div>

      {/* Per-recipient link rows */}
      {data && data.links.length > 0 && (
        <div className="border-t border-bg-border">
          <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-ink-tertiary">
            Links ({data.links.length})
          </div>
          <ul className="divide-y divide-bg-border">
            {data.links.map((l) => {
              const isExpired =
                !l.revoked && l.expiresAt && Date.now() > new Date(l.expiresAt).getTime();
              const status = l.revoked ? "Revoked" : isExpired ? "Expired" : "Active";
              const statusColor = l.revoked
                ? "bg-accent-red/15 text-accent-red"
                : isExpired
                ? "bg-accent-amber/15 text-accent-amber"
                : "bg-accent-green/15 text-accent-green";
              return (
                <li
                  key={l.token}
                  className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[11px]"
                >
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand-500/15">
                    {l.isDefault ? (
                      <Link2 className="h-3.5 w-3.5 text-brand-300" />
                    ) : (
                      <UserPlus className="h-3.5 w-3.5 text-brand-300" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-ink-primary">{l.label}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${statusColor}`}
                      >
                        {status}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                          l.scope === "full"
                            ? "bg-accent-amber/15 text-accent-amber"
                            : "bg-brand-500/15 text-brand-200"
                        }`}
                        title={
                          l.scope === "full"
                            ? "Full view — shows other buyers + drafts (internal only)"
                            : "Recipient view — hides other buyers + drafts (safe for prospects)"
                        }
                      >
                        {l.scope === "full" ? "Full" : "Recipient"}
                      </span>
                    </div>
                    <div className="text-[10px] text-ink-tertiary">
                      {l.accessCount} view{l.accessCount === 1 ? "" : "s"}
                      {l.lastViewedAt && <> · last {relTime(l.lastViewedAt)}</>}
                      {l.expiresAt && !l.revoked && <> · expires {relTime(l.expiresAt)}</>}
                      {l.revoked && l.revokedAt && <> · revoked {relTime(l.revokedAt)}</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!l.revoked && !isExpired && (
                      <button
                        onClick={() => copyLink(l.token, l.label)}
                        className="grid h-7 w-7 place-items-center rounded-md border border-bg-border bg-bg-card hover:bg-bg-hover"
                        title="Copy URL"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    )}
                    {!l.revoked && (
                      <button
                        onClick={() => revokeLink(l.token, l.label, l.isDefault)}
                        className="grid h-7 w-7 place-items-center rounded-md border border-accent-red/30 bg-accent-red/5 text-accent-red hover:bg-accent-red/10"
                        title={l.isDefault ? "Revoke default link" : "Revoke this recipient's link"}
                      >
                        <ShieldOff className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Recent views — global, all links */}
      {data && data.accessLog.length > 0 && (
        <div className="border-t border-bg-border">
          <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-ink-tertiary">
            Recent views
          </div>
          <ul className="divide-y divide-bg-border">
            {data.accessLog.slice(0, 5).map((e, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-2 text-[11px]">
                <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-brand-500/15">
                  <Eye className="h-3 w-3 text-brand-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-ink-primary">
                    <span>{new Date(e.ts).toLocaleString()}</span>
                    {e.linkLabel && (
                      <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[9px] font-bold text-brand-200">
                        {e.linkLabel}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[10px] text-ink-tertiary">
                    {e.ip ? `${e.ip} · ` : ""}
                    {e.userAgent
                      ? e.userAgent.length > 80
                        ? e.userAgent.slice(0, 80) + "…"
                        : e.userAgent
                      : "unknown UA"}
                    {e.referer ? ` · from ${safeHost(e.referer)}` : ""}
                  </div>
                </div>
                <div className="text-[10px] text-ink-tertiary">{relTime(e.ts)}</div>
              </li>
            ))}
          </ul>
          {data.accessLog.length > 5 && (
            <div className="border-t border-bg-border px-4 py-2 text-center text-[10px] text-ink-tertiary">
              +{data.accessLog.length - 5} earlier view{data.accessLog.length - 5 === 1 ? "" : "s"}
            </div>
          )}
        </div>
      )}

      {data && data.accessLog.length === 0 && !defaultRevoked && (
        <div className="border-t border-bg-border px-4 py-3 text-[11px] text-ink-tertiary">
          No views yet. Default link is live; mint named links for individual recipients.
        </div>
      )}
    </div>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}

function Mini({
  label,
  v,
  hint,
  tone,
}: {
  label: string;
  v: string | number;
  hint?: string;
  tone?: "green" | "amber" | "red";
}) {
  const toneClass =
    tone === "red"
      ? "text-accent-red"
      : tone === "amber"
      ? "text-accent-amber"
      : tone === "green"
      ? "text-accent-green"
      : "";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${toneClass}`}>{v}</div>
      {hint && <div className="text-[10px] text-ink-tertiary">{hint}</div>}
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
