"use client";
import {
  Bookmark,
  Filter,
  Flame,
  Grid3x3,
  List,
  Loader2,
  Package,
  Search,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Drawer from "@/components/ui/Drawer";
import Sparkline from "@/components/ui/Sparkline";
import ProductDetail from "@/components/products/ProductDetail";
import { PRODUCTS, type Product } from "@/lib/products";
import { useLocalSet } from "@/lib/useLocalSet";

type DiscoveredProduct = Product & {
  source?: "agent";
  agent?: string;
  discoveredAt?: string;
  runId?: string;
  rationale?: string;
};

const SORT_OPTIONS = [
  { v: "demand", l: "Demand Score" },
  { v: "profit", l: "Profit" },
  { v: "trend", l: "Trend Velocity" },
  { v: "competition", l: "Lowest Competition" },
] as const;

const COMP_TONE: Record<string, string> = {
  Low: "bg-accent-green/15 text-accent-green",
  Medium: "bg-accent-amber/15 text-accent-amber",
  High: "bg-accent-red/15 text-accent-red",
};

const POT_TONE: Record<string, string> = {
  "Very High": "bg-brand-500/15 text-brand-200",
  High: "bg-accent-blue/15 text-accent-blue",
  Medium: "bg-bg-hover text-ink-secondary",
  Low: "bg-bg-hover text-ink-tertiary",
};

const CATEGORIES = Array.from(new Set(PRODUCTS.map((p) => p.category)));
const COMPETITIONS = ["Low", "Medium", "High"] as const;

export default function ProductsPage() {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]["v"]>("demand");
  const [cats, setCats] = useState<string[]>([]);
  const [comps, setComps] = useState<string[]>([]);
  const [minScore, setMinScore] = useState(70);
  const [savedOnly, setSavedOnly] = useState(false);
  const [open, setOpen] = useState<Product | null>(null);

  // Live AI-discovered products
  const [discovered, setDiscovered] = useState<DiscoveredProduct[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastRun, setLastRun] = useState<{ count: number; ago: string; usedFallback: boolean; cost?: number } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const watchlist = useLocalSet("aicos:watchlist:v1");

  // Hydrate from API on mount
  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setDiscovered(d.products ?? []))
      .catch(() => {});
  }, []);

  async function runScan() {
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch("/api/agents/trend-hunter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: cats.length === 1 ? cats[0] : null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      // Refresh products
      const ref = await fetch("/api/products").then((r) => r.json());
      setDiscovered(ref.products ?? []);
      setLastRun({
        count: data.run.productCount,
        ago: "just now",
        usedFallback: data.run.usedFallback,
        cost: data.run.estCostUsd,
      });
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  // Merge: discovered first (so they show on top by default), then static
  const allProducts: DiscoveredProduct[] = useMemo(
    () => [...discovered, ...PRODUCTS],
    [discovered]
  );

  const list = useMemo(() => {
    let out = allProducts.filter((p) => {
      if (query && !p.name.toLowerCase().includes(query.toLowerCase()) &&
        !p.niche.toLowerCase().includes(query.toLowerCase())) return false;
      if (cats.length && !cats.includes(p.category)) return false;
      if (comps.length && !comps.includes(p.competition)) return false;
      if (p.demandScore < minScore) return false;
      if (savedOnly && !watchlist.has(p.id)) return false;
      return true;
    });
    out = out.slice().sort((a, b) => {
      switch (sort) {
        case "demand": return b.demandScore - a.demandScore;
        case "profit": return b.profit - a.profit;
        case "trend": return b.trendVelocity - a.trendVelocity;
        case "competition":
          return ["Low","Medium","High"].indexOf(a.competition) -
            ["Low","Medium","High"].indexOf(b.competition);
      }
    });
    return out;
  }, [allProducts, query, sort, cats, comps, minScore, savedOnly, watchlist]);

  const toggle = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Product Discovery</h1>
            <p className="text-xs text-ink-secondary">
              {list.length} of {allProducts.length} products match your filters
              {discovered.length > 0 && (
                <> · <span className="text-brand-300">{discovered.length} live</span> from agent runs</>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSavedOnly((v) => !v)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              savedOnly
                ? "border-brand-500/50 bg-brand-500/15 text-brand-200"
                : "border-bg-border bg-bg-card hover:bg-bg-hover"
            }`}
          >
            <Bookmark className="h-4 w-4" /> Saved ({watchlist.items.length})
          </button>
          <button
            onClick={runScan}
            disabled={scanning}
            className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow disabled:opacity-60"
          >
            {scanning ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Trend Hunter scanning…</>
            ) : (
              <><Flame className="h-4 w-4" /> Run Trend Scan</>
            )}
          </button>
        </div>
      </div>

      {(lastRun || scanError) && (
        <div
          className={`rounded-lg border p-3 text-xs ${
            scanError
              ? "border-accent-red/30 bg-accent-red/5 text-accent-red"
              : "border-brand-500/30 bg-brand-500/5 text-ink-secondary"
          }`}
        >
          {scanError ? (
            <>Scan failed: {scanError}</>
          ) : lastRun ? (
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-brand-300" />
              <span>
                Trend Hunter discovered <span className="font-semibold text-brand-200">{lastRun.count}</span> new products {lastRun.ago}.
                {lastRun.usedFallback ? (
                  <> Results sourced from cached trend data.</>
                ) : (
                  <> Live Claude analysis · est cost ${lastRun.cost?.toFixed(5) ?? "—"}</>
                )}
              </span>
            </div>
          ) : null}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
        {/* Filter Sidebar */}
        <aside className="space-y-4 rounded-xl border border-bg-border bg-bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="h-4 w-4 text-brand-300" />
            Filters
          </div>

          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Min Demand Score
            </div>
            <input
              type="range"
              min={50}
              max={100}
              value={minScore}
              onChange={(e) => setMinScore(+e.target.value)}
              className="w-full accent-brand-500"
            />
            <div className="mt-1 flex justify-between text-[11px] text-ink-tertiary">
              <span>50</span>
              <span className="text-brand-300">{minScore}+</span>
              <span>100</span>
            </div>
          </div>

          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Category
            </div>
            <div className="space-y-1">
              {CATEGORIES.map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={cats.includes(c)}
                    onChange={() => setCats(toggle(cats, c))}
                    className="h-3.5 w-3.5 accent-brand-500"
                  />
                  <span className="flex-1 text-ink-secondary">{c}</span>
                  <span className="text-ink-tertiary">
                    {PRODUCTS.filter((p) => p.category === c).length}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Competition
            </div>
            <div className="flex gap-1.5">
              {COMPETITIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setComps(toggle(comps, c))}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] ${
                    comps.includes(c)
                      ? "border-brand-500/50 bg-brand-500/15 text-brand-200"
                      : "border-bg-border bg-bg-hover/40 text-ink-secondary hover:bg-bg-hover"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-bg-border bg-bg-hover/30 px-3 py-2.5 text-xs">
            <span className="text-ink-secondary">Saved only</span>
            <input
              type="checkbox"
              checked={savedOnly}
              onChange={(e) => setSavedOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-brand-500"
            />
          </label>

          <button
            onClick={() => {
              setCats([]);
              setComps([]);
              setMinScore(70);
              setSavedOnly(false);
              setQuery("");
            }}
            className="w-full rounded-md border border-bg-border bg-bg-hover/40 py-2 text-xs text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
          >
            Clear filters
          </button>
        </aside>

        {/* Main */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products, niches…"
                className="h-9 w-full rounded-lg border border-bg-border bg-bg-card pl-9 pr-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="h-9 rounded-lg border border-bg-border bg-bg-card px-3 text-sm"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>
                  Sort: {o.l}
                </option>
              ))}
            </select>
            <div className="flex overflow-hidden rounded-lg border border-bg-border">
              <button
                onClick={() => setView("grid")}
                className={`grid h-9 w-9 place-items-center ${
                  view === "grid" ? "bg-brand-500/15 text-brand-200" : "bg-bg-card text-ink-secondary"
                }`}
              >
                <Grid3x3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView("list")}
                className={`grid h-9 w-9 place-items-center ${
                  view === "list" ? "bg-brand-500/15 text-brand-200" : "bg-bg-card text-ink-secondary"
                }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          {list.length === 0 ? (
            <div className="rounded-xl border border-bg-border bg-bg-card p-10 text-center">
              <Filter className="mx-auto h-8 w-8 text-ink-tertiary" />
              <div className="mt-2 text-sm font-medium">No products match your filters</div>
              <div className="text-xs text-ink-tertiary">Try lowering the demand score or clearing filters.</div>
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setOpen(p)}
                  className={`group relative rounded-xl border bg-bg-card p-4 text-left transition hover:border-brand-500/50 hover:shadow-glow ${
                    p.source === "agent" ? "border-brand-500/40" : "border-bg-border"
                  }`}
                >
                  {p.source === "agent" && (
                    <span className="absolute -top-2 left-3 flex items-center gap-1 rounded-full bg-gradient-brand px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow-glow">
                      <Sparkles className="h-2.5 w-2.5" /> Live
                    </span>
                  )}
                  <div className="flex items-start justify-between">
                    <div className="grid h-12 w-12 place-items-center rounded-lg bg-gradient-card text-2xl">
                      {p.emoji}
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                        Demand
                      </div>
                      <div className="text-lg font-bold text-brand-200">{p.demandScore}</div>
                    </div>
                  </div>
                  <div className="mt-3 font-semibold leading-tight">{p.name}</div>
                  <div className="text-[11px] text-ink-tertiary">
                    {p.category} · {p.niche}
                  </div>
                  <div className="mt-3 h-8">
                    <Sparkline data={p.trend14d} color="#22c55e" />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="font-semibold text-accent-green">+{p.trendVelocity}%</span>
                    <span className="text-ink-secondary">${p.profit.toFixed(2)}/unit</span>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5">
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${COMP_TONE[p.competition]}`}>
                      {p.competition}
                    </span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${POT_TONE[p.potential]}`}>
                      {p.potential}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
              <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
                  <tr className="border-b border-bg-border">
                    <th className="px-4 py-2.5 text-left font-medium">Product</th>
                    <th className="px-3 py-2.5 text-left font-medium">Score</th>
                    <th className="px-3 py-2.5 text-left font-medium">Profit</th>
                    <th className="px-3 py-2.5 text-left font-medium">Trend</th>
                    <th className="px-3 py-2.5 text-left font-medium">Comp.</th>
                    <th className="px-3 py-2.5 text-left font-medium">Potential</th>
                    <th className="px-4 py-2.5 text-left font-medium">Origin</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => setOpen(p)}
                      className="cursor-pointer border-t border-bg-border hover:bg-bg-hover/30"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="grid h-9 w-9 place-items-center rounded-md bg-gradient-card text-lg">
                            {p.emoji}
                          </div>
                          <div>
                            <div className="font-medium">{p.name}</div>
                            <div className="text-[11px] text-ink-tertiary">{p.niche}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-semibold text-brand-200">{p.demandScore}</td>
                      <td className="px-3 py-3">${p.profit.toFixed(2)}</td>
                      <td className="px-3 py-3 text-accent-green">+{p.trendVelocity}%</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${COMP_TONE[p.competition]}`}>
                          {p.competition}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${POT_TONE[p.potential]}`}>
                          {p.potential}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-secondary">{p.countryOrigin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        title="Product Intelligence"
      >
        {open && <ProductDetail p={open} />}
      </Drawer>
    </div>
  );
}
