"use client";
import {
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Send,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import ProductHistory from "@/components/products/ProductHistory";
import Sparkline from "@/components/ui/Sparkline";
import type { Product } from "@/lib/products";
import { useLocalSet } from "@/lib/useLocalSet";

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-bg-border bg-bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {hint && <div className="text-[11px] text-ink-tertiary">{hint}</div>}
    </div>
  );
}

function Bar({ value, max = 100, color = "#a87dff" }: { value: number; max?: number; color?: string }) {
  const w = Math.min(100, (value / max) * 100);
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-bg-hover">
      <div className="h-full" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

export default function ProductDetail({ p }: { p: Product }) {
  const [findingBuyers, setFindingBuyers] = useState(false);
  const [buyerResult, setBuyerResult] = useState<{ count: number; usedFallback: boolean; cost?: number } | null>(null);
  const [buyerError, setBuyerError] = useState<string | null>(null);
  const [findingSuppliers, setFindingSuppliers] = useState(false);
  const [supplierResult, setSupplierResult] = useState<{ count: number; usedFallback: boolean; cost?: number } | null>(null);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const watchlist = useLocalSet("aicos:watchlist:v1");
  const isSaved = watchlist.has(p.id);
  const [showSources, setShowSources] = useState(false);

  async function findSuppliers() {
    setFindingSuppliers(true);
    setSupplierError(null);
    try {
      const res = await fetch("/api/agents/supplier-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: p.name,
          productCategory: p.category,
          productNiche: p.niche,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Supplier Finder failed");
      setSupplierResult({
        count: data.run.supplierCount ?? 0,
        usedFallback: data.run.usedFallback,
        cost: data.run.estCostUsd,
      });
    } catch (e) {
      setSupplierError(e instanceof Error ? e.message : "Failed");
    } finally {
      setFindingSuppliers(false);
    }
  }

  async function findBuyers() {
    setFindingBuyers(true);
    setBuyerError(null);
    try {
      const res = await fetch("/api/agents/buyer-discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: p.name,
          productCategory: p.category,
          productNiche: p.niche,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Buyer Discovery failed");
      setBuyerResult({
        count: data.run.buyerCount ?? 0,
        usedFallback: data.run.usedFallback,
        cost: data.run.estCostUsd,
      });
    } catch (e) {
      setBuyerError(e instanceof Error ? e.message : "Failed");
    } finally {
      setFindingBuyers(false);
    }
  }

  return (
    <div className="space-y-5 p-5">
      <div className="flex items-start gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-xl bg-gradient-card text-3xl">
          {p.emoji}
        </div>
        <div className="flex-1">
          <div className="text-xl font-bold">{p.name}</div>
          <div className="text-xs text-ink-tertiary">
            {p.category} · {p.niche}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-md bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-200">
              Demand {p.demandScore}
            </span>
            <span className="rounded-md bg-accent-green/10 px-2 py-0.5 text-[11px] font-semibold text-accent-green">
              {p.potential}
            </span>
            <span className="rounded-md bg-bg-hover px-2 py-0.5 text-[11px] text-ink-secondary">
              Comp: {p.competition}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Est. Profit" value={`$${p.profit.toFixed(2)}`} />
        <Stat label="Cost" value={`$${p.cost.toFixed(2)}`} hint={`Retail $${p.retail.toFixed(2)}`} />
        <Stat label="MOQ" value={p.moq} hint={`${p.shippingDays}d shipping`} />
      </div>

      {/* Relationship history — drafts + transactions + buyer/supplier matches */}
      <ProductHistory productName={p.name} />

      <div>
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-semibold">14-Day Trend</span>
          <span className="text-accent-green">+{p.trendVelocity}%</span>
        </div>
        <div className="rounded-lg border border-bg-border bg-bg-card p-3">
          <div className="h-20">
            <Sparkline data={p.trend14d} color="#a87dff" />
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold">Demand Breakdown</div>
        <div className="space-y-2.5 rounded-lg border border-bg-border bg-bg-card p-4">
          {[
            { l: "Search Volume", v: Math.min(100, Math.round(p.searchVolume / 800)), suffix: `${p.searchVolume.toLocaleString()}/mo` },
            { l: "Social Score", v: p.socialScore, suffix: `${p.socialScore}/100` },
            { l: "Trend Velocity", v: Math.min(100, p.trendVelocity / 3), suffix: `+${p.trendVelocity}%` },
            { l: "Saturation", v: p.saturation, suffix: `${p.saturation}%`, color: "#f59e0b" },
          ].map((row) => (
            <div key={row.l}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-ink-secondary">{row.l}</span>
                <span className="text-ink-tertiary">{row.suffix}</span>
              </div>
              <Bar value={row.v} color={row.color} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold">Trending Sources</div>
        <div className="flex flex-wrap gap-1.5">
          {p.sources.map((s) => (
            <span
              key={s}
              className="rounded-md border border-bg-border bg-bg-hover/40 px-2 py-1 text-[11px] text-ink-secondary"
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold">Hashtags</div>
        <div className="flex flex-wrap gap-1.5">
          {p.hashtags.map((h) => (
            <span
              key={h}
              className="rounded-md bg-brand-500/10 px-2 py-1 text-[11px] text-brand-200"
            >
              {h}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-200">
          <Sparkles className="h-4 w-4" />
          AI Verdict
        </div>
        <p className="mt-1 text-xs text-ink-secondary">
          Strong demand signal across {p.sources.length} sources with {p.competition.toLowerCase()} competition. Margin holds up at this price point.
          Recommend pushing this into the Buyer Discovery agent for outreach to{" "}
          <span className="text-ink-primary">{p.category}</span> retailers.
        </p>
      </div>

      {(buyerResult || buyerError) && (
        <div
          className={`rounded-lg border p-3 text-xs ${
            buyerError
              ? "border-accent-red/30 bg-accent-red/5 text-accent-red"
              : "border-accent-green/30 bg-accent-green/5"
          }`}
        >
          {buyerError ? (
            <>Failed: {buyerError}</>
          ) : buyerResult ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-accent-green" />
              <span className="text-ink-secondary">
                Buyer Discovery returned <span className="font-semibold text-accent-green">{buyerResult.count}</span> matched buyers.
                {buyerResult.usedFallback ? (
                  <> Using fallback (no API key).</>
                ) : (
                  <> Live · cost ${buyerResult.cost?.toFixed(5) ?? "—"}</>
                )}
                {" "}<a href="/buyers" className="font-semibold text-brand-300 hover:text-brand-200">View on Buyers page →</a>
              </span>
            </div>
          ) : null}
        </div>
      )}

      {(supplierResult || supplierError) && (
        <div
          className={`rounded-lg border p-3 text-xs ${
            supplierError
              ? "border-accent-red/30 bg-accent-red/5 text-accent-red"
              : "border-accent-green/30 bg-accent-green/5"
          }`}
        >
          {supplierError ? (
            <>Failed: {supplierError}</>
          ) : supplierResult ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-accent-green" />
              <span className="text-ink-secondary">
                Supplier Finder returned <span className="font-semibold text-accent-green">{supplierResult.count}</span> matched suppliers.
                {supplierResult.usedFallback ? (
                  <> Using fallback (no API key).</>
                ) : (
                  <> Live · cost ${supplierResult.cost?.toFixed(5) ?? "—"}</>
                )}
                {" "}<a href="/suppliers" className="font-semibold text-brand-300 hover:text-brand-200">View on Suppliers page →</a>
              </span>
            </div>
          ) : null}
        </div>
      )}

      {showSources && (
        <div className="rounded-lg border border-bg-border bg-bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold">Source platforms</div>
            <button
              onClick={() => setShowSources(false)}
              className="text-[11px] text-ink-tertiary hover:text-ink-primary"
            >
              Close
            </button>
          </div>
          <ul className="mt-2 space-y-1.5">
            {p.sources.map((s) => (
              <li
                key={s}
                className="flex items-center justify-between rounded-md border border-bg-border bg-bg-hover/40 px-3 py-2 text-xs"
              >
                <span className="text-ink-secondary">{s}</span>
                <span className="text-[10px] text-ink-tertiary">via Trend Hunter</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 text-[11px] text-ink-tertiary">
            See raw scraped posts on the{" "}
            <Link href="/signals" className="text-brand-300 hover:text-brand-200">
              Live Signals
            </Link>{" "}
            page.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 pb-2">
        <button
          onClick={findBuyers}
          disabled={findingBuyers}
          className="flex items-center justify-center gap-2 rounded-lg bg-gradient-brand py-2.5 text-sm font-semibold shadow-glow disabled:opacity-60"
        >
          {findingBuyers ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Finding buyers…</>
          ) : (
            <><Send className="h-4 w-4" /> Send to Buyer Agent</>
          )}
        </button>
        <button
          onClick={findSuppliers}
          disabled={findingSuppliers}
          className="flex items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card py-2.5 text-sm hover:bg-bg-hover disabled:opacity-60"
        >
          {findingSuppliers ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Finding suppliers…</>
          ) : (
            <><ShoppingBag className="h-4 w-4" /> Find Suppliers</>
          )}
        </button>
        <button
          onClick={() => watchlist.toggle(p.id)}
          className={`flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm ${
            isSaved
              ? "border-brand-500/50 bg-brand-500/15 text-brand-200"
              : "border-bg-border bg-bg-card hover:bg-bg-hover"
          }`}
        >
          {isSaved ? (
            <><BookmarkCheck className="h-4 w-4" /> Saved to Watchlist</>
          ) : (
            <><Bookmark className="h-4 w-4" /> Save to Watchlist</>
          )}
        </button>
        <button
          onClick={() => setShowSources((v) => !v)}
          className="flex items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card py-2.5 text-sm hover:bg-bg-hover"
        >
          <ExternalLink className="h-4 w-4" /> {showSources ? "Hide" : "View"} Sources
        </button>
      </div>
    </div>
  );
}
