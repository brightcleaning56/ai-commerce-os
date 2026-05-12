import { checkSpendBudget, estimateCost, getAnthropicClient, MODEL_CHEAP, recordSpend } from "@/lib/anthropic";
import { fetchHomepageText } from "@/lib/businessProfileFetch";
import { store, type AgentRun, type BusinessRecord } from "@/lib/store";

/**
 * Business Profile Agent — fetches a business's homepage and asks
 * Claude (Haiku for cost discipline) to extract:
 *
 *   - What they actually sell (specific products/services, not just industry)
 *   - Brand names visible in their copy/logos (= likely suppliers)
 *   - Distribution partners mentioned ("we sell on Amazon", "find us at Costco")
 *   - A more specific industry label than the CSV import probably gave us
 *   - A 1-2 sentence operator-readable summary
 *   - A 0-100 confidence self-rating
 *
 * Why this matters:
 *   - The Business Outreach Agent's pitch becomes specific instead of
 *     generic ("I see you carry Brand X — we have a better supplier")
 *   - SupplyEdge graph (slice 4) gets seeded with real likely edges
 *   - Operator gets a one-glance summary per business in /admin/businesses
 *
 * Cost: ~$0.003 per scan (Haiku at typical homepage length). 1000 scans
 * ≈ $3. Cheap enough to run on-demand per-business or in small batches.
 * Bulk batch endpoint caps at 10 to keep latency + spend predictable.
 */

const PROFILE_TOOL = {
  name: "report_business_profile",
  description:
    "Extract structured signals from a business's homepage text. Only return signals you can point at in the text — if uncertain, return an empty array rather than guess.",
  input_schema: {
    type: "object" as const,
    properties: {
      productsSold: {
        type: "array",
        items: { type: "string" },
        maxItems: 10,
        description:
          "0-10 short labels for what they sell. Specific (e.g. 'commercial roofing', 'asphalt shingles', 'gutter installation'), not generic ('home services'). Empty if you can't tell.",
      },
      likelySupplierBrands: {
        type: "array",
        items: { type: "string" },
        maxItems: 10,
        description:
          "0-10 brand names visible in the copy (in product lists, 'we carry', logos, footer). These are the SUPPLIERS this business probably buys from.",
      },
      likelyDistributors: {
        type: "array",
        items: { type: "string" },
        maxItems: 5,
        description:
          "0-5 channel partners — places this business sells THROUGH ('available on Amazon', 'find us at Home Depot', 'now at Costco'). Different from suppliers (who they buy FROM).",
      },
      industryRefined: {
        type: "string",
        description:
          "More specific industry label than a generic CSV input — e.g. 'Commercial roofing contractor (TX)' rather than 'Roofing'. Empty string if you can't refine.",
      },
      summary: {
        type: "string",
        description:
          "One or two sentences a salesperson could read in 5 seconds and understand what this business actually does. Plain language, no buzzwords.",
      },
      confidence: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description:
          "0-100 self-rating: how solid are these inferences? 90+ when the homepage clearly states everything. 30-50 when most fields are guesses from sparse copy. <30 when the page is mostly navigation/login/marketing fluff.",
      },
    },
    required: ["productsSold", "likelySupplierBrands", "likelyDistributors", "summary", "confidence"],
  },
};

type ProfileToolPayload = {
  productsSold: string[];
  likelySupplierBrands: string[];
  likelyDistributors: string[];
  industryRefined?: string;
  summary: string;
  confidence: number;
};

function buildPrompt(b: BusinessRecord, homepageText: string): string {
  const loc = [b.city, b.state].filter(Boolean).join(", ") || "unknown location";
  return `You are the Business Profile Agent for AVYN Commerce. Read a business's homepage and extract structured signals so our outreach agent can personalize a pitch.

## What we already know
- Name: ${b.name}
- Industry (operator-supplied): ${b.industry ?? "unknown"}
- Location: ${loc}
${b.contactName ? `- Decision-maker: ${b.contactName}${b.contactTitle ? `, ${b.contactTitle}` : ""}` : ""}

## Homepage text (truncated)
\`\`\`
${homepageText}
\`\`\`

## Rules
- Only return signals you can POINT AT in the text. If the homepage doesn't list brands, return an empty likelySupplierBrands array — do NOT make them up.
- "likelySupplierBrands" = brand names this business BUYS from (you'd see these in "we carry X", "authorized dealer of Y", logo strips, footer).
- "likelyDistributors" = channels they SELL through ("available on Amazon", "find us at Lowe's"). Different from suppliers.
- "industryRefined" should be more specific than a generic CSV label when possible (e.g. 'Commercial roofing contractor' vs 'Roofing'). Empty string if you can't tell.
- "summary" is two sentences max, written for a salesperson skimming.
- "confidence" reflects YOUR honesty about the inferences — high only when the homepage is clear.
- No buzzwords ("synergy", "leverage"). No exclamation marks.

Call the report_business_profile tool.`;
}

function fallbackProfile(b: BusinessRecord): ProfileToolPayload {
  // Deterministic best-effort when Anthropic isn't configured or the
  // fetch failed. Empty arrays + low confidence so the UI shows the
  // operator that this profile is essentially unhelpful.
  return {
    productsSold: [],
    likelySupplierBrands: [],
    likelyDistributors: [],
    industryRefined: b.industry ?? "",
    summary: `Profile scan unavailable for ${b.name} (no Anthropic API key or homepage fetch failed). Operator can re-run after wiring ANTHROPIC_API_KEY.`,
    confidence: 0,
  };
}

