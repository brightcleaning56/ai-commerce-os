"use client";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  GitBranch,
  Loader2,
  MapPin,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";

type SupplyEdgeKind = "sources_from" | "distributes_through" | "competes_with" | "partners_with";
type SupplyEdgeSource = "ai_profile" | "transaction" | "operator" | "partner";

type BrandBusiness = {
  businessId: string;
  businessName: string;
  city?: string;
  state?: string;
  confidence: number;
  source: SupplyEdgeSource;
  lastSeenAt: string;
  evidence?: string;
};

type BrandAggregate = {
  brand: string;
  kind: SupplyEdgeKind;
  businessCount: number;
  avgConfidence: number;
  topBusinesses: BrandBusiness[];
  topBusinessIds: string[];
  sources: Partial<Record<SupplyEdgeSource, number>>;
  transactionObservedCount: number;
  coBrands: { brand: string; sharedCount: number }[];
  lastSeenAt: string;
};

type BrandsPayload = {
  brands: BrandAggregate[];
  totalEdges: number;
  totalBrands: number;
  totalBusinesses: number;
};

type AlternativeStrength =
  | "regional"
  | "national"
  | "moq"
  | "price"
  | "service"
  | "speed"
  | "specialty"
  | "other";

type BrandAlternativeEntry = {
  name: string;
  rationale: string;
  strength?: AlternativeStrength;
  score?: number;
};

type BrandAlternative = {
  id: string;
  brand: string;
  brandDisplay: string;
  category?: string;
  alternatives: BrandAlternativeEntry[];
  generatedAt: string;
  modelUsed: string;
  estCostUsd?: number;
  usedFallback: boolean;
  regeneratedCount: number;
  contextSampleSize?: number;
};

const KIND_LABELS: Record<SupplyEdgeKind, string> = {
  sources_from: "Sources from",
  distributes_through: "Distributes through",
  competes_with: "Competes with",
  partners_with: "Partners with",
};

const KIND_TONE: Record<SupplyEdgeKind, string> = {
  sources_from: "bg-accent-amber/15 text-accent-amber",
  distributes_through: "bg-accent-cyan/15 text-accent-cyan",
  competes_with: "bg-bg-hover text-ink-secondary",
  partners_with: "bg-brand-500/15 text-brand-200",
};

const SOURCE_TONE: Record<SupplyEdgeSource, string> = {
  transaction: "text-accent-green",
  operator: "text-brand-200",
  ai_profile: "text-ink-tertiary",
  partner: "text-ink-tertiary",
};

