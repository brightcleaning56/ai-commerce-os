import type { Supplier } from "@/lib/suppliers";
import { checkSpendBudget, estimateCost, getAnthropicClient, MODEL_CHEAP, recordSpend } from "@/lib/anthropic";
import { store, type AgentRun, type DiscoveredSupplier } from "@/lib/store";

const SUPPLIER_TOOL = {
  name: "report_matched_suppliers",
  description:
    "Suggest 5-7 plausible suppliers (manufacturers, wholesalers, distributors, or dropship partners) capable of supplying the input product. Each must include all required fields.",
  input_schema: {
    type: "object" as const,
    properties: {
      suppliers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Supplier company name. Real-sounding mix of indie + larger names." },
            country: {
              type: "string",
              enum: ["China", "Vietnam", "India", "USA", "Mexico", "Turkey", "Indonesia", "Thailand", "Pakistan", "Poland", "Japan"],
            },
            city: { type: "string" },
            type: {
              type: "string",
              enum: ["Manufacturer", "Wholesaler", "Distributor", "Dropship"],
            },
            unitPrice: { type: "number", description: "Plausible wholesale unit cost in USD" },
            moq: { type: "integer", description: "Minimum order quantity" },
            leadTimeDays: { type: "integer", description: "Days from PO to ship-out" },
            rating: { type: "number", minimum: 3.0, maximum: 5.0 },
            yearsActive: { type: "integer", minimum: 1, maximum: 30 },
            shipMethods: {
              type: "array",
              items: { type: "string", enum: ["Sea", "Air", "Express"] },
            },
            certifications: {
              type: "array",
              items: { type: "string", enum: ["BSCI", "ISO 9001", "FDA", "CE", "RoHS", "FSC", "OEKO-TEX"] },
            },
            riskScore: { type: "integer", minimum: 0, maximum: 100, description: "0=safest, 100=highest risk" },
            verified: { type: "boolean" },
            capacityUnitsPerMo: { type: "integer" },
            responseHours: { type: "integer", minimum: 1, maximum: 72 },
            rationale: { type: "string", description: "1 sentence on why this supplier fits this product." },
          },
          required: [
            "name",
            "country",
            "city",
            "type",
            "unitPrice",
            "moq",
            "leadTimeDays",
            "rating",
            "yearsActive",
            "shipMethods",
            "certifications",
            "riskScore",
            "verified",
            "capacityUnitsPerMo",
            "responseHours",
            "rationale",
          ],
        },
      },
    },
    required: ["suppliers"],
  },
};

type SupplierToolPayload = {
  suppliers: Array<{
    name: string;
    country: string;
    city: string;
    type: Supplier["type"];
    unitPrice: number;
    moq: number;
    leadTimeDays: number;
    rating: number;
    yearsActive: number;
    shipMethods: Supplier["shipMethods"];
    certifications: string[];
    riskScore: number;
    verified: boolean;
    capacityUnitsPerMo: number;
    responseHours: number;
    rationale: string;
  }>;
};

function buildPrompt(productName: string, productCategory: string, productNiche: string) {
  return `You are the Supplier Finder Agent in an AI commerce operating system. Your job: identify 5-7 plausible suppliers capable of supplying the input product wholesale.

## Product
- Name: ${productName}
- Category: ${productCategory}
- Niche: ${productNiche}

## Output requirements
Spread across:
- A mix of supplier types (Manufacturer + Wholesaler + Distributor + Dropship — don't return 7 manufacturers)
- A mix of countries (mostly China/Vietnam for hardware, but include 1-2 closer-to-market options like USA or Mexico for shorter lead time)
- Realistic risk profile: most should be 5-30 (safe), one should be 60-80 (high-risk, unverified, scammy domain) so the Risk Center has something to flag
- Realistic ranges: MOQ 50-1000, lead time 7-35d, unit prices that match a plausible 2.5-4× wholesale-retail markup
- Certifications appropriate to the product (FDA for food/health, CE/RoHS for electronics, OEKO-TEX for textiles)

For each supplier, write a 1-sentence rationale that cites a concrete fit detail (specialization, capacity, recent expansion, certification advantage).

Call the report_matched_suppliers tool.`;
}