/**
 * Scan one BusinessRecord. Persists the result onto the record via
 * store.updateBusiness({ aiProfile: ... }) AND returns the AgentRun for
 * the per-call cost ledger.
 */
export async function runBusinessProfileScan(b: BusinessRecord): Promise<{
  run: AgentRun;
  profile: BusinessRecord["aiProfile"];
  fetchedUrl?: string;
}> {
  const startedAt = new Date();
  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  // 1. Fetch homepage
  let fetchedUrl: string | undefined;
  let homepageText = "";
  let fetchError: string | undefined;

  if (b.website) {
    const r = await fetchHomepageText(b.website);
    if (r.ok) {
      homepageText = r.text;
      fetchedUrl = r.finalUrl;
    } else {
      fetchError = r.error;
    }
  } else {
    fetchError = "No website on record";
  }

  // 2. Call Claude (or fallback)
  const client = getAnthropicClient();
  const usedFallback = !client || !homepageText;

  let payload: ProfileToolPayload;
  let inputTokens = 0;
  let outputTokens = 0;
  let errorMessage: string | undefined = fetchError;
  let runStatus: "success" | "error" = "success";

  if (usedFallback) {
    payload = fallbackProfile(b);
    if (fetchError) runStatus = "error";
  } else {
    try {
      await checkSpendBudget();
      const res = await client!.messages.create({
        model: MODEL_CHEAP,
        max_tokens: 800,
        tools: [PROFILE_TOOL],
        tool_choice: { type: "tool", name: PROFILE_TOOL.name },
        messages: [{ role: "user", content: buildPrompt(b, homepageText) }],
      });
      inputTokens = res.usage.input_tokens;
      outputTokens = res.usage.output_tokens;
      await recordSpend({
        agent: "buyer-discovery", // reuse closest existing agent bucket — profile scan adjacent to discovery
        cost: estimateCost(MODEL_CHEAP, inputTokens, outputTokens),
      });

      const toolUse = res.content.find((blk) => blk.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Model did not return a tool_use block");
      }
      payload = toolUse.input as ProfileToolPayload;
    } catch (e) {
      runStatus = "error";
      errorMessage = e instanceof Error ? e.message : String(e);
      payload = fallbackProfile(b);
    }
  }

  const finishedAt = new Date();
  const cost = usedFallback ? undefined : estimateCost(MODEL_CHEAP, inputTokens, outputTokens);

  const aiProfile: BusinessRecord["aiProfile"] = {
    scannedAt: finishedAt.toISOString(),
    homepageUrl: fetchedUrl,
    productsSold: (payload.productsSold ?? []).slice(0, 10),
    likelySupplierBrands: (payload.likelySupplierBrands ?? []).slice(0, 10),
    likelyDistributors: (payload.likelyDistributors ?? []).slice(0, 5),
    industryRefined: payload.industryRefined?.trim() || undefined,
    summary: payload.summary?.trim() || undefined,
    confidence: Math.max(0, Math.min(100, Math.round(payload.confidence ?? 0))),
    modelUsed: usedFallback ? "fallback" : MODEL_CHEAP,
    estCostUsd: cost,
    fetchError,
    usedFallback,
  };

  // Persist onto the business record
  await store.updateBusiness(b.id, { aiProfile });

  // ─── Seed the Commercial Intelligence Graph ───────────────────────────
  // Every supplier brand the scan surfaced becomes a `sources_from` edge;
  // every distribution channel becomes a `distributes_through` edge.
  // Idempotent — re-scanning the same business updates lastSeenAt + can
  // raise confidence but never duplicates. Only fires when the model was
  // confident enough that the data isn't noise (>= 30) — same threshold
  // the outreach agent uses to incorporate profile signals.
  //
  // We don't await individual edge writes blocking the response; they
  // serialize through the same backend so finishing in-loop is fine.
  if (aiProfile && aiProfile.confidence >= 30 && !aiProfile.usedFallback) {
    const evidenceBase = `homepage scan ${new Date(aiProfile.scannedAt).toLocaleDateString()}`;
    for (const brand of aiProfile.likelySupplierBrands) {
      try {
        await store.upsertSupplyEdge({
          fromBusinessId: b.id,
          fromBusinessName: b.name,
          toName: brand,
          kind: "sources_from",
          source: "ai_profile",
          confidence: aiProfile.confidence,
          evidence: `${evidenceBase} · listed under suppliers/brands`,
        });
      } catch (err) {
        // Edge write failures shouldn't fail the scan — graph is a
        // derived index, the canonical signal is on the business record.
        console.error("[businessProfile] upsertSupplyEdge failed", err);
      }
    }
    for (const dist of aiProfile.likelyDistributors) {
      try {
        await store.upsertSupplyEdge({
          fromBusinessId: b.id,
          fromBusinessName: b.name,
          toName: dist,
          kind: "distributes_through",
          source: "ai_profile",
          confidence: aiProfile.confidence,
          evidence: `${evidenceBase} · listed as a sales channel`,
        });
      } catch (err) {
        console.error("[businessProfile] upsertSupplyEdge failed", err);
      }
    }
  }

  const run: AgentRun = {
    id: runId,
    agent: "buyer-discovery",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    status: runStatus,
    inputCategory: b.industry ?? null,
    inputProductName: b.name,
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

  return { run, profile: aiProfile, fetchedUrl };
}
