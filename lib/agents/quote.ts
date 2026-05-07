import { checkSpendBudget, estimateCost, getAnthropicClient, MODEL_SMART, recordSpend } from "@/lib/anthropic";
import { expiryFromTtlHours, genShareToken } from "@/lib/shareTokens";
import { store, type AgentRun, type Quote } from "@/lib/store";

const QUOTE_TOOL = {
  name: "draft_quote",
  description:
    "Generate a structured wholesale quote: unit price, quantity, discount, payment terms, lead time, and a brief rationale. Pricing should reflect the negotiation thread (any concessions promised) and reasonable wholesale margins.",
  input_schema: {
    type: "object" as const,
    properties: {
      unitPrice: { type: "number", description: "Per-unit price in USD, between $1 and $200. Realistic for the product category." },
      quantity: { type: "number", description: "Initial order quantity, between 100 and 10000. If buyer mentioned an MOQ, respect it." },
      discountPct: { type: "number", description: "Discount applied to subtotal, 0–25 (typical 5-15)." },
      paymentTerms: {
        type: "string",
        enum: ["Net 30", "Net 45", "Net 60", "50% upfront, 50% on delivery", "Cash on delivery"],
      },
      leadTimeDays: { type: "number", description: "Days from order to delivery, 14–90." },
      validForDays: { type: "number", description: "How long the quote is valid, 7–30 days." },
      shippingTerms: { type: "string", enum: ["FOB Origin", "FOB Destination", "DDP", "EXW"] },
      notes: { type: "string", description: "Optional 1-2 sentence note: any caveats, custom terms agreed in negotiation." },
      rationale: { type: "string", description: "Internal: why these numbers (links to negotiation context). 1-2 sentences." },
    },
    required: ["unitPrice", "quantity", "discountPct", "paymentTerms", "leadTimeDays", "validForDays", "shippingTerms", "rationale"],
  },
};

type QuoteToolPayload = {
  unitPrice: number;
  quantity: number;
  discountPct: number;
  paymentTerms: string;
  leadTimeDays: number;
  validForDays: number;
  shippingTerms: string;
  notes?: string;
  rationale: string;
};

