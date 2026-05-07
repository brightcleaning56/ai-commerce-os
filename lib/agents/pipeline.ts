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
  type RiskFlag,
  type StoredPipelineRun,
} from "@/lib/store";

export type PipelineStep = {
  agent: "trend-hunter" | "buyer-discovery" | "supplier-finder" | "outreach" | "risk";
  status: "success" | "error";
  durationMs: number;
  detail: string;
  forName?: string;
  cost?: number;
  usedFallback: boolean;
};

export type PipelineResult = {
  pipelineId: string;
  shareToken: string;
  shareExpiresAt: string;
  triggeredBy: "manual" | "cron";
  startedAt: string;
  finishedAt: string;
  steps: PipelineStep[];
  products: DiscoveredProduct[];
  buyers: DiscoveredBuyer[];
  suppliers: DiscoveredSupplier[];
  drafts: OutreachDraft[];
  riskFlags: RiskFlag[];
  totals: {
    products: number;
    buyers: number;
    suppliers: number;
    drafts: number;
    riskFlags: number;
    totalCost: number;
    totalMs: number;
  };
};

export type PipelineOptions = {
  category?: string | null;
  maxProducts?: number;
  maxBuyersPerProduct?: number;
  findSuppliers?: boolean;
  triggeredBy?: "manual" | "cron";
  /**
   * How long the share link should remain valid, in hours.
   * Default: 168 (7 days). Pass 0 or a negative number for "never expires".
   */
  shareTtlHours?: number;
};

export async function runPipeline(options: PipelineOptions = {}): Promise<PipelineResult> {
  const category = typeof options.category === "string" && options.category.trim() ? options.category : null;
  const maxProducts = Math.min(3, Math.max(1, options.maxProducts ?? 1));
  const maxBuyersPerProduct = Math.min(3, Math.max(1, options.maxBuyersPerProduct ?? 1));
  const findSuppliers = options.findSuppliers !== false;
  const triggeredBy = options.triggeredBy ?? "manual";
  const shareTtlHours = options.shareTtlHours ?? 168; // 7 days default

  const startedAt = new Date();
  const steps: PipelineStep[] = [];
  const products: DiscoveredProduct[] = [];
  const buyers: DiscoveredBuyer[] = [];
  const suppliers: DiscoveredSupplier[] = [];
  const drafts: OutreachDraft[] = [];
  const riskFlags: RiskFlag[] = [];

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
    const allProducts = await store.getProducts();
    products.push(...allProducts.slice(0, run.productCount).slice(0, maxProducts));
  } catch (e) {
    steps.push({
      agent: "trend-hunter",
      status: "error",
      durationMs: 0,
      detail: e instanceof Error ? e.message : "Trend Hunter failed",
      usedFallback: false,
    });
    return await finalize({
      pipelineId: `pl_${Date.now().toString(36)}`,
      triggeredBy,
      startedAt: startedAt.toISOString(),
      steps,
      products,
      buyers,
      suppliers,
      drafts,
      riskFlags,
    }, shareTtlHours);
  }

  // Step 2: Buyer Discovery + Supplier Finder per product (parallel)

  for (const p of products) {
    const tasks: Promise<unknown>[] = [];

    tasks.push(
      (async () => {
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
          const allBuyers = await store.getDiscoveredBuyers();
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
      })()
    );

    if (findSuppliers) {
      tasks.push(
        (async () => {
          try {
            const run = await runSupplierFinder({
              productName: p.name,
              productCategory: p.category,
              productNiche: p.niche,
            });
            steps.push({
              agent: "supplier-finder",
              status: run.status,
              durationMs: run.durationMs,
              detail: `Surfaced ${run.supplierCount} suppliers for "${p.name}"`,
              forName: p.name,
              cost: run.estCostUsd,
              usedFallback: run.usedFallback,
            });
            const allSuppliers = await store.getDiscoveredSuppliers();
            const newSuppliers = allSuppliers.filter((s) => s.runId === run.id);
            suppliers.push(...newSuppliers);
          } catch (e) {
            steps.push({
              agent: "supplier-finder",
              status: "error",
              durationMs: 0,
              detail: e instanceof Error ? e.message : "Supplier Finder failed",
              forName: p.name,
              usedFallback: false,
            });
          }
        })()
      );
    }

    await Promise.all(tasks);
  }

  // Step 3: Risk Agent — evaluates the freshly surfaced suppliers + buyers
  try {
    const run = await runRisk();
    const allFlags = await store.getRiskFlags();
    const newFlags = allFlags.filter((f) => f.runId === run.id);
    riskFlags.push(...newFlags);
    steps.push({
      agent: "risk",
      status: run.status,
      durationMs: run.durationMs,
      detail: newFlags.length === 0
        ? "All clear — no risk flags raised"
        : `Surfaced ${newFlags.length} risk flag${newFlags.length === 1 ? "" : "s"}`,
      cost: run.estCostUsd,
      usedFallback: run.usedFallback,
    });
  } catch (e) {
    steps.push({
      agent: "risk",
      status: "error",
      durationMs: 0,
      detail: e instanceof Error ? e.message : "Risk Agent failed",
      usedFallback: false,
    });
  }

  // Step 4: Outreach per buyer
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

  return await finalize({
    pipelineId: `pl_${Date.now().toString(36)}`,
    triggeredBy,
    startedAt: startedAt.toISOString(),
    steps,
    products,
    buyers,
    suppliers,
    drafts,
    riskFlags,
  }, shareTtlHours);
}

