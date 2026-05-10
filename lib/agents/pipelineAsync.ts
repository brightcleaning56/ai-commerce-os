/**
 * Chunked / asynchronous pipeline orchestration.
 *
 * Why this exists: when ANTHROPIC_API_KEY is set, a full 4-stage pipeline
 * (Trend Hunter → Buyer Discovery → Supplier Finder → Outreach) routinely
 * takes 30-60s end-to-end. Hosted serverless platforms have function timeouts
 * (Netlify free = 10s, Pro = 26s, Vercel hobby = 10s, Pro = 60s) that kill
 * the request mid-flight, returning an HTML error page that the client can't
 * parse as JSON.
 *
 * The fix is to break the pipeline into stages each of which fits well inside
 * the smallest hosted timeout (under 10s typical, well under 26s worst case),
 * and let the client orchestrate them. The page stays open the whole time
 * anyway, so client-driven orchestration is fine.
 *
 * Each stage is its own API endpoint:
 *   POST /api/agents/pipeline/start          → Trend Hunter (1 Claude call)
 *   POST /api/agents/pipeline/[id]/buyers    → Buyer Discovery + Supplier Finder for ONE product
 *   POST /api/agents/pipeline/[id]/outreach  → Outreach for ONE buyer
 *   POST /api/agents/pipeline/[id]/finalize  → Risk scan + persistence + share token
 *   GET  /api/agents/pipeline/[id]           → Live status for polling
 *
 * Progress is persisted to `StoredPipelineRun` after every stage so reloading
 * the page (or watching from another tab) shows live state.
 *
 * Cron + the legacy single-shot /api/agents/pipeline endpoint still use the
 * monolithic runPipeline() in pipeline.ts — they don't have a UI and can
 * tolerate long-running execution windows.
 */

import { runBuyerDiscovery } from "@/lib/agents/buyerDiscovery";
import { runOutreach } from "@/lib/agents/outreach";
import { runRisk } from "@/lib/agents/risk";
import { runSupplierFinder } from "@/lib/agents/supplierFinder";
import { runTrendHunter } from "@/lib/agents/trendHunter";
import { expiryFromTtlHours, genShareToken } from "@/lib/shareTokens";
import {
  store,
  type DiscoveredBuyer,
  type DiscoveredProduct,
  type DiscoveredSupplier,
  type OutreachDraft,
  type StoredPipelineRun,
} from "@/lib/store";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — keep an in-memory shape that mirrors StoredPipelineRun's progress
// but lets the run accumulate fresh data each stage.
// ─────────────────────────────────────────────────────────────────────────────

function emptyTotals() {
  return { products: 0, buyers: 0, suppliers: 0, drafts: 0, riskFlags: 0, totalCost: 0 };
}

async function loadOrThrow(pipelineId: string): Promise<StoredPipelineRun> {
  const run = await store.getPipelineRun(pipelineId);
  if (!run) throw new Error(`Pipeline ${pipelineId} not found`);
  return run;
}

