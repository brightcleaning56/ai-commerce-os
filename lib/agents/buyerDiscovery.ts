import type { Buyer } from "@/lib/buyers";
import { checkSpendBudget, estimateCost, getAnthropicClient, MODEL_CHEAP, recordSpend } from "@/lib/anthropic";
import { store, type AgentRun, type DiscoveredBuyer } from "@/lib/store";

const BUYER_TOOL = {
  name: "report_matched_buyers",
  description:
    "Report 5-8 plausible buyer companies that would purchase the input product wholesale. Each must include all required fields.",
  input_schema: {
    type: "object" as const,
    properties: {
      buyers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            company: { type: "string", description: "Plausible company name. Mix real-sounding indie + chain names." },
            type: {
              type: "string",
              enum: [
                "Retail Chain",
                "E-commerce Brand",
                "Distributor",
                "Boutique",
                "Pet Store",
                "Online Store",
                "Wholesaler",
                "Marketplace Seller",
              ],
            },
            industry: { type: "string", description: "What aisle / category they sell in." },
            location: { type: "string", description: "City, Country" },
            country: {
              type: "string",
              enum: ["USA", "Canada", "UK", "Germany", "Australia", "Japan"],
            },
            intentScore: { type: "integer", minimum: 60, maximum: 100, description: "Likelihood they'd actively want this SKU right now" },
            fit: { type: "integer", minimum: 50, maximum: 100, description: "How well the product matches their store mix" },
            revenueBand: {
              type: "string",
              enum: ["$2-5M", "$5-10M", "$10-25M", "$25-50M", "$50-100M", "$100M+"],
            },
            employees: {
              type: "string",
              enum: ["11-50", "51-200", "201-500", "501-1k", "1k-5k"],
            },
            decisionMakerName: { type: "string" },
            decisionMakerTitle: {
              type: "string",
              enum: [
                "Head of Buying",
                "Director of Procurement",
                "Senior Buyer",
                "VP of Merchandising",
                "Chief Buyer",
                "Category Manager",
                "Founder",
                "Operations Lead",
              ],
            },
            rationale: { type: "string", description: "1 sentence on WHY this buyer fits — cite their store mix or recent expansion if known." },
          },
          required: [
            "company",
            "type",
            "industry",
            "location",
            "country",
            "intentScore",
            "fit",
            "revenueBand",
            "employees",
            "decisionMakerName",
            "decisionMakerTitle",
            "rationale",
          ],
        },
      },
    },
    required: ["buyers"],
  },
};

type BuyerToolPayload = {
  buyers: Array<{
    company: string;
    type: Buyer["type"];
    industry: string;
    location: string;
    country: Buyer["country"];
    intentScore: number;
    fit: number;
    revenueBand: string;
    employees: string;
    decisionMakerName: string;
    decisionMakerTitle: string;
    rationale: string;
  }>;
};

function buildPrompt(productName: string, productCategory: string, productNiche: string) {
  return `You are the Buyer Discovery Agent in an AI commerce operating system. Your job: find 5-8 plausible BUYERS who would purchase this product wholesale and resell it.

## Product
- Name: ${productName}
- Category: ${productCategory}
- Niche: ${productNiche}

## Output requirements
For each buyer, output:
- A specific company name (mix indie boutiques + e-commerce brands + at least one larger chain or distributor; avoid Fortune 500 generics)
- Realistic location, decision-maker name + title, employee + revenue band
- Intent score (60-100): "would this buyer want this product RIGHT NOW?"
- Fit score (50-100): "how well does the product match their store mix?"
- A 1-sentence rationale that cites a concrete store-mix detail or recent expansion. Avoid filler words.

Spread across geographies (mostly USA with 1-2 outside) and across buyer types (don't return 8 boutiques). Call the report_matched_buyers tool.`;
}

