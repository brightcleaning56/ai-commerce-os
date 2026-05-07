import { checkSpendBudget, estimateCost, getAnthropicClient, MODEL_SMART, recordSpend } from "@/lib/anthropic";
import { getOperator } from "@/lib/operator";
import { store, type AgentRun, type OutreachDraft, type ThreadMessage } from "@/lib/store";

/**
 * Engagement signal computed from the share-link access log for this draft.
 * Tells the negotiation prompt how warm the buyer is BEFORE the reply landed.
 *
 * - viewCount === 0 → buyer never opened the proposal. Reply may be "not for us"
 *   or polite-decline. Soft re-pitch is appropriate.
 * - viewCount === 1, recent → buyer just opened it once and replied immediately.
 *   Hot lead. Lean into the deal-closing lever.
 * - viewCount >= 3 → buyer keeps coming back. Very hot. They're studying it,
 *   probably circulating internally. Worth a stronger offer.
 * - lastViewedAt > 48h ago → cold trail. Reply may be cordial but low intent.
 */
type EngagementSignal = {
  viewCount: number;
  lastViewedAt?: string;
  daysSinceLastView?: number;
  daysSinceFirstView?: number;
  // Cached label for the prompt — "cold | warm | hot | scorching"
  warmth: "cold" | "warm" | "hot" | "scorching" | "unknown";
};

async function computeEngagement(draft: OutreachDraft): Promise<EngagementSignal> {
  if (!draft.pipelineId || !draft.shareLinkToken) {
    return { viewCount: 0, warmth: "unknown" };
  }
  const run = await store.getPipelineRun(draft.pipelineId);
  if (!run) return { viewCount: 0, warmth: "unknown" };
  const views = (run.accessLog ?? []).filter((e) => e.linkToken === draft.shareLinkToken);
  if (views.length === 0) return { viewCount: 0, warmth: "cold" };

  // accessLog is stored newest-first
  const lastViewedAt = views[0].ts;
  const firstViewedAt = views[views.length - 1].ts;
  const dayMs = 24 * 60 * 60 * 1000;
  const daysSinceLastView = (Date.now() - new Date(lastViewedAt).getTime()) / dayMs;
  const daysSinceFirstView = (Date.now() - new Date(firstViewedAt).getTime()) / dayMs;

  let warmth: EngagementSignal["warmth"] = "warm";
  if (views.length >= 4 && daysSinceLastView < 1) warmth = "scorching";
  else if (views.length >= 2 && daysSinceLastView < 2) warmth = "hot";
  else if (daysSinceLastView > 2) warmth = "cold";

  return {
    viewCount: views.length,
    lastViewedAt,
    daysSinceLastView,
    daysSinceFirstView,
    warmth,
  };
}

const NEGOTIATION_TOOL = {
  name: "draft_counter_offer",
  description:
    "Read the buyer's reply and draft the next message in the negotiation thread. Output the counter-offer email, a short rationale, and a recommended action.",
  input_schema: {
    type: "object" as const,
    properties: {
      counter: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Subject line, ≤ 50 chars, lowercase-ish, no spam triggers" },
          body: {
            type: "string",
            description: "60-130 words. 3 short paragraphs max. Plain text. Address each concrete point in the buyer reply. Offer ONE specific lever (price, MOQ, terms, exclusivity) — not all of them.",
          },
        },
        required: ["subject", "body"],
      },
      summary: {
        type: "string",
        description: "1-2 sentence private rationale: what the buyer is signaling, what lever you chose, why.",
      },
      recommendedAction: {
        type: "string",
        enum: [
          "Send as-is",
          "Send after human review",
          "Escalate to human — buyer is hesitating",
          "Escalate to human — pricing pressure",
          "Walk away",
        ],
        description: "What you'd recommend the human operator do with this draft.",
      },
      sentimentBuyer: {
        type: "string",
        enum: ["enthusiastic", "interested", "neutral", "hesitant", "pushing-back"],
      },
    },
    required: ["counter", "summary", "recommendedAction", "sentimentBuyer"],
  },
};