async function appendStep(
  pipelineId: string,
  step: { agent: string; status: "success" | "error"; durationMs: number; detail: string },
  costDelta: number = 0,
): Promise<StoredPipelineRun> {
  const run = await loadOrThrow(pipelineId);
  run.steps.push(step);
  run.totals.totalCost = +(run.totals.totalCost + costDelta).toFixed(6);
  await store.savePipelineRun(run);
  return run;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1: Trend Hunter — creates the run record + populates products
// ─────────────────────────────────────────────────────────────────────────────

export type StartResult = {
  pipelineId: string;
  status: StoredPipelineRun["status"];
  products: Array<{ id: string; name: string; category: string }>;
};

export async function startPipelineRun(opts: {
  category?: string | null;
  maxProducts?: number;
  maxBuyersPerProduct?: number;
  findSuppliers?: boolean;
  triggeredBy?: "manual" | "cron";
  shareTtlHours?: number;
}): Promise<StartResult> {
  const category = typeof opts.category === "string" && opts.category.trim() ? opts.category : null;
  const maxProducts = Math.min(3, Math.max(1, opts.maxProducts ?? 1));
  const maxBuyersPerProduct = Math.min(3, Math.max(1, opts.maxBuyersPerProduct ?? 1));
  const findSuppliers = opts.findSuppliers !== false;
  const shareTtlHours = opts.shareTtlHours ?? 168;
  const triggeredBy = opts.triggeredBy ?? "manual";

  const pipelineId = `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = new Date().toISOString();
  const shareToken = genShareToken();
  const shareExpiresAt = expiryFromTtlHours(shareTtlHours);

  // Persist an empty "running" record up-front so polling has something to read.
  const initial: StoredPipelineRun = {
    id: pipelineId,
    shareToken,
    shareExpiresAt,
    triggeredBy,
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
    totals: emptyTotals(),
    productSummaries: [],
    buyerSummaries: [],
    supplierSummaries: [],
    draftSummaries: [],
    riskFlagSummaries: [],
    steps: [],
    status: "running",
    options: { maxBuyersPerProduct, findSuppliers },
  };
  await store.savePipelineRun(initial);

  // Now run Trend Hunter — typical: 1 Claude call, 4-8s.
  try {
    const run = await runTrendHunter(category);
    const allProducts = await store.getProducts();
    const products = allProducts.slice(0, run.productCount).slice(0, maxProducts);

    const updated: StoredPipelineRun = {
      ...initial,
      productSummaries: products.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        emoji: p.emoji,
        demandScore: p.demandScore,
        rationale: p.rationale,
      })),
      totals: { ...initial.totals, products: products.length, totalCost: run.estCostUsd ?? 0 },
      steps: [
        {
          agent: "trend-hunter",
          status: run.status,
          durationMs: run.durationMs,
          detail: `Discovered ${products.length} product${products.length === 1 ? "" : "s"}`,
        },
      ],
    };
    await store.savePipelineRun(updated);

    return {
      pipelineId,
      status: "running",
      products: products.map((p) => ({ id: p.id, name: p.name, category: p.category })),
    };
  } catch (e) {
    const failed: StoredPipelineRun = {
      ...initial,
      status: "failed",
      errorMessage: e instanceof Error ? e.message : "Trend Hunter failed",
      steps: [
        {
          agent: "trend-hunter",
          status: "error",
          durationMs: 0,
          detail: e instanceof Error ? e.message : "Trend Hunter failed",
        },
      ],
    };
    await store.savePipelineRun(failed);
    return { pipelineId, status: "failed", products: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 2: Buyer Discovery + Supplier Finder for ONE product
// (parallel — they don't depend on each other, so ~max of the two)
// ─────────────────────────────────────────────────────────────────────────────

export type BuyersStageResult = {
  pipelineId: string;
  productId: string;
  buyers: Array<{ id: string; company: string; decisionMaker: string }>;
  suppliers: Array<{ id: string; name: string; country: string }>;
};

export async function runBuyersStage(
  pipelineId: string,
  productId: string,
): Promise<BuyersStageResult> {
  const run = await loadOrThrow(pipelineId);
  const productSummary = run.productSummaries.find((p) => p.id === productId);
  if (!productSummary) throw new Error(`Product ${productId} not in pipeline ${pipelineId}`);

  const allProducts = await store.getProducts();
  const product = allProducts.find((p) => p.id === productId);
  if (!product) throw new Error(`Product ${productId} not in store`);

  const maxBuyersPerProduct = run.options?.maxBuyersPerProduct ?? 2;
  const findSuppliers = run.options?.findSuppliers !== false;

  const tasks: Promise<void>[] = [];
  const newBuyers: DiscoveredBuyer[] = [];
  const newSuppliers: DiscoveredSupplier[] = [];

  tasks.push(
    (async () => {
      try {
        const r = await runBuyerDiscovery({
          productName: product.name,
          productCategory: product.category,
          productNiche: product.niche,
        });
        const all = await store.getDiscoveredBuyers();
        const sliced = all.filter((b) => b.runId === r.id).slice(0, maxBuyersPerProduct);
        newBuyers.push(...sliced);
        await appendStep(
          pipelineId,
          {
            agent: "buyer-discovery",
            status: r.status,
            durationMs: r.durationMs,
            detail: `Matched ${sliced.length} buyer${sliced.length === 1 ? "" : "s"} for "${product.name}"`,
          },
          r.estCostUsd ?? 0,
        );
      } catch (e) {
        await appendStep(pipelineId, {
          agent: "buyer-discovery",
          status: "error",
          durationMs: 0,
          detail: e instanceof Error ? e.message : "Buyer Discovery failed",
        });
      }
    })(),
  );

  if (findSuppliers) {
    tasks.push(
      (async () => {
        try {
          const r = await runSupplierFinder({
            productName: product.name,
            productCategory: product.category,
            productNiche: product.niche,
          });
          const all = await store.getDiscoveredSuppliers();
          const sliced = all.filter((s) => s.runId === r.id);
          newSuppliers.push(...sliced);
          await appendStep(
            pipelineId,
            {
              agent: "supplier-finder",
              status: r.status,
              durationMs: r.durationMs,
              detail: `Surfaced ${sliced.length} supplier${sliced.length === 1 ? "" : "s"} for "${product.name}"`,
            },
            r.estCostUsd ?? 0,
          );
        } catch (e) {
          await appendStep(pipelineId, {
            agent: "supplier-finder",
            status: "error",
            durationMs: 0,
            detail: e instanceof Error ? e.message : "Supplier Finder failed",
          });
        }
      })(),
    );
  }

  await Promise.all(tasks);

  // Merge into the run record's summaries so polling sees them
  const updated = await loadOrThrow(pipelineId);
  updated.buyerSummaries.push(
    ...newBuyers.map((b) => ({
      id: b.id,
      company: b.company,
      type: b.type,
      location: b.location,
      fit: b.fit,
      intentScore: b.intentScore,
      forProduct: b.forProduct,
      rationale: b.rationale,
    })),
  );
  updated.supplierSummaries.push(
    ...newSuppliers.map((s) => ({
      id: s.id,
      name: s.name,
      country: s.country,
      type: s.type,
      unitPrice: s.unitPrice,
      moq: s.moq,
      leadTimeDays: s.leadTimeDays,
      riskScore: s.riskScore,
      forProduct: s.forProduct,
      rationale: s.rationale,
    })),
  );
  updated.totals.buyers = updated.buyerSummaries.length;
  updated.totals.suppliers = updated.supplierSummaries.length;
  await store.savePipelineRun(updated);

  return {
    pipelineId,
    productId,
    buyers: newBuyers.map((b) => ({ id: b.id, company: b.company, decisionMaker: b.decisionMaker })),
    suppliers: newSuppliers.map((s) => ({ id: s.id, name: s.name, country: s.country })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 3: Outreach for ONE buyer (1 Claude call typical)
// ─────────────────────────────────────────────────────────────────────────────

export async function runOutreachStage(
  pipelineId: string,
  buyerId: string,
): Promise<{ draftId: string | null }> {
  const run = await loadOrThrow(pipelineId);
  const buyerSummary = run.buyerSummaries.find((b) => b.id === buyerId);
  if (!buyerSummary) throw new Error(`Buyer ${buyerId} not in pipeline ${pipelineId}`);

  const allBuyers = await store.getDiscoveredBuyers();
  const buyer = allBuyers.find((b) => b.id === buyerId);
  if (!buyer) throw new Error(`Buyer ${buyerId} not in store`);

  const allProducts = await store.getProducts();
  const product = allProducts.find((p) => p.name === buyer.forProduct) ?? allProducts[0];

  let draft: OutreachDraft | null = null;
  try {
    const out = await runOutreach({
      buyerId: buyer.id,
      buyerCompany: buyer.company,
      buyerName: buyer.decisionMaker,
      buyerTitle: buyer.decisionMakerTitle,
      buyerIndustry: buyer.industry,
      buyerType: buyer.type,
      buyerLocation: buyer.location,
      buyerRationale: buyer.rationale,
      productName: buyer.forProduct,
      productCategory: product?.category ?? buyer.industry,
      productNiche: product?.niche ?? buyer.industry,
      productRationale: product?.rationale,
    });
    draft = out.draft;
    await appendStep(
      pipelineId,
      {
        agent: "outreach",
        status: out.run.status,
        durationMs: out.run.durationMs,
        detail: `Drafted outreach for ${buyer.decisionMaker} at ${buyer.company}`,
      },
      out.run.estCostUsd ?? 0,
    );

    // Append draft summary to pipeline record
    const updated = await loadOrThrow(pipelineId);
    updated.draftSummaries.push({
      id: draft.id,
      buyerCompany: draft.buyerCompany,
      buyerName: draft.buyerName,
      productName: draft.productName,
      emailSubject: draft.email.subject,
      emailPreview: draft.email.body.slice(0, 240),
    });
    updated.totals.drafts = updated.draftSummaries.length;
    await store.savePipelineRun(updated);

    // Wire draft → pipeline so /api/drafts/send can find this run later
    await store.attachPipelineToDraft(draft.id, pipelineId);
  } catch (e) {
    await appendStep(pipelineId, {
      agent: "outreach",
      status: "error",
      durationMs: 0,
      detail: e instanceof Error ? e.message : "Outreach failed",
    });
  }

  return { draftId: draft?.id ?? null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 4: Finalize — Risk scan + mark completed + compute final timings
// ─────────────────────────────────────────────────────────────────────────────

export async function finalizePipelineRun(pipelineId: string): Promise<StoredPipelineRun> {
  const run = await loadOrThrow(pipelineId);

  // Risk scan — last gate before marking completed
  try {
    const r = await runRisk();
    const allFlags = await store.getRiskFlags();
    const newFlags = allFlags.filter((f) => f.runId === r.id);
    run.riskFlagSummaries = newFlags.map((f) => ({
      severity: f.severity,
      category: f.category,
      title: f.title,
      detail: f.detail,
    }));
    run.totals.riskFlags = newFlags.length;
    run.steps.push({
      agent: "risk",
      status: r.status,
      durationMs: r.durationMs,
      detail:
        newFlags.length === 0
          ? "All clear — no risk flags raised"
          : `Surfaced ${newFlags.length} risk flag${newFlags.length === 1 ? "" : "s"}`,
    });
    run.totals.totalCost = +(run.totals.totalCost + (r.estCostUsd ?? 0)).toFixed(6);
  } catch (e) {
    run.steps.push({
      agent: "risk",
      status: "error",
      durationMs: 0,
      detail: e instanceof Error ? e.message : "Risk Agent failed",
    });
  }

  const finishedAt = new Date().toISOString();
  run.finishedAt = finishedAt;
  run.durationMs = new Date(finishedAt).getTime() - new Date(run.startedAt).getTime();
  run.status = "completed";

  await store.savePipelineRun(run);
  return run;
}
