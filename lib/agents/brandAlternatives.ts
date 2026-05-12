import { checkSpendBudget, estimateCost, getAnthropicClient, MODEL_CHEAP, recordSpend } from "@/lib/anthropic";
import {
  store,
  type AgentRun,
  type BrandAlternative,
  type BrandAlternativeEntry,
  type SupplyEdge,
} from "@/lib/store";

/**
 * Brand Alternatives Agent — given a brand name from the SupplyEdge
 * graph, finds 3-5 plausible competing wholesalers / suppliers in
 * the same category, each with a one-line rationale ("why this beats
 * the original").
 *
 * Inputs:
 *   - brand name (e.g. "GAF")
 *   - context: a sample of the businesses currently sourcing from this
 *     brand. The model uses their industries + locations to infer the
 *     category and suggest regionally-appropriate alternatives.
 *
 * Output: persisted via store.upsertBrandAlternative. The outreach
 * agent then references these in personalized "switch from X to Y"
 * pitches.
 *
 * Cost: ~$0.003 per call (Haiku). One call per brand, results cached
 * in the store — operator can regenerate when needed (market shifts,
 * better data available).
 */

const ALT_TOOL = {
  name: "report_brand_alternatives",
  description:
    "Find 3-5 plausible competing wholesalers/suppliers to the given brand in the same product category. Each must include a 1-line rationale and a strength tag.",
  input_schema: {
    type: "object" as const,
    properties: {
      category: {
        type: "string",
        description:
          "The product/service category this brand serves. Examples: 'Asphalt roofing shingles', 'Commercial pet food wholesale', 'HVAC equipment distribution'. Be specific — don't return 'Construction supplies'.",
      },
      alternatives: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description:
                "Plausible specific wholesaler/supplier name that competes with the original in this category. Mix nationwide chains with regional/specialty players.",
            },
            rationale: {
              type: "string",
              description:
                "One sentence. Why would a buyer switch from the original to this alternative? Cite a specific advantage (price, regional fit, MOQ, specialty inventory, etc). No buzzwords. <= 140 chars.",
            },
            strength: {
              type: "string",
              enum: ["regional", "national", "moq", "price", "service", "speed", "specialty", "other"],
              description:
                "The primary advantage axis. Helps operator match alternatives to business types (TX retailer → regional alt; small contractor → moq alt).",
            },
            score: {
              type: "integer",
              minimum: 50,
              maximum: 100,
              description: "Your confidence (50-100) that this alternative actually competes with the original in this category.",
            },
          },
          required: ["name", "rationale", "strength", "score"],
        },
      },
    },
    required: ["category", "alternatives"],
  },
};

type AltToolPayload = {
  category: string;
  alternatives: BrandAlternativeEntry[];
};

function buildPrompt(
  brand: string,
  context: {
    sampleIndustries: string[];
    sampleStates: string[];
    sampleBusinessNames: string[];
    explicitCategory?: string;
  },
): string {
  const industries = context.sampleIndustries.length
    ? context.sampleIndustries.join(", ")
    : "(unknown)";
  const states = context.sampleStates.length ? context.sampleStates.join(", ") : "(unknown)";
  const businessSample = context.sampleBusinessNames.length
    ? context.sampleBusinessNames.slice(0, 8).join(", ")
    : "(none yet)";

  const categoryHint = context.explicitCategory
    ? `Operator-provided category: ${context.explicitCategory}\n`
    : "";

  return `You are the Brand Alternatives Agent for AVYN Commerce. Your job: find 3-5 wholesaler/supplier brands that compete with the named brand in the same product category, so AVYN's operator can pitch the alternatives to businesses currently using the original.

## Brand
${brand}

## Context — who currently sources from this brand
- Industries represented: ${industries}
- States represented: ${states}
- Sample businesses: ${businessSample}
${categoryHint}
## Rules
1. Infer the most specific category this brand serves from the context. "Asphalt roofing shingles" > "Construction supplies". Return that as the \`category\` field.
2. Return 3-5 alternatives. Mix a couple of nationwide chains with 1-2 regional or specialty players — different buyer types benefit from different strengths.
3. For each alternative, give ONE concrete reason a buyer would switch (volume pricing, lower MOQ, regional inventory, faster turnaround, specialty SKUs, etc). Do NOT use buzzwords ("synergy", "best-in-class"). Keep rationale under 140 chars.
4. The \`strength\` tag categorizes the advantage so the operator can match alternatives to business types.
5. If you genuinely don't know enough about this category to give real alternatives, return 3 with the strength tag "other" and rationale that acknowledges the lower confidence — don't make up specific competitors.

Call the report_brand_alternatives tool.`;
}

