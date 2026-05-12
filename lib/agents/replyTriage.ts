import { checkSpendBudget, estimateCost, getAnthropicClient, MODEL_SMART, recordSpend } from "@/lib/anthropic";
import { getOperator, getOperatorSignature } from "@/lib/operator";
import { store, type AgentRun, type OutreachDraft, type ThreadMessage } from "@/lib/store";

/**
 * Reply Triage Agent — when a buyer replies to an outreach draft, this
 * agent reads the full thread + the latest buyer message and proposes
 * 1-3 alternative responses the operator can pick from.
 *
 * Different from the existing Negotiation Agent (lib/agents/negotiation.ts):
 *   - Negotiation agent: ONE counter-offer, automatically appended to the
 *     thread, intended as a final response.
 *   - Reply Triage agent: 1-3 OPTIONS the operator picks from (e.g.
 *     "Accept the call" / "Counter on price" / "Decline politely").
 *     Stored on draft.suggestedReplies; operator picks one + clicks Send
 *     → email goes out (with CAN-SPAM footer) + appends to thread.
 *
 * Each suggestion includes an actionLabel so the operator can scan in
 * 3 seconds: Accept / Counter / Decline / Clarify / Schedule / Other.
 *
 * Cost: ~$0.01-0.02 per generation (Sonnet, ~1.5K out tokens for 3
 * suggestions). Cheaper than misfired manual replies.
 */

const TRIAGE_TOOL = {
  name: "suggest_replies",
  description:
    "Read the buyer's latest reply + the outreach context, then propose 1-3 alternative responses the operator can pick from. Each must have a distinct action angle (don't return three near-identical 'Accept' suggestions).",
  input_schema: {
    type: "object" as const,
    properties: {
      suggestions: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            actionLabel: {
              type: "string",
              enum: ["Accept", "Counter", "Decline", "Clarify", "Schedule", "Other"],
              description: "What this response is fundamentally doing. Operator scans this first.",
            },
            subject: {
              type: "string",
              description: "Subject line. Lead with 'Re: ' if continuing the existing thread. ≤ 70 chars.",
            },
            body: {
              type: "string",
              description: "70-120 words, plain text, 3 short paragraphs max. Addresses the buyer's reply directly. NO buzzwords ('synergy', 'circle back', 'leverage'). NO exclamation marks. Sign with operator's name on its own line.",
            },
            rationale: {
              type: "string",
              description: "ONE sentence the operator reads to understand WHY this option exists (e.g. 'Buyer asked for a 15% discount — this counters at 8% with a volume commitment'). ≤ 140 chars.",
            },
            confidence: {
              type: "integer",
              minimum: 30,
              maximum: 100,
              description: "Your honest self-rating of how well this response fits the buyer's signal. 90+ when the buyer was crystal-clear; 50-70 when the reply was ambiguous and you're hedging.",
            },
          },
          required: ["actionLabel", "subject", "body", "rationale", "confidence"],
        },
      },
    },
    required: ["suggestions"],
  },
};

type TriagePayload = {
  suggestions: Array<{
    actionLabel: "Accept" | "Counter" | "Decline" | "Clarify" | "Schedule" | "Other";
    subject: string;
    body: string;
    rationale: string;
    confidence: number;
  }>;
};

function buildPrompt(draft: OutreachDraft, latestBuyerMessage: ThreadMessage): string {
  const op = getOperator();
  const threadHistory = (draft.thread ?? [])
    .map(
      (m) =>
        `[${m.role === "buyer" ? draft.buyerCompany : op.company} · ${new Date(m.at).toISOString().slice(0, 10)}]\n${m.body}`,
    )
    .join("\n\n---\n\n");

  return `You are the Reply Triage Agent for AVYN Commerce. A buyer just replied to one of ${op.name}'s outreach emails. Your job: propose 1-3 alternative responses the operator can pick from, each with a distinct angle.

## The original outreach we sent
Subject: ${draft.email?.subject ?? "(no subject)"}
Body:
${draft.email?.body ?? "(no body)"}

## Thread so far
${threadHistory || "(no prior messages — this is the buyer's first reply)"}

## Buyer's latest reply (just landed — this is what you're responding to)
${latestBuyerMessage.body}

## Buyer context
- Company: ${draft.buyerCompany}
- Decision-maker: ${draft.buyerName}${draft.buyerTitle ? `, ${draft.buyerTitle}` : ""}
- Product pitched: ${draft.productName}

## Sender (this is who the response goes out as)
${op.name}, ${op.title} at ${op.company}.
Sign bodies with "${op.name}" on its own line, then "${op.title} · ${op.company}".

## Rules for each suggestion
- Address the buyer's reply DIRECTLY. Cite specifics they mentioned.
- Each suggestion takes a DIFFERENT angle (don't return three "Accept" variants — vary action labels)
- The ask should be soft + concrete (e.g. "Tuesday 3pm work for a call?" beats "let me know")
- 70-120 words, plain text, 3 short paragraphs max
- Subject leads with "Re: " for thread continuity
- NO buzzwords. NO exclamation marks. Match the buyer's tone (formal vs casual) from the reply
- If the buyer's reply is short ("not interested", "wrong person"), the right move is often Decline politely OR Clarify with a 1-line follow-up — don't force three options when one is clearly right; return fewer
- Confidence is your honest read: high (90+) when buyer was clear, low (40-60) when ambiguous

Call the suggest_replies tool.`;
}