function fakeSuppliers(productName: string, category: string): SupplierToolPayload {
  return {
    suppliers: [
      { name: "Shenzhen Bright Co.", country: "China", city: "Shenzhen", type: "Manufacturer", unitPrice: 4.8, moq: 500, leadTimeDays: 18, rating: 4.7, yearsActive: 8, shipMethods: ["Sea", "Air"], certifications: ["BSCI", "ISO 9001"], riskScore: 12, verified: true, capacityUnitsPerMo: 80000, responseHours: 4, rationale: `Strong factory in Shenzhen for ${category.toLowerCase()} with capacity to scale to 80K units/month.` },
      { name: "Yiwu Trade Hub", country: "China", city: "Yiwu", type: "Wholesaler", unitPrice: 5.2, moq: 200, leadTimeDays: 12, rating: 4.5, yearsActive: 12, shipMethods: ["Sea", "Air"], certifications: ["BSCI"], riskScore: 18, verified: true, capacityUnitsPerMo: 35000, responseHours: 6, rationale: "Yiwu wholesaler with low MOQ — good for first-test orders before committing to a manufacturer." },
      { name: "Hanoi Crafts", country: "Vietnam", city: "Hanoi", type: "Manufacturer", unitPrice: 5.6, moq: 300, leadTimeDays: 22, rating: 4.4, yearsActive: 6, shipMethods: ["Sea"], certifications: ["BSCI", "OEKO-TEX"], riskScore: 22, verified: true, capacityUnitsPerMo: 25000, responseHours: 8, rationale: "Vietnam alternative — slightly higher unit but better tariff position for US buyers." },
      { name: "Dropship USA Net", country: "USA", city: "Los Angeles", type: "Dropship", unitPrice: 8.4, moq: 1, leadTimeDays: 4, rating: 4.2, yearsActive: 3, shipMethods: ["Express"], certifications: ["FDA"], riskScore: 30, verified: true, capacityUnitsPerMo: 5000, responseHours: 2, rationale: "US-based dropship — higher margin trade-off but no inventory risk and 4-day shipping for prototype orders." },
      { name: "Tijuana Plastics MX", country: "Mexico", city: "Tijuana", type: "Manufacturer", unitPrice: 5.0, moq: 500, leadTimeDays: 14, rating: 4.3, yearsActive: 9, shipMethods: ["Sea", "Express"], certifications: ["ISO 9001"], riskScore: 16, verified: true, capacityUnitsPerMo: 40000, responseHours: 5, rationale: "Mexico nearshore option — USMCA tariff advantage and 14-day lead time to East Coast buyers." },
      { name: "Quickdrop EZ Source", country: "China", city: "Guangzhou", type: "Dropship", unitPrice: 3.2, moq: 50, leadTimeDays: 28, rating: 3.8, yearsActive: 1, shipMethods: ["Air"], certifications: [], riskScore: 72, verified: false, capacityUnitsPerMo: 8000, responseHours: 24, rationale: `Cheap unit price for ${productName} but unverified, new domain (<6 months). Risk Agent should flag.` },
    ],
  };
}

export async function runSupplierFinder(input: {
  productName: string;
  productCategory: string;
  productNiche: string;
}): Promise<AgentRun> {
  const startedAt = new Date();
  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const client = getAnthropicClient();
  const usedFallback = !client;

  let payload: SupplierToolPayload;
  let inputTokens = 0;
  let outputTokens = 0;
  let errorMessage: string | undefined;
  let status: "success" | "error" = "success";

  try {
    if (!client) {
      payload = fakeSuppliers(input.productName, input.productCategory);
    } else {
      await checkSpendBudget();
      const res = await client.messages.create({
        model: MODEL_CHEAP,
        max_tokens: 2500,
        tools: [SUPPLIER_TOOL],
        tool_choice: { type: "tool", name: SUPPLIER_TOOL.name },
        messages: [
          {
            role: "user",
            content: buildPrompt(input.productName, input.productCategory, input.productNiche),
          },
        ],
      });
      inputTokens = res.usage.input_tokens;
      outputTokens = res.usage.output_tokens;
      await recordSpend({ agent: "supplier-finder", cost: estimateCost(MODEL_CHEAP, inputTokens, outputTokens) });
      const toolUse = res.content.find((b) => b.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Model did not return a tool_use block");
      }
      payload = toolUse.input as SupplierToolPayload;
    }
  } catch (e) {
    status = "error";
    errorMessage = e instanceof Error ? e.message : String(e);
    payload = fakeSuppliers(input.productName, input.productCategory);
  }

  const finishedAt = new Date();
  const discoveredAt = finishedAt.toISOString();

  const FRAUD_FLAGS_POOL = [
    "Domain registered <6 months ago",
    "MOQ inconsistent across listings",
    "No verifiable factory address",
    "Photos copied from another supplier",
    "No third-party certifications",
  ];

  const suppliers: DiscoveredSupplier[] = payload.suppliers.map((s, i) => ({
    id: `${runId}_s${i + 1}`,
    name: s.name,
    country: s.country,
    city: s.city,
    type: s.type,
    rating: s.rating,
    yearsActive: s.yearsActive,
    moq: s.moq,
    unitPrice: s.unitPrice,
    leadTimeDays: s.leadTimeDays,
    shipMethods: s.shipMethods,
    certifications: s.certifications,
    riskScore: s.riskScore,
    fraudFlags:
      s.riskScore >= 60
        ? [FRAUD_FLAGS_POOL[i % FRAUD_FLAGS_POOL.length], FRAUD_FLAGS_POOL[(i + 2) % FRAUD_FLAGS_POOL.length]]
        : [],
    matchedProducts: [input.productName],
    capacityUnitsPerMo: s.capacityUnitsPerMo,
    responseHours: s.responseHours,
    verified: s.verified,
    source: "agent",
    agent: "supplier-finder",
    discoveredAt,
    runId,
    rationale: s.rationale,
    forProduct: input.productName,
  }));

  if (status === "success") {
    await store.saveDiscoveredSuppliers(suppliers);
  }

  const run: AgentRun = {
    id: runId,
    agent: "supplier-finder",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    status,
    inputCategory: input.productCategory,
    inputProductName: input.productName,
    productCount: 0,
    supplierCount: suppliers.length,
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