function fallbackAlternatives(brand: string): AltToolPayload {
  // Deterministic placeholder when Anthropic isn't configured. Honest
  // about being a fallback — operator sees the message and can wire
  // the API key before re-running.
  return {
    category: `(unknown — Anthropic not configured)`,
    alternatives: [
      {
        name: `Alternative supplier #1 to ${brand}`,
        rationale: "Anthropic API key missing — re-run after configuring ANTHROPIC_API_KEY for real suggestions",
        strength: "other",
        score: 0,
      },
      {
        name: `Alternative supplier #2 to ${brand}`,
        rationale: "Anthropic API key missing — re-run after configuring",
        strength: "other",
        score: 0,
      },
      {
        name: `Alternative supplier #3 to ${brand}`,
        rationale: "Anthropic API key missing — re-run after configuring",
        strength: "other",
        score: 0,
      },
    ],
  };
}

/**
 * Generate alternatives for one brand. Pulls context from the existing
 * SupplyEdge graph so the model knows what category to suggest in.
 * Persists via store.upsertBrandAlternative.
 */
export async function runBrandAlternativesScan(
  brandInput: string,
  options: { explicitCategory?: string } = {},
): Promise<{ run: AgentRun; alternative: BrandAlternative }> {
  const brandDisplay = brandInput.trim();
  const brandLower = brandDisplay.toLowerCase();
  if (!brandLower) throw new Error("brand name required");

  const startedAt = new Date();
  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  // ─── Build context from the graph ────────────────────────────────────
  const edges = await store.getSupplyEdgesByBrand(brandDisplay);
  const businessIds = Array.from(new Set(edges.map((e) => e.fromBusinessId)));
  const businesses = await store.getBusinesses();
  const sampleBusinesses = businessIds
    .map((id) => businesses.find((b) => b.id === id))
    .filter((b): b is NonNullable<typeof b> => !!b)
    .slice(0, 25);

  const sampleIndustries = Array.from(
    new Set(
      sampleBusinesses
        .map((b) => b.aiProfile?.industryRefined || b.industry)
        .filter((x): x is string => !!x && x.trim().length > 0),
    ),
  ).slice(0, 8);
  const sampleStates = Array.from(
    new Set(sampleBusinesses.map((b) => b.state).filter((x): x is string => !!x)),
  ).slice(0, 8);
  const sampleBusinessNames = sampleBusinesses.map((b) => b.name).slice(0, 8);
  const contextSampleSize = sampleBusinesses.length;

  // ─── Call Claude ─────────────────────────────────────────────────────
  const client = getAnthropicClient();
  const usedFallback = !client;
  let payload: AltToolPayload;
  let inputTokens = 0;
  let outputTokens = 0;
  let errorMessage: string | undefined;
  let runStatus: "success" | "error" = "success";

  if (usedFallback) {
    payload = fallbackAlternatives(brandDisplay);
  } else {
    try {
      await checkSpendBudget();
      const res = await client!.messages.create({
        model: MODEL_CHEAP,
        max_tokens: 900,
        tools: [ALT_TOOL],
        tool_choice: { type: "tool", name: ALT_TOOL.name },
        messages: [
          {
            role: "user",
            content: buildPrompt(brandDisplay, {
              sampleIndustries,
              sampleStates,
              sampleBusinessNames,
              explicitCategory: options.explicitCategory,
            }),
          },
        ],
      });
      inputTokens = res.usage.input_tokens;
      outputTokens = res.usage.output_tokens;
      await recordSpend({
        agent: "buyer-discovery", // same cost bucket as profile scan
        cost: estimateCost(MODEL_CHEAP, inputTokens, outputTokens),
      });
      const toolUse = res.content.find((blk) => blk.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Model did not return a tool_use block");
      }
      payload = toolUse.input as AltToolPayload;
    } catch (e) {
      runStatus = "error";
      errorMessage = e instanceof Error ? e.message : String(e);
      payload = fallbackAlternatives(brandDisplay);
    }
  }

  const finishedAt = new Date();
  const cost = usedFallback ? undefined : estimateCost(MODEL_CHEAP, inputTokens, outputTokens);

  const alternative = await store.upsertBrandAlternative({
    brand: brandLower,
    brandDisplay,
    category: payload.category || options.explicitCategory,
    alternatives: (payload.alternatives ?? []).slice(0, 5),
    modelUsed: usedFallback ? "fallback" : MODEL_CHEAP,
    estCostUsd: cost,
    usedFallback,
    contextSampleSize,
  });

  const run: AgentRun = {
    id: runId,
    agent: "buyer-discovery",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    status: runStatus,
    inputCategory: payload.category ?? null,
    inputProductName: brandDisplay,
    productCount: 0,
    buyerCount: 0,
    modelUsed: usedFallback ? "fallback" : MODEL_CHEAP,
    inputTokens: usedFallback ? undefined : inputTokens,
    outputTokens: usedFallback ? undefined : outputTokens,
    estCostUsd: cost,
    usedFallback,
    errorMessage,
  };
  await store.saveRun(run);

  // Suppress unused-var warning for `edges` (used implicitly via context)
  void edges as unknown as SupplyEdge[];

  return { run, alternative };
}
