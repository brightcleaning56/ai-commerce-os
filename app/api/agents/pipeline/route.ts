import { NextRequest, NextResponse } from "next/server";
import { runBuyerDiscovery } from "@/lib/agents/buyerDiscovery";
import { runOutreach } from "@/lib/agents/outreach";
import { runTrendHunter } from "@/lib/agents/trendHunter";
import { store, type DiscoveredBuyer, type DiscoveredProduct, type OutreachDraft } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const recent: number[] = [];

type StepLog = {
  agent: "trend-hunter" | "buyer-discovery" | "outreach";
  status: "success" | "error";
  durationMs: number;
  detail: string;
  forName?: string;
  cost?: number;
  usedFallback: boolean;
};

export async function POST(req: NextRequest) {
  const now = Date.now();
  while (recent.length && now - recent[0] > RATE_WINDOW_MS) recent.shift();
  if (recent.length >= RATE_LIMIT) {
    return NextResponse.json(
      { error: "Pipeline rate limit (5/min) exceeded — try again in a minute." },
      { status: 429 }
    );
  }
  recent.push(now);

  let body: { category?: string; maxProducts?: number; maxBuyersPerProduct?: number } = {};
  try {
    body = await req.json();
  } catch {
    // ok, defaults
  }
  const category = typeof body.category === "string" && body.category.trim() ? body.category : null;
  const maxProducts = Math.min(3, Math.max(1, body.maxProducts ?? 1));
  const maxBuyersPerProduct = Math.min(3, Math.max(1, body.maxBuyersPerProduct ?? 1));

  const startedAt = new Date();
  const steps: StepLog[] = [];
  const products: DiscoveredProduct[] = [];
  const buyers: DiscoveredBuyer[] = [];
  const drafts: OutreachDraft[] = [];

  // Step 1: Trend Hunter
  try {
    const run = await runTrendHunter(category);
    steps.push({
      agent: "trend-hunter",
      status: run.status,
      durationMs: run.durationMs,
      detail: `Discovered ${run.productCount} product${run.productCount === 1 ? "" : "s"} · ${run.signalsUsed ?? 0} live signals`,
      cost: run.estCostUsd,
      usedFallback: run.usedFallback,
    });
    // Pull the freshly written products (most recent first)
    const allProducts = store.getProducts();
    products.push(...allProducts.slice(0, run.productCount).slice(0, maxProducts));
  } catch (e) {
    steps.push({
      agent: "trend-hunter",
      status: "error",
      durationMs: 0,
      detail: e instanceof Error ? e.message : "Trend Hunter failed",
      usedFallback: false,
    });
    return NextResponse.json({
      pipelineId: `pl_${Date.now().toString(36)}`,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      steps,
      products,
      buyers,
      drafts,
    });
  }

  // Step 2: Buyer Discovery for each top product
  for (const p of products) {
    try {
      const run = await runBuyerDiscovery({
        productName: p.name,
        productCategory: p.category,
        productNiche: p.niche,
      });
      steps.push({
        agent: "buyer-discovery",
        status: run.status,
        durationMs: run.durationMs,
        detail: `Matched ${run.buyerCount} buyers for "${p.name}"`,
        forName: p.name,
        cost: run.estCostUsd,
        usedFallback: run.usedFallback,
      });
      const allBuyers = store.getDiscoveredBuyers();
      const newBuyers = allBuyers.filter((b) => b.runId === run.id).slice(0, maxBuyersPerProduct);
      buyers.push(...newBuyers);
    } catch (e) {
      steps.push({
        agent: "buyer-discovery",
        status: "error",
        durationMs: 0,
        detail: e instanceof Error ? e.message : "Buyer Discovery failed",
        forName: p.name,
        usedFallback: false,
      });
    }
  }

  // Step 3: Outreach for each top buyer
  for (const b of buyers) {
    try {
      const product = products.find((p) => p.name === b.forProduct) || products[0];
      const { run, draft } = await runOutreach({
        buyerId: b.id,
        buyerCompany: b.company,
        buyerName: b.decisionMaker,
        buyerTitle: b.decisionMakerTitle,
        buyerIndustry: b.industry,
        buyerType: b.type,
        buyerLocation: b.location,
        buyerRationale: b.rationale,
        productName: b.forProduct,
        productCategory: product?.category ?? b.industry,
        productNiche: product?.niche ?? b.industry,
        productRationale: product?.rationale,
      });
      steps.push({
        agent: "outreach",
        status: run.status,
        durationMs: run.durationMs,
        detail: `Drafted email + LinkedIn + SMS for ${b.decisionMaker} at ${b.company}`,
        forName: b.company,
        cost: run.estCostUsd,
        usedFallback: run.usedFallback,
      });
      drafts.push(draft);
    } catch (e) {
      steps.push({
        agent: "outreach",
        status: "error",
        durationMs: 0,
        detail: e instanceof Error ? e.message : "Outreach failed",
        forName: b.company,
        usedFallback: false,
      });
    }
  }

  return NextResponse.json({
    pipelineId: `pl_${Date.now().toString(36)}`,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    steps,
    products,
    buyers,
    drafts,
    totals: {
      products: products.length,
      buyers: buyers.length,
      drafts: drafts.length,
      totalCost: steps.reduce((s, x) => s + (x.cost ?? 0), 0),
      totalMs: steps.reduce((s, x) => s + x.durationMs, 0),
    },
  });
}
