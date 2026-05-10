"use client";
import clsx from "clsx";
import { Bookmark, Eye, Flame, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import Sparkline from "@/components/ui/Sparkline";

type Product = {
  id: string;
  name: string;
  category: string;
  niche?: string;
  emoji?: string;
  demandScore: number;
  estProfitUsd?: number;
  competition?: "Low" | "Medium" | "High";
  potential?: "Very High" | "High" | "Medium";
  rationale?: string;
};

const compTone: Record<string, string> = {
  Low: "text-accent-green bg-accent-green/10",
  Medium: "text-accent-amber bg-accent-amber/10",
  High: "text-accent-red bg-accent-red/10",
};
const potTone: Record<string, string> = {
  "Very High": "text-brand-200 bg-brand-500/15",
  High: "text-accent-blue bg-accent-blue/15",
  Medium: "text-ink-secondary bg-bg-hover",
};

const trend = (i: number) =>
  Array.from({ length: 14 }, (_, k) => 50 + Math.sin(k / 2 + i) * 8 + k * 1.2);

function inferCompetition(score: number): "Low" | "Medium" | "High" {
  if (score >= 80) return "Low";
  if (score >= 60) return "Medium";
  return "High";
}

function inferPotential(score: number): "Very High" | "High" | "Medium" {
  if (score >= 88) return "Very High";
  if (score >= 75) return "High";
  return "Medium";
}

export default function TopProductsTable() {
  const [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/products", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.products) return;
        // Top 5 by demandScore
        const sorted = [...d.products].sort((a: Product, b: Product) => (b.demandScore ?? 0) - (a.demandScore ?? 0));
        setProducts(sorted.slice(0, 5));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader
        title="Top Product Opportunities"
        icon={<Flame className="h-4 w-4 text-accent-amber" />}
        right={
          <Link href="/products" className="text-xs text-brand-300 hover:text-brand-200">
            View All
          </Link>
        }
      />
      {products && products.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/15">
            <Sparkles className="h-5 w-5 text-brand-300" />
          </div>
          <div className="text-sm font-medium">No products discovered yet</div>
          <div className="text-[11px] text-ink-tertiary max-w-sm">
            Run a pipeline or open Product Discovery to surface trending products. Top 5 by demand score will appear here.
          </div>
          <Link
            href="/pipeline"
            className="mt-1 flex items-center gap-1.5 rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow"
          >
            <Sparkles className="h-3 w-3" /> Run pipeline
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">Product</th>
                <th className="px-3 py-2.5 text-left font-medium">Demand</th>
                <th className="px-3 py-2.5 text-left font-medium">Trend</th>
                <th className="px-3 py-2.5 text-left font-medium">Est. Profit</th>
                <th className="px-3 py-2.5 text-left font-medium">Competition</th>
                <th className="px-3 py-2.5 text-left font-medium">Potential</th>
                <th className="px-5 py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {(products ?? []).map((p, i) => {
                const comp = p.competition ?? inferCompetition(p.demandScore);
                const pot = p.potential ?? inferPotential(p.demandScore);
                return (
                  <tr key={p.id} className="border-t border-bg-border hover:bg-bg-hover/30">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-md bg-gradient-card text-base">
                          {p.emoji ?? "📦"}
                        </div>
                        <div>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-[11px] text-ink-tertiary">{p.category}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-semibold text-brand-200">{p.demandScore}</td>
                    <td className="px-3 py-3 w-32">
                      <Sparkline data={trend(i)} color="#22c55e" />
                    </td>
                    <td className="px-3 py-3 font-medium">
                      {p.estProfitUsd != null ? `$${p.estProfitUsd.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span className={clsx("rounded-md px-2 py-0.5 text-[11px] font-medium", compTone[comp])}>
                        {comp}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={clsx("rounded-md px-2 py-0.5 text-[11px] font-medium", potTone[pot])}>
                        {pot}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Link
                          href={`/products?focus=${p.id}`}
                          className="grid h-7 w-7 place-items-center rounded-md border border-bg-border text-ink-secondary hover:text-ink-primary"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                        <button className="grid h-7 w-7 place-items-center rounded-md border border-bg-border text-ink-secondary hover:text-ink-primary">
                          <Bookmark className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {products === null &&
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={`skel-${i}`} className="border-t border-bg-border">
                    <td className="px-5 py-3" colSpan={7}>
                      <div className="h-9 animate-pulse rounded-md bg-bg-hover/40" />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-bg-border px-5 py-3 text-center">
        <Link href="/products" className="text-xs text-brand-300 hover:text-brand-200">
          Explore All Opportunities →
        </Link>
      </div>
    </Card>
  );
}