type NegotiationToolPayload = {
  counter: { subject: string; body: string };
  summary: string;
  recommendedAction: string;
  sentimentBuyer: string;
};

function engagementBlock(e: EngagementSignal): string {
  if (e.warmth === "unknown") {
    return "## Engagement signal\n- (no tracked link for this draft — engagement unknown)";
  }
  const lines: string[] = [];
  lines.push(`- Tracked-link views: ${e.viewCount}`);
  if (e.lastViewedAt) {
    lines.push(
      `- Last opened: ${e.lastViewedAt} (${(e.daysSinceLastView ?? 0).toFixed(1)} days ago)`,
    );
  }
  if (e.viewCount === 0) {
    lines.push(
      "- Interpretation: buyer NEVER opened the proposal link. Reply may be a polite decline. Don't push hard — soft re-pitch with a different angle, or graceful exit.",
    );
  } else if (e.warmth === "scorching") {
    lines.push(
      "- Interpretation: SCORCHING lead. Buyer keeps coming back to the proposal — they're studying it, possibly circulating it internally. Lean into the close. A bolder lever (volume tier, exclusivity window) is appropriate here.",
    );
  } else if (e.warmth === "hot") {
    lines.push(
      "- Interpretation: HOT lead. Multiple recent views. They're seriously evaluating. Match the energy — concrete numbers, clear next step, short turnaround.",
    );
  } else if (e.warmth === "cold") {
    lines.push(
      "- Interpretation: opened the link earlier but it has been > 2 days. Engagement has cooled. Tighter, more specific lever — don't waste their time with throat-clearing.",
    );
  } else {
    lines.push(
      "- Interpretation: warm lead. Engaged but not deeply. Standard one-lever counter is fine.",
    );
  }
  return "## Engagement signal\n" + lines.join("\n");
}