function fakeBuyers(productName: string, category: string): BuyerToolPayload {
  return {
    buyers: [
      { company: `${category.split(" ")[0]} Loft Co.`, type: "E-commerce Brand", industry: category, location: "Austin, USA", country: "USA", intentScore: 88, fit: 91, revenueBand: "$10-25M", employees: "51-200", decisionMakerName: "Sarah Chen", decisionMakerTitle: "Head of Buying", rationale: `Active in ${category.toLowerCase()} segment with 5 SKU adds in May; ${productName} fits their typical $20-40 retail band.` },
      { company: "Northgate Wholesale", type: "Distributor", industry: category, location: "Toronto, Canada", country: "Canada", intentScore: 82, fit: 84, revenueBand: "$25-50M", employees: "201-500", decisionMakerName: "Marcus Brooks", decisionMakerTitle: "Senior Buyer", rationale: `Distributes to 800+ independent retailers; demand for ${productName} would route through their reorder pipeline.` },
      { company: "Hearth & Thread", type: "Boutique", industry: category, location: "Brooklyn, USA", country: "USA", intentScore: 79, fit: 88, revenueBand: "$2-5M", employees: "11-50", decisionMakerName: "Priya Patel", decisionMakerTitle: "Founder", rationale: "Curated boutique with tight 40-SKU shelf — picks winners early in the trend cycle." },
      { company: "GoodGoods Supply", type: "Wholesaler", industry: category, location: "Chicago, USA", country: "USA", intentScore: 74, fit: 80, revenueBand: "$50-100M", employees: "501-1k", decisionMakerName: "Daniel Brooks", decisionMakerTitle: "Director of Procurement", rationale: `Mid-tier wholesaler that ships to ~400 stores; ${category.toLowerCase()} is their largest aisle.` },
      { company: "Coastal Curated", type: "Online Store", industry: category, location: "San Diego, USA", country: "USA", intentScore: 81, fit: 86, revenueBand: "$5-10M", employees: "11-50", decisionMakerName: "Aiko Tanaka", decisionMakerTitle: "Head of Buying", rationale: "Built brand around trending viral SKUs; reorders fast when something hits." },
    ],
  };
}

export async function runBuyerDiscovery(input: {
  productName: string;
  productCategory: string;
  productNiche: string;
}): Promise<AgentRun> {
  const startedAt = new Date();
  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const client = getAnthropicClient();
  const usedFallback = !client;

  let payload: BuyerToolPayload;
  let inputTokens = 0;
  let outputTokens = 0;
  let errorMessage: string | undefined;
  let status: "success" | "error" = "success";

  try {
    if (!client) {
      payload = fakeBuyers(input.productName, input.productCategory);
    } else {
      await checkSpendBudget();
      const res = await client.messages.create({
        model: MODEL_CHEAP,
        max_tokens: 2500,
        tools: [BUYER_TOOL],
        tool_choice: { type: "tool", name: BUYER_TOOL.name },
        messages: [
          {
            role: "user",
            content: buildPrompt(input.productName, input.productCategory, input.productNiche),
          },
        ],
      });

      inputTokens = res.usage.input_tokens;
      outputTokens = res.usage.output_tokens;
      await recordSpend({ agent: "buyer-discovery", cost: estimateCost(MODEL_CHEAP, inputTokens, outputTokens) });

      const toolUse = res.content.find((b) => b.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Model did not return a tool_use block");
      }
      payload = toolUse.input as BuyerToolPayload;
    }
  } catch (e) {
    status = "error";
    errorMessage = e instanceof Error ? e.message : String(e);
    payload = fakeBuyers(input.productName, input.productCategory);
  }

  const finishedAt = new Date();
  const discoveredAt = finishedAt.toISOString();

  const buyers: DiscoveredBuyer[] = payload.buyers.map((b, i) => {
    const slug = b.company.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const fnLower = b.decisionMakerName.split(" ")[0].toLowerCase();
    return {
      id: `${runId}_b${i + 1}`,
      company: b.company,
      type: b.type,
      industry: b.industry,
      location: b.location,
      country: b.country,
      intentScore: b.intentScore,
      revenue: b.revenueBand,
      employees: b.employees,
      website: `${slug}.com`,
      decisionMaker: b.decisionMakerName,
      decisionMakerTitle: b.decisionMakerTitle,
      email: `${fnLower}@${slug}.com`,
      linkedin: `linkedin.com/in/${fnLower}-${b.decisionMakerName.split(" ").slice(-1)[0].toLowerCase()}`,
      lastActivity: "Just discovered",
      status: "New",
      fit: b.fit,
      matchedProducts: [input.productName],
      source: "agent",
      agent: "buyer-discovery",
      discoveredAt,
      runId,
      rationale: b.rationale,
      forProduct: input.productName,
    };
  });

  if (status === "success") {
    await store.saveDiscoveredBuyers(buyers);
  }

  const run: AgentRun = {
    id: runId,
    agent: "buyer-discovery",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    status,
    inputCategory: input.productCategory,
    inputProductName: input.productName,
    productCount: 0,
    buyerCount: buyers.length,
    modelUsed: usedFallback ? "fallback (no API key)" : MODEL_CHEAP,
    inputTokens: usedFallback ? undefined : inputTokens,
    outputTokens: usedFallback ? undefined : outputTokens,
    estCostUsd: usedFallback ? undefined : estimateCost(MODEL_CHEAP, inputTokens, outputTokens),
    usedFallback,
    errorMessage,
  };
  await store.saveRun(run);
  return run;
}
