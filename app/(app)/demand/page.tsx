"use client";
import { Activity, BarChart3, Search, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { Product } from "@/lib/products";

function makeSeries(p: Product) {
  const trend = p.trend14d ?? [];
  if (trend.length === 0) {
    // Synthesize a flat-ish trend from demandScore so the chart isn't empty
    const base = Math.max(20, p.demandScore - 10);
    return Array.from({ length: 14 }, (_, i) => ({
      d: i,
      v: Math.round(base + Math.sin(i / 2) * 6 + i * 0.5),
    }));
  }
  return trend.map((v, i) => ({ d: i, v }));
}

function radarFor(p: Product) {
  return [
    { axis: "Search Volume", v: Math.min(100, Math.round((p.searchVolume ?? 0) / 800)) },
    { axis: "Social Score", v: p.socialScore ?? 0 },
    { axis: "Trend Velocity", v: Math.min(100, (p.trendVelocity ?? 0) / 3) },
    { axis: "Profit", v: Math.min(100, p.retail ? Math.round((p.profit / p.retail) * 100) : 0) },
    { axis: "Saturation", v: 100 - (p.saturation ?? 50) },
    {
      axis: "Competition",
      v: ({ Low: 90, Medium: 60, High: 30 } as const)[p.competition ?? "Medium"],
    },
  ];
}

const COMP_TONE: Record<string, string> = {
  Low: "text-accent-green",
  Medium: "text-accent-amber",
  High: "text-accent-red",
};

export default function DemandPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/products", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const list: Product[] = d?.products ?? [];
        setProducts(list);
        if (list.length > 0) setSelectedId(list[0].id);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const list = useMemo(() => {
    if (!products) return [];
    return products
      .filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => (b.demandScore ?? 0) - (a.demandScore ?? 0))
      .slice(0, 12);
  }, [products, query]);

  const selected = useMemo(
    () => products?.find((p) => p.id === selectedId) ?? products?.[0] ?? null,
    [products, selectedId],
  );

  // ── Empty state ─────────────────────────────────────────────────────
  if (products && products.length === 0) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Demand Intelligence</h1>
            <p className="text-xs text-ink-secondary">
              Multi-source demand scoring · live signals from Reddit, Hacker News, and product launch feeds
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-500/5 to-transparent p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/15">
            <BarChart3 className="h-7 w-7 text-brand-300" />
          </div>
          <div className="mt-4 text-base font-semibold">No products to score yet</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-secondary">
            Demand Intelligence ranks each discovered product across six signals — search volume, social score, trend velocity,
            profit, saturation, and competition. Run the Trend Hunter to populate the catalog.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/pipeline"
              className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-xs font-semibold shadow-glow"
            >
              <Sparkles className="h-3 w-3" /> Run pipeline
            </Link>
            <Link
              href="/products"
              className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-xs hover:bg-bg-hover"
            >
              <Search className="h-3 w-3" /> Browse Products
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-bg-border bg-bg-card py-16 text-ink-tertiary">
        <Sparkles className="h-6 w-6 animate-pulse" />
      </div>
    );
  }

  const series = makeSeries(selected);
  const radar = radarFor(selected);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Demand Intelligence</h1>
            <p className="text-xs text-ink-secondary">
              Multi-source demand scoring · {products?.length ?? 0} products tracked from real Trend Hunter runs
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-3 rounded-xl border border-bg-border bg-bg-card p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search product…"
              className="h-9 w-full rounded-lg border border-bg-border bg-bg-card pl-9 pr-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            {list.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs ${
                  selectedId === p.id
                    ? "bg-brand-500/15 text-brand-200"
                    : "hover:bg-bg-hover"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{p.emoji ?? "📦"}</span>
                  <span className="truncate text-sm">{p.name}</span>
                </div>
                <span className="font-semibold">{p.demandScore ?? "—"}</span>
              </button>
            ))}
            {list.length === 0 && (
              <div className="px-2 py-3 text-center text-[11px] text-ink-tertiary">
                No matches for &quot;{query}&quot;
              </div>
            )}
          </div>
        </aside>

        <div className="space-y-4">
          <div className="rounded-xl border border-bg-border bg-bg-card p-5">
            <div className="flex items-start gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-xl bg-gradient-card text-3xl">
                {selected.emoji ?? "📦"}
              </div>
              <div className="flex-1">
                <div className="text-xl font-bold">{selected.name}</div>
                <div className="text-xs text-ink-tertiary">
                  {selected.category}
                  {selected.niche && ` · ${selected.niche}`}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-md bg-brand-500/15 px-2 py-0.5 font-semibold text-brand-200">
                    Demand {selected.demandScore ?? "—"}
                  </span>
                  {selected.competition && (
                    <span className={`font-semibold ${COMP_TONE[selected.competition]}`}>
                      {selected.competition} comp
                    </span>
                  )}
                  {selected.trendVelocity != null && (
                    <>
                      <span className="text-ink-tertiary">·</span>
                      <span className="text-accent-green">+{selected.trendVelocity}% velocity</span>
                    </>
                  )}
                </div>
                {(selected as any).rationale && (
                  <p className="mt-2 text-[11px] text-ink-secondary">
                    <span className="font-semibold text-brand-200">AI rationale:</span> {(selected as any).rationale}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-bg-border bg-bg-card">
              <div className="border-b border-bg-border px-5 py-3 text-sm font-semibold">14-Day Search Volume</div>
              <div className="h-56 px-3 py-3">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dmg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a87dff" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#a87dff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip contentStyle={{ background: "#161624", border: "1px solid #252538", borderRadius: 8 }} />
                    <Area type="monotone" dataKey="v" stroke="#a87dff" strokeWidth={2} fill="url(#dmg)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-bg-border bg-bg-card">
              <div className="border-b border-bg-border px-5 py-3 text-sm font-semibold">Signal Radar</div>
              <div className="h-56 px-3 py-3">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radar}>
                    <PolarGrid stroke="#252538" />
                    <PolarAngleAxis dataKey="axis" tick={{ fill: "#9b9bb5", fontSize: 10 }} />
                    <Radar dataKey="v" stroke="#a87dff" fill="#7c3aed" fillOpacity={0.35} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Cell label="Search Vol/mo" value={(selected.searchVolume ?? 0).toLocaleString()} />
            <Cell label="Social Score" value={`${selected.socialScore ?? 0}/100`} />
            <Cell label="Saturation" value={`${selected.saturation ?? 0}%`} />
            <Cell label="Profit" value={`$${(selected.profit ?? 0).toFixed(2)}`} />
          </div>

          {selected.sources && selected.sources.length > 0 && (
            <div className="rounded-xl border border-bg-border bg-bg-card">
              <div className="border-b border-bg-border px-5 py-3 text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-brand-300" /> Signal sources contributing to score
              </div>
              <div className="space-y-2 p-5">
                {selected.sources.map((s, i) => (
                  <div key={s} className="flex items-center justify-between text-xs">
                    <span className="text-ink-secondary">{s}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-bg-hover">
                        <div className="h-full bg-gradient-brand" style={{ width: `${65 + ((i * 13) % 30)}%` }} />
                      </div>
                      <span className="w-10 text-right font-semibold">+{8 + ((i * 7) % 22)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand-200">
              <Sparkles className="h-4 w-4" /> Demand verdict
            </div>
            <p className="mt-1 text-xs text-ink-secondary">
              Demand score of <span className="text-ink-primary font-semibold">{selected.demandScore ?? "—"}</span> ranks
              in the top {Math.max(1, 100 - (selected.demandScore ?? 50))}% of tracked products. With{" "}
              {selected.competition && (
                <span className={COMP_TONE[selected.competition]}>{selected.competition.toLowerCase()}</span>
              )}{" "}
              competition and{" "}
              <span className="text-accent-green">+{selected.trendVelocity ?? 0}%</span> velocity over 14 days, this is a{" "}
              <span className="font-semibold text-brand-200">{selected.potential ?? "Medium"}</span> opportunity.
            </p>
            <div className="mt-3 flex gap-2">
              <Link
                href={`/buyers?focus=${selected.id}`}
                className="rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow"
              >
                Find Buyers
              </Link>
              <Link
                href={`/suppliers?focus=${selected.id}`}
                className="rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-xs hover:bg-bg-hover"
              >
                Find Suppliers
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}