const MAX_DRAFT_BATCH = 25;

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 30 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function EdgesPage() {
  const [data, setData] = useState<BrandsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState<SupplyEdgeKind | "">("");

  const [selected, setSelected] = useState<BrandAggregate | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [alternative, setAlternative] = useState<BrandAlternative | null>(null);
  const [loadingAlt, setLoadingAlt] = useState(false);
  const [generatingAlt, setGeneratingAlt] = useState(false);
  // Which alternative is currently being bulk-drafted (so we can show a
  // per-row spinner). null = none in flight.
  const [draftingAltName, setDraftingAltName] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (kindFilter) params.set("kind", kindFilter);
      const r = await fetch(`/api/admin/edges/brands?${params}`, { cache: "no-store" });
      if (r.status === 401) {
        setLoadError("Not signed in — visit /signin and try again.");
        return;
      }
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setLoadError(`API returned ${r.status}: ${body.error ?? r.statusText}`);
        return;
      }
      setData((await r.json()) as BrandsPayload);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [q, kindFilter]);

  useEffect(() => { load(); }, [load]);

  // Lazy-load alternatives when a brand is selected. Only fetches for
  // sources_from edges (alternatives for distribution channels don't
  // make sense yet — that's a slice 8 question).
  useEffect(() => {
    if (!selected || selected.kind !== "sources_from") {
      setAlternative(null);
      return;
    }
    let cancelled = false;
    async function loadAlt(brand: string) {
      setLoadingAlt(true);
      setAlternative(null);
      try {
        const r = await fetch(
          `/api/admin/edges/alternatives/${encodeURIComponent(brand)}`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        if (r.status === 404) {
          setAlternative(null);
        } else if (r.ok) {
          const d = await r.json();
          setAlternative(d.alternative);
        }
      } catch {
        // Silent — UI shows "no alternatives yet" + Generate button
      } finally {
        if (!cancelled) setLoadingAlt(false);
      }
    }
    loadAlt(selected.brand);
    return () => { cancelled = true; };
  }, [selected]);

  async function generateAlternatives(brand: string) {
    setGeneratingAlt(true);
    try {
      const r = await fetch(
        `/api/admin/edges/alternatives/${encodeURIComponent(brand)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Generate failed (${r.status})`);
      setAlternative(d.alternative);
      toast(
        d.alternative?.usedFallback
          ? "Alternatives generated (fallback — no Anthropic key)"
          : `Generated ${d.alternative?.alternatives?.length ?? 0} alternatives`,
        d.alternative?.usedFallback ? "info" : "success",
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Generate failed", "error");
    } finally {
      setGeneratingAlt(false);
    }
  }

  async function draftWithAlternative(
    brandAgg: BrandAggregate,
    alt: BrandAlternativeEntry,
  ) {
    const ids = brandAgg.topBusinesses.slice(0, MAX_DRAFT_BATCH).map((b) => b.businessId);
    if (ids.length === 0) return;
    setDraftingAltName(alt.name);
    try {
      const r = await fetch("/api/admin/businesses/draft-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessIds: ids,
          pitchOverride: {
            currentBrand: brandAgg.brand,
            alternative: alt.name,
            rationale: alt.rationale,
          },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Draft failed (${r.status})`);
      const drafted = d.drafted ?? 0;
      const skipped = d.skipped ?? 0;
      toast(
        `Drafted ${drafted} "switch ${brandAgg.brand} → ${alt.name}" pitch${drafted === 1 ? "" : "es"}${skipped ? ` · skipped ${skipped}` : ""} — review in /outreach`,
        drafted > 0 ? "success" : "info",
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Draft failed", "error");
    } finally {
      setDraftingAltName(null);
    }
  }

  async function draftOutreachForBrand(brand: BrandAggregate) {
    // Cap at 25 (the endpoint's hard limit). If more businesses use this
    // brand, operator runs the action again — we slice the highest-
    // confidence batch first.
    const ids = brand.topBusinesses
      .slice(0, MAX_DRAFT_BATCH)
      .map((b) => b.businessId);
    if (ids.length === 0) return;
    setDrafting(true);
    try {
      const r = await fetch("/api/admin/businesses/draft-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessIds: ids }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Draft outreach failed (${r.status})`);
      const drafted = d.drafted ?? 0;
      const skipped = d.skipped ?? 0;
      const errored = d.errored ?? 0;
      toast(
        `Drafted ${drafted}${skipped ? ` · skipped ${skipped}` : ""}${errored ? ` · errored ${errored}` : ""} — review in /outreach`,
        drafted > 0 ? "success" : "info",
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Draft outreach failed", "error");
    } finally {
      setDrafting(false);
    }
  }

  const tilesData = useMemo(() => {
    return [
      { k: "Edges in graph", v: (data?.totalEdges ?? 0).toLocaleString() },
      { k: "Unique brands", v: (data?.totalBrands ?? 0).toLocaleString() },
      { k: "Businesses in graph", v: (data?.totalBusinesses ?? 0).toLocaleString() },
      { k: "Filtered results", v: (data?.brands.length ?? 0).toLocaleString() },
    ];
  }, [data]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <GitBranch className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Supply Graph</h1>
            <p className="text-xs text-ink-secondary">
              {data?.totalEdges === 0
                ? "No edges yet — Profile Scans + settled transactions seed the graph"
                : `${data?.totalBrands ?? 0} brand${data?.totalBrands === 1 ? "" : "s"} across ${data?.totalBusinesses ?? 0} businesses · click any brand to see who buys from them`}
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-accent-cyan/30 bg-accent-cyan/5 px-4 py-3">
        <div className="flex items-start gap-3 text-[12px]">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-cyan/15">
            <Sparkles className="h-3.5 w-3.5 text-accent-cyan" />
          </div>
          <div className="flex-1 text-ink-secondary">
            <span className="font-semibold text-accent-cyan">Commercial Intelligence Graph</span>
            {" "}— this is the cross-reference engine. Click any brand to see every business in
            your directory using it, with confidence + source per edge. Bulk-draft outreach
            to all users of a brand with one click (cap {MAX_DRAFT_BATCH}/run; the highest-
            confidence batch goes first).
          </div>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-accent-red/40 bg-accent-red/5 px-4 py-3 text-xs text-accent-red">
          <strong className="font-semibold">Couldn&apos;t load graph:</strong> {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tilesData.map((t) => (
          <div key={t.k} className="rounded-xl border border-bg-border bg-bg-card p-4">
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{t.k}</div>
            <div className="mt-1 text-2xl font-bold">{t.v}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search brand name…"
            className="h-9 w-full rounded-lg border border-bg-border bg-bg-card pl-9 pr-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
          />
        </div>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as SupplyEdgeKind | "")}
          className="h-9 rounded-lg border border-bg-border bg-bg-card px-3 text-sm"
        >
          <option value="">All edge kinds</option>
          {Object.entries(KIND_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </div>

      {/* Brand list */}
      <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
        {data === null && !loadError ? (
          <div className="flex items-center gap-2 px-5 py-8 text-[12px] text-ink-tertiary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading graph…
          </div>
        ) : data && data.brands.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <GitBranch className="mx-auto h-8 w-8 text-ink-tertiary" />
            <div className="mt-3 text-base font-semibold">
              {data.totalEdges === 0 ? "No edges in the graph yet" : "No brands match your filters"}
            </div>
            <p className="mt-1 max-w-md mx-auto text-xs text-ink-tertiary">
              {data.totalEdges === 0 ? (
                <>
                  Run an AI Profile Scan on a business in{" "}
                  <a href="/admin/businesses" className="text-brand-300 hover:underline">/admin/businesses</a>
                  {" "}— supplier brands extracted from the homepage seed the graph. Transaction-observed edges (confidence 100) add automatically when escrow releases.
                </>
              ) : (
                "Clear the search or change the kind filter to see more."
              )}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
                <tr className="border-b border-bg-border">
                  <th className="px-5 py-2.5 text-left font-medium">Brand</th>
                  <th className="px-3 py-2.5 text-left font-medium">Kind</th>
                  <th className="px-3 py-2.5 text-right font-medium">Businesses</th>
                  <th className="px-3 py-2.5 text-right font-medium">Avg conf.</th>
                  <th className="px-3 py-2.5 text-left font-medium">Sources</th>
                  <th className="px-3 py-2.5 text-left font-medium">Co-brands (top 3)</th>
                  <th className="px-3 py-2.5 text-left font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {(data?.brands ?? []).map((b) => (
                  <tr
                    key={`${b.brand}|${b.kind}`}
                    onClick={() => setSelected(b)}
                    className="cursor-pointer border-t border-bg-border hover:bg-bg-hover/30"
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium">{b.brand}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${KIND_TONE[b.kind]}`}>
                        {KIND_LABELS[b.kind]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {b.businessCount}
                    </td>
                    <td className="px-3 py-3 text-right text-ink-secondary">
                      {b.avgConfidence}%
                    </td>
                    <td className="px-3 py-3 text-[10px]">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(b.sources).map(([source, count]) => (
                          <span
                            key={source}
                            className={`rounded bg-bg-hover px-1.5 py-0.5 ${SOURCE_TONE[source as SupplyEdgeSource]}`}
                            title={`${count} ${source} edges`}
                          >
                            {source.replace("_", " ")} {count}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[10px] text-ink-secondary">
                      {b.coBrands.length === 0 ? (
                        <span className="text-ink-tertiary">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {b.coBrands.slice(0, 3).map((c) => (
                            <span key={c.brand} className="rounded bg-bg-hover px-1.5 py-0.5">
                              {c.brand} <span className="text-ink-tertiary">×{c.sharedCount}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[11px] text-ink-tertiary">
                      {relTime(b.lastSeenAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Brand drawer — overlay with full business list + bulk action */}
      {selected && (
        <div
          className="fixed inset-0 z-40 flex items-stretch justify-end bg-black/40"
          onClick={() => setSelected(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-2xl flex-col border-l border-bg-border bg-bg-panel shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-bg-border px-5 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <button
                  onClick={() => setSelected(null)}
                  className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${KIND_TONE[selected.kind]}`}>
                  {KIND_LABELS[selected.kind]}
                </span>
                <span>{selected.brand}</span>
                <span className="text-[11px] font-normal text-ink-tertiary">
                  · {selected.businessCount} business{selected.businessCount === 1 ? "" : "es"}
                </span>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="border-b border-bg-border px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] text-ink-secondary">
                  Avg confidence{" "}
                  <span className="font-semibold text-ink-primary">{selected.avgConfidence}%</span>
                  {selected.transactionObservedCount > 0 && (
                    <>
                      {" · "}
                      <span className="text-accent-green">
                        {selected.transactionObservedCount} transaction-observed
                      </span>
                    </>
                  )}
                </div>
                <button
                  onClick={() => draftOutreachForBrand(selected)}
                  disabled={drafting || selected.businessCount === 0}
                  className="flex items-center gap-2 rounded-lg bg-gradient-brand px-4 py-2 text-sm font-semibold shadow-glow disabled:opacity-60"
                  title={`Generate AVYN-onboarding drafts for the top ${Math.min(selected.businessCount, MAX_DRAFT_BATCH)} businesses (highest confidence first). Suppressed rows are skipped server-side. Drafts land in /outreach for review.`}
                >
                  {drafting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Draft outreach for{" "}
                  {Math.min(selected.businessCount, MAX_DRAFT_BATCH)}
                </button>
              </div>
              {selected.businessCount > MAX_DRAFT_BATCH && (
                <p className="mt-2 text-[10px] text-ink-tertiary">
                  Cap {MAX_DRAFT_BATCH}/run · {selected.businessCount - MAX_DRAFT_BATCH} remaining
                  for a follow-up batch.
                </p>
              )}
              {selected.coBrands.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                    Also sourced from (cross-sell signal)
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selected.coBrands.map((c) => (
                      <span
                        key={c.brand}
                        className="rounded bg-bg-hover px-2 py-0.5 text-[10px] text-ink-secondary"
                      >
                        {c.brand} <span className="text-ink-tertiary">× {c.sharedCount}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Alternatives panel — only meaningful for sources_from edges.
                For distribution channels there's no "switch to better X" play. */}
            {selected.kind === "sources_from" && (
              <div className="border-b border-bg-border px-5 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-brand-200">
                    <Sparkles className="h-3.5 w-3.5" />
                    AI suggested alternatives
                    {alternative && (
                      <span className="text-[10px] font-normal text-ink-tertiary">
                        · generated {relTime(alternative.generatedAt)}
                        {alternative.regeneratedCount > 0 && ` · refreshed ${alternative.regeneratedCount}×`}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => generateAlternatives(selected.brand)}
                    disabled={generatingAlt}
                    title={alternative ? "Re-generate alternatives (use after market shifts or better data)" : "Ask Claude to find 3-5 competing wholesalers in the same category"}
                    className="flex items-center gap-1 rounded-md border border-brand-500/40 bg-brand-500/10 px-2.5 py-1 text-[10px] hover:bg-brand-500/20 disabled:opacity-60"
                  >
                    {generatingAlt ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    {alternative ? "Re-generate" : "Find alternatives"}
                  </button>
                </div>

                {loadingAlt ? (
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-tertiary">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading alternatives…
                  </div>
                ) : !alternative ? (
                  <p className="mt-2 text-[11px] text-ink-tertiary">
                    No alternatives generated yet. Click <strong>Find alternatives</strong> — Claude reads who currently sources from {selected.brand}, infers the category, and returns 3-5 competing wholesalers (~$0.003).
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {alternative.category && (
                      <div className="text-[10px] text-ink-tertiary">
                        Category: <span className="text-ink-secondary">{alternative.category}</span>
                        {alternative.contextSampleSize !== undefined && (
                          <span> · {alternative.contextSampleSize} businesses sampled for context</span>
                        )}
                        {alternative.usedFallback && (
                          <span className="ml-2 rounded bg-accent-amber/20 px-1.5 py-0.5 text-accent-amber">
                            fallback (no Anthropic key)
                          </span>
                        )}
                      </div>
                    )}
                    {alternative.alternatives.map((alt) => (
                      <div
                        key={alt.name}
                        className="rounded-lg border border-bg-border bg-bg-card/60 p-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[12px] font-semibold">{alt.name}</span>
                              {alt.strength && (
                                <span className="rounded bg-bg-hover px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-ink-tertiary">
                                  {alt.strength}
                                </span>
                              )}
                              {typeof alt.score === "number" && (
                                <span className="text-[10px] text-ink-tertiary">{alt.score}%</span>
                              )}
                            </div>
                            <p className="mt-1 text-[11px] text-ink-secondary">{alt.rationale}</p>
                          </div>
                          <button
                            onClick={() => draftWithAlternative(selected, alt)}
                            disabled={draftingAltName !== null || alt.score === 0}
                            title={
                              alt.score === 0
                                ? "Fallback alt (no Anthropic) — re-generate after wiring API key"
                                : `Draft "switch ${selected.brand} → ${alt.name}" pitch for the top ${Math.min(selected.businessCount, MAX_DRAFT_BATCH)} businesses`
                            }
                            className="flex shrink-0 items-center gap-1 rounded-md bg-gradient-brand px-2.5 py-1 text-[10px] font-semibold shadow-glow disabled:opacity-50"
                          >
                            {draftingAltName === alt.name ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Send className="h-3 w-3" />
                            )}
                            Pitch swap to {Math.min(selected.businessCount, MAX_DRAFT_BATCH)}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-3">
              {selected.topBusinesses.length === 0 ? (
                <div className="text-xs text-ink-tertiary">No businesses to show.</div>
              ) : (
                <div className="space-y-2">
                  {selected.topBusinesses.map((b) => (
                    <a
                      key={b.businessId}
                      href={`/admin/businesses?q=${encodeURIComponent(b.businessName)}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-bg-border bg-bg-card p-3 hover:bg-bg-hover/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{b.businessName}</span>
                          <span
                            className={`text-[10px] font-mono ${SOURCE_TONE[b.source]}`}
                            title={`Source: ${b.source} · evidence: ${b.evidence ?? "—"}`}
                          >
                            {b.source}
                          </span>
                          <span className="text-[10px] text-ink-tertiary">{b.confidence}%</span>
                        </div>
                        {(b.city || b.state) && (
                          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-tertiary">
                            <MapPin className="h-3 w-3" /> {[b.city, b.state].filter(Boolean).join(", ")}
                          </div>
                        )}
                        {b.evidence && (
                          <div className="mt-1 truncate text-[10px] text-ink-tertiary" title={b.evidence}>
                            {b.evidence}
                          </div>
                        )}
                      </div>
                      <div className="text-[10px] text-ink-tertiary">
                        {relTime(b.lastSeenAt)}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-bg-border px-5 py-3 text-[10px] text-ink-tertiary">
              {selected.businessCount > selected.topBusinesses.length && (
                <>
                  Showing top {selected.topBusinesses.length} of {selected.businessCount} by
                  confidence. Bulk-draft batches the highest-signal subset.
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Honest banner when no data yet — different empty state from the table empty */}
      {data && data.totalEdges === 0 && (
        <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/5 px-4 py-3">
          <div className="flex items-start gap-3 text-[12px]">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-amber/15">
              <AlertCircle className="h-3.5 w-3.5 text-accent-amber" />
            </div>
            <div className="flex-1 text-ink-secondary">
              Two ways edges land here:{" "}
              <strong>(1)</strong> AI Profile Scans on{" "}
              <a href="/admin/businesses" className="text-brand-300 hover:underline">/admin/businesses</a>{" "}
              extract supplier brands from each homepage and write ai_profile edges at 30-95%
              confidence.{" "}
              <strong>(2)</strong> When real transactions settle (escrow released or completed),
              transaction-observed edges write at 100% confidence — those upgrade any
              ai_profile edge for the same (buyer, supplier) pair.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