function buildPrompt(input: {
  buyerCompany: string;
  buyerName: string;
  productName: string;
  productCategory?: string;
  emailBody: string;
  threadBlock: string;
}) {
  return `You are the Quote Agent. Generate a formal wholesale quote for a buyer based on the outreach + negotiation context below.

## Buyer
- ${input.buyerName} at ${input.buyerCompany}
- Product: ${input.productName}${input.productCategory ? ` (${input.productCategory})` : ""}

## Original outreach
${input.emailBody}

${input.threadBlock ? `## Negotiation thread\n${input.threadBlock}\n\n` : ""}## Rules
- Match any pricing concessions the agent promised in the thread (e.g., "8% discount tied to 12-month commit" → discountPct=8, payment terms reflect commit length).
- If buyer asked for smaller MOQ, set quantity to that.
- Realistic wholesale margins: unit price typically 30-60% of consumer retail.
- Default valid-for: 14 days. Default lead time: 30 days for stocked items, 60 for custom.
- Shipping: FOB Origin for US-domestic, DDP for international.

Call the draft_quote tool.`;
}

function fakeQuote(input: { productName: string; quantity?: number }): QuoteToolPayload {
  return {
    unitPrice: 18.50,
    quantity: input.quantity ?? 1000,
    discountPct: 8,
    paymentTerms: "Net 30",
    leadTimeDays: 30,
    validForDays: 14,
    shippingTerms: "FOB Origin",
    notes: "8% discount tied to 12-month volume commit. First lot ships within 30 days of PO.",
    rationale: "Standard wholesale quote with 8% concession matched to the volume-lock lever proposed in the negotiation thread.",
  };
}

export async function runQuote(input: { draftId: string }): Promise<{
  run: AgentRun;
  quote: Quote;
  alreadyExisted: boolean;
}> {
  const draft = await store.getDraft(input.draftId);
  if (!draft) throw new Error(`Draft ${input.draftId} not found`);

  // Idempotency: one active quote per draft. If a draft quote exists, return it.
  const existing = (await store.getQuotes()).find(
    (q) => q.draftId === input.draftId && (q.status === "draft" || q.status === "sent"),
  );
  if (existing) {
    const synthetic: AgentRun = {
      id: `run_existing_${existing.id}`,
      agent: "outreach",
      startedAt: existing.createdAt,
      finishedAt: existing.createdAt,
      durationMs: 0,
      status: "success",
      inputCategory: null,
      inputProductName: existing.productName,
      productCount: 0,
      buyerCount: 0,
      modelUsed: existing.modelUsed,
      usedFallback: existing.usedFallback,
    };
    return { run: synthetic, quote: existing, alreadyExisted: true };
  }

  const startedAt = new Date();
  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const client = getAnthropicClient();
  const usedFallback = !client;

  const threadBlock = (draft.thread ?? [])
    .map((m) => `### ${m.role === "buyer" ? "Buyer" : "Us"} · ${m.at}\n${m.body}`)
    .join("\n\n");

  let payload: QuoteToolPayload;
  let inputTokens = 0;
  let outputTokens = 0;
  let errorMessage: string | undefined;
  let status: "success" | "error" = "success";

  try {
    if (!client) {
      payload = fakeQuote({ productName: draft.productName });
    } else {
      await checkSpendBudget();
      const res = await client.messages.create({
        model: MODEL_SMART,
        max_tokens: 1200,
        tools: [QUOTE_TOOL],
        tool_choice: { type: "tool", name: QUOTE_TOOL.name },
        messages: [
          {
            role: "user",
            content: buildPrompt({
              buyerCompany: draft.buyerCompany,
              buyerName: draft.buyerName,
              productName: draft.productName,
              emailBody: draft.email.body,
              threadBlock,
            }),
          },
        ],
      });
      inputTokens = res.usage.input_tokens;
      outputTokens = res.usage.output_tokens;
      await recordSpend({ agent: "quote", cost: estimateCost(MODEL_SMART, inputTokens, outputTokens) });
      const toolUse = res.content.find((b) => b.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Model did not return a tool_use block");
      }
      payload = toolUse.input as QuoteToolPayload;
    }
  } catch (e) {
    status = "error";
    errorMessage = e instanceof Error ? e.message : String(e);
    payload = fakeQuote({ productName: draft.productName });
  }

  const finishedAt = new Date();
  const cost = usedFallback ? undefined : estimateCost(MODEL_SMART, inputTokens, outputTokens);

  const subtotal = payload.unitPrice * payload.quantity;
  const discountAmount = (subtotal * payload.discountPct) / 100;
  const total = subtotal - discountAmount;

  const quote: Quote = {
    id: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: finishedAt.toISOString(),
    draftId: draft.id,
    pipelineId: draft.pipelineId,
    buyerCompany: draft.buyerCompany,
    buyerName: draft.buyerName,
    productName: draft.productName,
    unitPrice: payload.unitPrice,
    quantity: payload.quantity,
    subtotal,
    discountPct: payload.discountPct,
    discountAmount,
    total,
    currency: "USD",
    paymentTerms: payload.paymentTerms,
    leadTimeDays: payload.leadTimeDays,
    validForDays: payload.validForDays,
    shippingTerms: payload.shippingTerms,
    notes: payload.notes,
    status: "draft",
    shareToken: genShareToken(),
    shareExpiresAt: expiryFromTtlHours(payload.validForDays * 24),
    modelUsed: usedFallback ? "fallback (no API key)" : MODEL_SMART,
    estCostUsd: cost,
    usedFallback,
    generatedRationale: payload.rationale,
  };

  if (status === "success") {
    await store.saveQuote(quote);
    // Promote draft to Quotation stage
    await store.patchDraft(draft.id, {
      dealStage: "Quotation",
      dealValue: Math.round(total),
      dealUnits: payload.quantity,
    });
  }

  const run: AgentRun = {
    id: runId,
    agent: "outreach",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    status,
    inputCategory: null,
    inputProductName: draft.productName,
    productCount: 0,
    buyerCount: 0,
    modelUsed: usedFallback ? "fallback (no API key)" : MODEL_SMART,
    inputTokens: usedFallback ? undefined : inputTokens,
    outputTokens: usedFallback ? undefined : outputTokens,
    estCostUsd: cost,
    usedFallback,
    errorMessage,
  };
  await store.saveRun(run);

  return { run, quote, alreadyExisted: false };
}