function fallbackSuggestions(draft: OutreachDraft, latestBuyerMessage: ThreadMessage): TriagePayload {
  const op = getOperator();
  const sig = getOperatorSignature();
  const fn = (draft.buyerName ?? "").split(" ")[0] || "there";
  return {
    suggestions: [
      {
        actionLabel: "Schedule",
        subject: `Re: ${draft.email?.subject ?? draft.productName}`,
        body: `Hi ${fn},\n\nThanks for getting back to me. Happy to walk you through it on a 15-min call — would Tuesday 3pm or Thursday 10am work?\n\n${sig}`,
        rationale: "Generic schedule-a-call response — Anthropic not configured, this is a placeholder.",
        confidence: 0,
      },
    ],
  };
}

/**
 * Generate suggestions for the latest buyer reply on a draft.
 *
 * Idempotent: if the draft already has suggestions keyed to this exact
 * buyer message (same basedOnMessageId), skip — operator can manually
 * regenerate via the POST endpoint if they want fresh options.
 */
export async function runReplyTriage(draftId: string): Promise<{
  run: AgentRun;
  generated: NonNullable<OutreachDraft["suggestedReplies"]>;
  skipped?: "no-buyer-message" | "already-suggested" | "draft-not-found";
}> {
  const draft = await store.getDraft(draftId);
  if (!draft) {
    const synthetic: AgentRun = {
      id: `run_skip_${Date.now().toString(36)}`,
      agent: "negotiation",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      status: "error",
      inputCategory: null,
      productCount: 0,
      modelUsed: "n/a",
      usedFallback: true,
      errorMessage: "draft not found",
    };
    return { run: synthetic, generated: [], skipped: "draft-not-found" };
  }

  // Find the latest buyer message — that's what we're responding to
  const buyerMessages = (draft.thread ?? []).filter((m) => m.role === "buyer");
  const latest = buyerMessages[buyerMessages.length - 1];
  if (!latest) {
    const synthetic: AgentRun = {
      id: `run_skip_${Date.now().toString(36)}`,
      agent: "negotiation",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      status: "success",
      inputCategory: null,
      productCount: 0,
      modelUsed: "n/a",
      usedFallback: true,
    };
    return { run: synthetic, generated: [], skipped: "no-buyer-message" };
  }

  // Idempotency: skip if we've already generated suggestions for this
  // exact buyer message AND none of them have been sent yet (operator
  // hasn't acted; no need to burn tokens regenerating identical options).
  const existing = (draft.suggestedReplies ?? []).filter(
    (s) => s.basedOnMessageId === latest.id && !s.discardedAt && !s.sentAt,
  );
  if (existing.length > 0) {
    const synthetic: AgentRun = {
      id: `run_dedupe_${Date.now().toString(36)}`,
      agent: "negotiation",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      status: "success",
      inputCategory: null,
      productCount: 0,
      modelUsed: existing[0].modelUsed,
      usedFallback: existing[0].usedFallback,
    };
    return { run: synthetic, generated: existing, skipped: "already-suggested" };
  }

  const startedAt = new Date();
  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const client = getAnthropicClient();
  const usedFallback = !client;

  let payload: TriagePayload;
  let inputTokens = 0;
  let outputTokens = 0;
  let errorMessage: string | undefined;
  let runStatus: "success" | "error" = "success";

  try {
    if (!client) {
      payload = fallbackSuggestions(draft, latest);
    } else {
      await checkSpendBudget();
      const res = await client.messages.create({
        model: MODEL_SMART,
        max_tokens: 2500,
        tools: [TRIAGE_TOOL],
        tool_choice: { type: "tool", name: TRIAGE_TOOL.name },
        messages: [{ role: "user", content: buildPrompt(draft, latest) }],
      });
      inputTokens = res.usage.input_tokens;
      outputTokens = res.usage.output_tokens;
      await recordSpend({ agent: "negotiation", cost: estimateCost(MODEL_SMART, inputTokens, outputTokens) });

      const toolUse = res.content.find((b) => b.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") throw new Error("Model did not return a tool_use block");
      payload = toolUse.input as TriagePayload;
    }
  } catch (e) {
    runStatus = "error";
    errorMessage = e instanceof Error ? e.message : String(e);
    payload = fallbackSuggestions(draft, latest);
  }

  const finishedAt = new Date();
  const cost = usedFallback ? undefined : estimateCost(MODEL_SMART, inputTokens, outputTokens);

  // Build the SuggestedReply records — each gets its own id so operator
  // can target one specifically (send / discard).
  const generated: NonNullable<OutreachDraft["suggestedReplies"]> = payload.suggestions.map((s) => ({
    id: `sug_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`,
    generatedAt: finishedAt.toISOString(),
    basedOnMessageId: latest.id,
    actionLabel: s.actionLabel,
    subject: s.subject,
    body: s.body,
    rationale: s.rationale,
    confidence: Math.max(0, Math.min(100, Math.round(s.confidence))),
    modelUsed: usedFallback ? "fallback" : MODEL_SMART,
    estCostUsd: cost,
    usedFallback,
  }));

  // Append (never replace) — operator may regenerate later and we want
  // the history. UI filters to "non-sent, non-discarded, based on latest buyer msg".
  const existingAll = draft.suggestedReplies ?? [];
  await store.patchDraft(draft.id, {
    suggestedReplies: [...existingAll, ...generated],
  });

  const run: AgentRun = {
    id: runId,
    agent: "negotiation",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    status: runStatus,
    inputCategory: null,
    inputProductName: draft.productName,
    productCount: 0,
    modelUsed: usedFallback ? "fallback" : MODEL_SMART,
    inputTokens: usedFallback ? undefined : inputTokens,
    outputTokens: usedFallback ? undefined : outputTokens,
    estCostUsd: cost,
    usedFallback,
    errorMessage,
  };
  await store.saveRun(run);
  return { run, generated };
}