async function finalize(
  p: Omit<PipelineResult, "finishedAt" | "totals" | "shareToken" | "shareExpiresAt">,
  shareTtlHours: number,
): Promise<PipelineResult> {
  const finishedAt = new Date().toISOString();
  const shareToken = genShareToken();
  const shareExpiresAt = expiryFromTtlHours(shareTtlHours);
  const result: PipelineResult = {
    ...p,
    shareToken,
    shareExpiresAt,
    finishedAt,
    totals: {
      products: p.products.length,
      buyers: p.buyers.length,
      suppliers: p.suppliers.length,
      drafts: p.drafts.length,
      riskFlags: p.riskFlags.length,
      totalCost: p.steps.reduce((s, x) => s + (x.cost ?? 0), 0),
      totalMs: p.steps.reduce((s, x) => s + x.durationMs, 0),
    },
  };

  // Persist a sharable snapshot — only the bits safe to show to anyone with the link.
  // Strip emails / direct identifiers; keep agent rationale + structural fields.
  const snapshot: StoredPipelineRun = {
    id: result.pipelineId,
    shareToken,
    shareExpiresAt,
    triggeredBy: result.triggeredBy,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    durationMs: result.totals.totalMs,
    totals: {
      products: result.totals.products,
      buyers: result.totals.buyers,
      suppliers: result.totals.suppliers,
      drafts: result.totals.drafts,
      riskFlags: result.totals.riskFlags,
      totalCost: result.totals.totalCost,
    },
    productSummaries: result.products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      emoji: p.emoji,
      demandScore: p.demandScore,
      rationale: p.rationale,
    })),
    buyerSummaries: result.buyers.map((b) => ({
      id: b.id,
      company: b.company,
      type: b.type,
      location: b.location,
      fit: b.fit,
      intentScore: b.intentScore,
      forProduct: b.forProduct,
      rationale: b.rationale,
    })),
    supplierSummaries: result.suppliers.map((s) => ({
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
    draftSummaries: result.drafts.map((d) => ({
      id: d.id,
      buyerCompany: d.buyerCompany,
      buyerName: d.buyerName,
      productName: d.productName,
      emailSubject: d.email.subject,
      emailPreview: d.email.body.slice(0, 240),
    })),
    riskFlagSummaries: result.riskFlags.map((f) => ({
      severity: f.severity,
      category: f.category,
      title: f.title,
      detail: f.detail,
    })),
    steps: result.steps.map((s) => ({
      agent: s.agent,
      status: s.status,
      durationMs: s.durationMs,
      detail: s.detail,
    })),
  };
  await store.savePipelineRun(snapshot);

  // Backfill the draft <-> pipeline relationship so /api/drafts/send can find
  // the parent run and mint a recipient-scoped share link at send time.
  for (const d of result.drafts) {
    await store.attachPipelineToDraft(d.id, result.pipelineId);
  }

  return result;
}