function buildPrompt(input: {
  buyerCompany: string;
  buyerName: string;
  buyerTitle: string;
  productName: string;
  originalEmail: { subject: string; body: string };
  prior: ThreadMessage[];
  buyerReply: string;
  engagement: EngagementSignal;
}) {
  const priorBlock = input.prior
    .map((m) =>
      `### ${m.role === "buyer" ? "Buyer" : "Us"} · ${m.at}${m.subject ? ` · "${m.subject}"` : ""}\n${m.body}`
    )
    .join("\n\n");

  return `You are the Negotiation Agent in an AI commerce operating system. A buyer just replied to a wholesale-product outreach email. Your job: read the conversation, draft the next email from us (the seller), pick ONE lever to advance the deal.

## Buyer
- ${input.buyerName}, ${input.buyerTitle} at ${input.buyerCompany}
- Product under discussion: ${input.productName}

## Original outreach (from us)
Subject: ${input.originalEmail.subject}

${input.originalEmail.body}

${priorBlock ? `## Prior thread\n${priorBlock}\n\n` : ""}## Buyer's most recent reply
${input.buyerReply}

${engagementBlock(input.engagement)}

## Rules
- Use the buyer's first name in the greeting
- Address ONE specific point they raised — don't tackle everything
- Pick exactly ONE concession lever: price discount, lower MOQ, longer net terms, exclusivity window, free samples, free shipping, volume tier. Don't offer all of them at once.
- Factor the engagement signal into your tone and lever choice. Scorching/hot leads earn bolder offers and shorter timelines; cold leads need lighter touch and a different angle, not more pressure.
- Keep tone calm, peer-to-peer. No buzzwords. No exclamation marks.
- Sender: ${getOperator().name} from ${getOperator().company}. Sign with first name only.
- 60-130 words.
- If buyer is pushing back hard or asking for something we can't reasonably give, set recommendedAction to "Escalate to human — pricing pressure" and write a holding-pattern reply that buys 24-48h.

Call the draft_counter_offer tool.`;
}

function fakeCounter(input: {
  buyerName: string;
  buyerCompany: string;
  productName: string;
  buyerReply: string;
  engagement: EngagementSignal;
}): NegotiationToolPayload {
  const fn = input.buyerName.split(" ")[0];
  const op = getOperator();
  const sig = `${op.name}\n${op.title} · ${op.company}`;
  const lower = input.buyerReply.toLowerCase();
  const isPriceObjection = /price|cost|expensive|cheap|discount|margin/.test(lower);
  const isMoqObjection = /moq|minimum|quantity|small|test|trial/.test(lower);
  const isPushback = /not interested|pass|too high|never|stop/.test(lower);

  // If the buyer never opened the proposal link, default to a soft re-pitch
  // regardless of reply content. They might just be politely brushing off.
  if (input.engagement.warmth === "cold" && input.engagement.viewCount === 0 && !isPriceObjection && !isMoqObjection) {
    return {
      counter: {
        subject: `Different angle · ${input.productName}`,
        body: `Hi ${fn},\n\nNoticed the proposal didn't quite land. No worries — happy to switch gears. Would a 1-page market-fit summary be more useful, or is ${input.productName} just not on ${input.buyerCompany}'s radar this quarter?\n\nEither way, low pressure — just want to know if it's worth keeping you on a quiet update list.\n\n${sig}`,
      },
      summary: "Buyer never opened the tracked link (engagement=cold, 0 views). Soft re-pitch with a different format, no pressure.",
      recommendedAction: "Send after human review",
      sentimentBuyer: "neutral",
    };
  }

  if (isPushback) {
    return {
      counter: {
        subject: `Quick last note · ${input.buyerCompany}`,
        body: `Hi ${fn},\n\nFair enough. One option: I can keep ${input.productName} on a watchlist for ${input.buyerCompany} and ping you only if there's a meaningful price drop or exclusive terms in your category. Otherwise I'll close this thread.\n\nWhich would you prefer?\n\n${sig}`,
      },
      summary: "Buyer is pushing back. Offering a graceful exit + watchlist option to preserve the relationship.",
      recommendedAction: "Escalate to human — buyer is hesitating",
      sentimentBuyer: "pushing-back",
    };
  }
  if (isPriceObjection) {
    return {
      counter: {
        subject: `Sharper number · ${input.productName}`,
        body: `Hi ${fn},\n\nHeard you on pricing. I can drop unit cost 8% if we lock in a 12-month commit and stick to a single SKU configuration — that gives our supplier the volume signal to hold this number.\n\nIf that works, I'll send a redlined quote today and we close by end of week. If not, what number lands?\n\n${sig}`,
      },
      summary: "Buyer flagged price. Offered an 8% discount tied to 12-month commit (lever = volume + lock-in).",
      recommendedAction: "Send as-is",
      sentimentBuyer: "interested",
    };
  }
  if (isMoqObjection) {
    return {
      counter: {
        subject: `Smaller test order · ${input.productName}`,
        body: `Hi ${fn},\n\nMakes sense — you want to test before committing. I can drop MOQ from our standard run to 250 units for ${input.buyerCompany}'s first order, same per-unit price, same lead time. If it sells through, the second order goes back to standard volume + a small repeat discount.\n\nWant me to write that up?\n\n${sig}`,
      },
      summary: "Buyer wants smaller test. Offered MOQ relaxation (250 units) on first order only — protects margin.",
      recommendedAction: "Send as-is",
      sentimentBuyer: "interested",
    };
  }
  return {
    counter: {
      subject: `Re: ${input.productName} for ${input.buyerCompany}`,
      body: `Hi ${fn},\n\nThanks for the quick reply. To make this an easy yes for ${input.buyerCompany}, I can extend payment terms to net-45 on the first order — that takes the cash-flow risk off your plate while you see how the SKU performs.\n\nHappy to send the spec sheet + a redlined quote today. Want me to schedule a 15-min walkthrough this week?\n\n${sig}`,
    },
    summary: "Buyer engaged but didn't commit. Offered net-45 terms (lever = cash-flow risk reduction).",
    recommendedAction: "Send as-is",
    sentimentBuyer: "interested",
  };
}

