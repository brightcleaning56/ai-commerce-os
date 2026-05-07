import { estimateCost, getAnthropicClient, MODEL_SMART } from "@/lib/anthropic";
import { store, type AgentRun, type OutreachDraft } from "@/lib/store";

const OUTREACH_TOOL = {
  name: "draft_outreach",
  description:
    "Draft a personalized outreach package (email + LinkedIn message + SMS) for the given buyer and product. Each channel must follow the rules in the system prompt.",
  input_schema: {
    type: "object" as const,
    properties: {
      email: {
        type: "object",
        properties: {
          subject: { type: "string", description: "≤ 50 chars, lowercase-ish, no exclamation marks, no spam triggers." },
          body: { type: "string", description: "70-110 words. 3 short paragraphs max. Plain text. No markdown. Reference one specific store-mix detail. End with a single soft ask." },
        },
        required: ["subject", "body"],
      },
      linkedin: {
        type: "object",
        properties: {
          body: { type: "string", description: "≤ 50 words. Connection-request style. Mention the product naturally. End with a question or soft ask." },
        },
        required: ["body"],
      },
      sms: {
        type: "object",
        properties: {
          body: { type: "string", description: "≤ 160 chars. Casual tone. Identify the sender, the product, the ask. No emojis." },
        },
        required: ["body"],
      },
    },
    required: ["email", "linkedin", "sms"],
  },
};

type OutreachToolPayload = {
  email: { subject: string; body: string };
  linkedin: { body: string };
  sms: { body: string };
};

function buildPrompt(input: {
  buyerCompany: string;
  buyerName: string;
  buyerTitle: string;
  buyerIndustry: string;
  buyerType: string;
  buyerLocation: string;
  buyerRationale?: string;
  productName: string;
  productCategory: string;
  productNiche: string;
  productRationale?: string;
}) {
  const buyerContext = input.buyerRationale ? `\n- Why they fit: ${input.buyerRationale}` : "";
  const productContext = input.productRationale ? `\n- Why it's trending: ${input.productRationale}` : "";

  return `You are the Outreach Agent in an AI commerce operating system. Your job: draft a personalized outreach package for a wholesale buyer about a trending product.

## Buyer
- Company: ${input.buyerCompany}
- Decision-maker: ${input.buyerName}, ${input.buyerTitle}
- Type: ${input.buyerType}
- Industry: ${input.buyerIndustry}
- Location: ${input.buyerLocation}${buyerContext}

## Product
- Name: ${input.productName}
- Category: ${input.productCategory}
- Niche: ${input.productNiche}${productContext}

## Rules
- Use the decision-maker's first name only in greetings (e.g. "Hi Sarah")
- Reference one specific detail about their store mix or recent expansion
- The ask should be soft: "open to a 15-min call?" or "want me to send a deck?"
- Sender name: Marcus from AVYN Wholesale
- No buzzwords ("synergy", "circle back", "leverage", "robust"). No exclamation marks.
- Email: 70-110 words, plain text, 3 short paragraphs max
- LinkedIn: ≤ 50 words, connection-request style
- SMS: ≤ 160 chars, casual but professional

Call the draft_outreach tool with the three channel drafts.`;
}

function fakeDrafts(input: {
  buyerName: string;
  buyerCompany: string;
  productName: string;
  buyerIndustry: string;
}): OutreachToolPayload {
  const fn = input.buyerName.split(" ")[0];
  return {
    email: {
      subject: `Quick idea for ${input.buyerCompany}`,
      body: `Hi ${fn},\n\nNoticed ${input.buyerCompany} has been expanding ${input.buyerIndustry.toLowerCase()} SKUs this quarter. We've got the ${input.productName} trending hard right now — strong margin at your typical retail and clean fit for your store mix.\n\nHappy to send the spec sheet or hop on a 15-minute call this week. Whichever's easier?\n\nMarcus\nAVYN Wholesale`,
    },
    linkedin: {
      body: `Hi ${fn} — saw ${input.buyerCompany} expanding into ${input.buyerIndustry.toLowerCase()}. We've got the ${input.productName} pulling +180% trend velocity. Worth a quick chat about exclusive terms?`,
    },
    sms: {
      body: `Hey ${fn}, Marcus from AVYN Wholesale. ${input.productName} is trending hard this week — would 15 min next Tue work to walk you through pricing?`,
    },
  };
}

export async function runOutreach(input: {
  buyerId: string;
  buyerCompany: string;
  buyerName: string;
  buyerTitle: string;
  buyerIndustry: string;
  buyerType: string;
  buyerLocation: string;
  buyerRationale?: string;
  productName: string;
  productCategory: string;
  productNiche: string;
  productRationale?: string;
}): Promise<{ run: AgentRun; draft: OutreachDraft }> {
  const startedAt = new Date();
  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const draftId = `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const client = getAnthropicClient();
  const usedFallback = !client;

  let payload: OutreachToolPayload;
  let inputTokens = 0;
  let outputTokens = 0;
  let errorMessage: string | undefined;
  let status: "success" | "error" = "success";

  try {
    if (!client) {
      payload = fakeDrafts(input);
    } else {
      const res = await client.messages.create({
        model: MODEL_SMART,
        max_tokens: 1500,
        tools: [OUTREACH_TOOL],
        tool_choice: { type: "tool", name: OUTREACH_TOOL.name },
        messages: [{ role: "user", content: buildPrompt(input) }],
      });

      inputTokens = res.usage.input_tokens;
      outputTokens = res.usage.output_tokens;

      const toolUse = res.content.find((b) => b.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Model did not return a tool_use block");
      }
      payload = toolUse.input as OutreachToolPayload;
    }
  } catch (e) {
    status = "error";
    errorMessage = e instanceof Error ? e.message : String(e);
    payload = fakeDrafts(input);
  }

  const finishedAt = new Date();
  const cost = usedFallback ? undefined : estimateCost(MODEL_SMART, inputTokens, outputTokens);

  const draft: OutreachDraft = {
    id: draftId,
    runId,
    createdAt: finishedAt.toISOString(),
    buyerId: input.buyerId,
    buyerCompany: input.buyerCompany,
    buyerName: input.buyerName,
    buyerTitle: input.buyerTitle,
    productName: input.productName,
    status: "draft",
    email: payload.email,
    linkedin: payload.linkedin,
    sms: payload.sms,
    modelUsed: usedFallback ? "fallback (no API key)" : MODEL_SMART,
    estCostUsd: cost,
    usedFallback,
  };

  if (status === "success") {
    store.saveDraft(draft);
  }

  const run: AgentRun = {
    id: runId,
    agent: "outreach",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    status,
    inputCategory: input.productCategory,
    inputProductName: input.productName,
    productCount: 0,
    buyerCount: 0,
    modelUsed: usedFallback ? "fallback (no API key)" : MODEL_SMART,
    inputTokens: usedFallback ? undefined : inputTokens,
    outputTokens: usedFallback ? undefined : outputTokens,
    estCostUsd: cost,
    usedFallback,
    errorMessage,
  };
  store.saveRun(run);
  return { run, draft };
}