export async function runNegotiation(input: {
  draftId: string;
  buyerReply: string;
}): Promise<{
  run: AgentRun;
  thread: ThreadMessage[];
  sentiment: string;
  recommendedAction: string;
  engagement: EngagementSignal;
}> {
  const draft = await store.getDraft(input.draftId);
  if (!draft) throw new Error(`Draft ${input.draftId} not found`);

  const startedAt = new Date();
  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const client = getAnthropicClient();
  const usedFallback = !client;

  const prior = draft.thread ?? [];
  const engagement = await computeEngagement(draft);

  // Append the buyer reply first
  const buyerMessage: ThreadMessage = {
    id: `m_${Date.now().toString(36)}_b`,
    role: "buyer",
    body: input.buyerReply,
    at: new Date().toISOString(),
  };

  let payload: NegotiationToolPayload;
  let inputTokens = 0;
  let outputTokens = 0;
  let errorMessage: string | undefined;
  let status: "success" | "error" = "success";

  try {
    if (!client) {
      payload = fakeCounter({
        buyerName: draft.buyerName,
        buyerCompany: draft.buyerCompany,
        productName: draft.productName,
        buyerReply: input.buyerReply,
        engagement,
      });
    } else {
      await checkSpendBudget();
      const res = await client.messages.create({
        model: MODEL_SMART,
        max_tokens: 1500,
        tools: [NEGOTIATION_TOOL],
        tool_choice: { type: "tool", name: NEGOTIATION_TOOL.name },
        messages: [
          {
            role: "user",
            content: buildPrompt({
              buyerCompany: draft.buyerCompany,
              buyerName: draft.buyerName,
              buyerTitle: draft.buyerTitle,
              productName: draft.productName,
              originalEmail: draft.email,
              prior,
              buyerReply: input.buyerReply,
              engagement,
            }),
          },
        ],
      });
      inputTokens = res.usage.input_tokens;
      outputTokens = res.usage.output_tokens;
      await recordSpend({ agent: "negotiation", cost: estimateCost(MODEL_SMART, inputTokens, outputTokens) });

      const toolUse = res.content.find((b) => b.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Model did not return a tool_use block");
      }
      payload = toolUse.input as NegotiationToolPayload;
    }
  } catch (e) {
    status = "error";
    errorMessage = e instanceof Error ? e.message : String(e);
    payload = fakeCounter({
      buyerName: draft.buyerName,
      buyerCompany: draft.buyerCompany,
      productName: draft.productName,
      buyerReply: input.buyerReply,
      engagement,
    });
  }

  const finishedAt = new Date();
  const cost = usedFallback ? undefined : estimateCost(MODEL_SMART, inputTokens, outputTokens);

  const counterMessage: ThreadMessage = {
    id: `m_${Date.now().toString(36)}_a`,
    role: "agent",
    subject: payload.counter.subject,
    body: payload.counter.body,
    at: finishedAt.toISOString(),
    runId,
    cost,
    summary: payload.summary,
    recommendedAction: payload.recommendedAction,
  };

  // Persist both messages — buyer reply first, then counter
  if (status === "success") {
    await store.appendToThread(draft.id, buyerMessage);
    await store.appendToThread(draft.id, counterMessage);
  }

  const run: AgentRun = {
    id: runId,
    agent: "negotiation",
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

  return {
    run,
    thread: [...prior, buyerMessage, counterMessage],
    sentiment: payload.sentimentBuyer,
    recommendedAction: payload.recommendedAction,
    engagement,
  };
}
