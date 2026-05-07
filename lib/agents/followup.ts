import { checkSpendBudget, estimateCost, getAnthropicClient, MODEL_SMART, recordSpend } from "@/lib/anthropic";
import { getOperator, getOperatorSignature } from "@/lib/operator";
import { store, type AgentRun, type OutreachDraft } from "@/lib/store";

/**
 * Configuration knobs for the auto-followup engine. Defaults tuned for cold
 * B2B wholesale outreach — adjust if you're in a faster-cycle category.
 */
export const FOLLOWUP_CONFIG = {
  /** Days since the original send before considering a follow-up. */
  DAYS_BEFORE_FOLLOWUP: 3,
  /** Maximum follow-ups in the chain. Prevents infinite re-pitches. */
  MAX_FOLLOWUP_DEPTH: 2,
  /** If buyer has viewed the link this many times, skip auto-followup —
   * they're engaged, just slow. The negotiation agent or a manual touch is better. */
  SKIP_IF_VIEWS_AT_LEAST: 1,
  /** Skip follow-up if the draft thread has any buyer reply at all. */
  SKIP_IF_BUYER_REPLIED: true,
};

const FOLLOWUP_TOOL = {
  name: "draft_followup",
  description:
    "Write a follow-up email for a buyer who has not replied to the original outreach and has not opened the tracked link. Different angle, lighter touch, easy out.",
  input_schema: {
    type: "object" as const,
    properties: {
      followup: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Subject line, ≤ 50 chars. Different from the original — fresh angle. Lowercase-ish, no spam triggers." },
          body: {
            type: "string",
            description: "60-110 words, plain text. Reference no-reply WITHOUT pressure. Offer a specific, lower-friction option (e.g., 1-page summary, single sample, 5-minute call). Easy graceful exit ('let me know if not the right time').",
          },
        },
        required: ["subject", "body"],
      },
      summary: {
        type: "string",
        description: "1 sentence rationale: what angle you chose and why.",
      },
    },
    required: ["followup", "summary"],
  },
};

type FollowupToolPayload = {
  followup: { subject: string; body: string };
  summary: string;
};

function buildPrompt(input: {
  buyerCompany: string;
  buyerName: string;
  buyerTitle: string;
  productName: string;
  originalEmail: { subject: string; body: string };
  daysSinceSent: number;
  followupNumber: number;
  hasOpens: boolean;
}) {
  const opensLine = input.hasOpens
    ? "- Buyer has opened the proposal but never replied — they're at least curious."
    : "- Buyer has NOT opened the proposal link or replied — silence is loud, the original angle didn't land.";
  return `You are the Follow-up Agent. Your job is to write ONE follow-up email to a buyer who went silent after our original outreach. Goal: re-open the door without being pushy.

## Buyer
- ${input.buyerName}, ${input.buyerTitle} at ${input.buyerCompany}
- Product: ${input.productName}

## Original outreach (subject + body)
Subject: ${input.originalEmail.subject}

${input.originalEmail.body}

## Context
- ${input.daysSinceSent.toFixed(0)} days since we sent the original
- This is follow-up #${input.followupNumber} in the chain (max 2 in this system)
${opensLine}

## Rules
- Different angle from the original — don't repeat the same pitch
- Lighter touch: smaller ask (1-page summary, single sample, 5-min call), not a full deal
- Acknowledge silence WITHOUT guilt-tripping or "circling back" cliché
- One clean sentence offering a graceful exit ("let me know if it's not the right time")
- 60-110 words, plain text
- Sender: ${getOperator().name} from ${getOperator().company}. Sign with first name only.
- No exclamation marks. No "just checking in." No "did you see my last email."

Call the draft_followup tool.`;
}

function fakeFollowup(input: {
  buyerName: string;
  buyerCompany: string;
  productName: string;
  followupNumber: number;
  hasOpens: boolean;
}): FollowupToolPayload {
  const fn = input.buyerName.split(" ")[0];
  const sig = getOperatorSignature();
  if (input.hasOpens) {
    return {
      followup: {
        subject: `Lighter ask · ${input.productName}`,
        body: `Hi ${fn},\n\nNoticed you took a look at the proposal. If the full deal isn't quite the right fit right now, I can send a 1-page market-fit summary you can forward internally — no commitment, just the data.\n\nOr a single sample to test on your floor.\n\nWhich is more useful, or should I park this for a quieter quarter?\n\n${sig}`,
      },
      summary: "Buyer opened but didn't reply. Offering smaller-friction options (1-page summary, single sample) and a graceful exit.",
    };
  }
  return {
    followup: {
      subject: `Different angle · ${input.productName}`,
      body: `Hi ${fn},\n\nMy original note may have arrived at a busy moment. Skipping the pitch this time — just a quick offer: I can send a single sample of ${input.productName} to ${input.buyerCompany} so your team can evaluate without any commitment on either side.\n\nIf that's still not useful, totally fine — just let me know and I'll close the loop.\n\n${sig}`,
    },
    summary: "Buyer never opened — silent. Switching to a sample-first offer (lighter ask) with a clear graceful exit.",
  };
}

/**
 * Find drafts eligible for an auto-followup right now.
 *
 * Eligibility:
 *  - status === "sent" (we actually delivered the original)
 *  - daysSinceSent >= FOLLOWUP_CONFIG.DAYS_BEFORE_FOLLOWUP
 *  - no buyer reply in thread (if SKIP_IF_BUYER_REPLIED)
 *  - view count below the engagement threshold
 *  - depth < MAX_FOLLOWUP_DEPTH (counted via parentDraftId chain)
 *  - no existing follow-up child for THIS draft (prevents same-cron-tick duplicates)
 */
export async function findFollowupCandidates(): Promise<Array<{
  draft: OutreachDraft;
  daysSinceSent: number;
  views: number;
  depth: number;
}>> {
  const drafts = await store.getDrafts();
  const candidates: Array<{
    draft: OutreachDraft;
    daysSinceSent: number;
    views: number;
    depth: number;
  }> = [];

  // Build a quick set of draft IDs that already have a follow-up child
  const hasChild = new Set<string>();
  for (const d of drafts) {
    if (d.parentDraftId) hasChild.add(d.parentDraftId);
  }

  for (const d of drafts) {
    if (d.status !== "sent") continue;
    if (!d.sentAt) continue;
    if (hasChild.has(d.id)) continue; // already has a follow-up

    const daysSinceSent = (Date.now() - new Date(d.sentAt).getTime()) / (24 * 3600 * 1000);
    if (daysSinceSent < FOLLOWUP_CONFIG.DAYS_BEFORE_FOLLOWUP) continue;

    if (FOLLOWUP_CONFIG.SKIP_IF_BUYER_REPLIED) {
      const buyerMessages = (d.thread ?? []).filter((m) => m.role === "buyer").length;
      if (buyerMessages > 0) continue;
    }

    // Compute depth: walk up the parent chain
    let depth = 0;
    let cursor: OutreachDraft | undefined = d;
    while (cursor?.parentDraftId) {
      depth++;
      cursor = drafts.find((x) => x.id === cursor!.parentDraftId);
      if (depth > 10) break; // safety
    }
    if (depth >= FOLLOWUP_CONFIG.MAX_FOLLOWUP_DEPTH) continue;

    // Check view count via parent pipeline run
    let views = 0;
    if (d.pipelineId && d.shareLinkToken) {
      const run = await store.getPipelineRun(d.pipelineId);
      if (run) {
        views = (run.accessLog ?? []).filter((e) => e.linkToken === d.shareLinkToken).length;
      }
    }
    if (views >= FOLLOWUP_CONFIG.SKIP_IF_VIEWS_AT_LEAST + 1) continue;

    candidates.push({ draft: d, daysSinceSent, views, depth });
  }

  return candidates;
}

/**
 * Generate a follow-up draft for one parent draft. Persists the new draft
 * with status="draft" — requires human approval before it sends.
 *
 * Idempotency: if a follow-up child already exists for this parent, returns
 * the existing one instead of creating a duplicate.
 */
export async function runFollowup(parentId: string): Promise<{
  run: AgentRun;
  newDraft: OutreachDraft;
  alreadyExisted: boolean;
}> {
  const parent = await store.getDraft(parentId);
  if (!parent) throw new Error(`Parent draft ${parentId} not found`);
  if (parent.status !== "sent") {
    throw new Error(`Cannot follow up on a draft with status="${parent.status}"`);
  }

  // Idempotency check
  const existing = (await store.getDrafts()).find((x) => x.parentDraftId === parentId);
  if (existing) {
    // Return a synthetic AgentRun for symmetry with the create path
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
    return { run: synthetic, newDraft: existing, alreadyExisted: true };
  }

  const startedAt = new Date();
  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const client = getAnthropicClient();
  const usedFallback = !client;

  // Engagement context
  let views = 0;
  if (parent.pipelineId && parent.shareLinkToken) {
    const run = await store.getPipelineRun(parent.pipelineId);
    if (run) {
      views = (run.accessLog ?? []).filter((e) => e.linkToken === parent.shareLinkToken).length;
    }
  }

  // Compute depth + followup number
  let followupNumber = 1;
  let cursor: OutreachDraft | undefined = parent;
  while (cursor?.parentDraftId) {
    followupNumber++;
    cursor = (await store.getDraft(cursor.parentDraftId)) ?? undefined;
    if (followupNumber > 10) break;
  }

  const daysSinceSent = parent.sentAt
    ? (Date.now() - new Date(parent.sentAt).getTime()) / (24 * 3600 * 1000)
    : 0;

  let payload: FollowupToolPayload;
  let inputTokens = 0;
  let outputTokens = 0;
  let errorMessage: string | undefined;
  let status: "success" | "error" = "success";

  try {
    if (!client) {
      payload = fakeFollowup({
        buyerName: parent.buyerName,
        buyerCompany: parent.buyerCompany,
        productName: parent.productName,
        followupNumber,
        hasOpens: views > 0,
      });
    } else {
      await checkSpendBudget();
      const res = await client.messages.create({
        model: MODEL_SMART,
        max_tokens: 1200,
        tools: [FOLLOWUP_TOOL],
        tool_choice: { type: "tool", name: FOLLOWUP_TOOL.name },
        messages: [
          {
            role: "user",
            content: buildPrompt({
              buyerCompany: parent.buyerCompany,
              buyerName: parent.buyerName,
              buyerTitle: parent.buyerTitle,
              productName: parent.productName,
              originalEmail: parent.email,
              daysSinceSent,
              followupNumber,
              hasOpens: views > 0,
            }),
          },
        ],
      });
      inputTokens = res.usage.input_tokens;
      outputTokens = res.usage.output_tokens;
      await recordSpend({ agent: "followup", cost: estimateCost(MODEL_SMART, inputTokens, outputTokens) });
      const toolUse = res.content.find((b) => b.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Model did not return a tool_use block");
      }
      payload = toolUse.input as FollowupToolPayload;
    }
  } catch (e) {
    status = "error";
    errorMessage = e instanceof Error ? e.message : String(e);
    payload = fakeFollowup({
      buyerName: parent.buyerName,
      buyerCompany: parent.buyerCompany,
      productName: parent.productName,
      followupNumber,
      hasOpens: views > 0,
    });
  }

  const finishedAt = new Date();
  const cost = usedFallback ? undefined : estimateCost(MODEL_SMART, inputTokens, outputTokens);

  const reason =
    views === 0
      ? `${daysSinceSent.toFixed(0)}d since send, no opens`
      : `${daysSinceSent.toFixed(0)}d since send, opened but no reply`;

  // Reuse the parent's LinkedIn/SMS bodies as a sensible default — the human
  // can edit before sending. Generating fresh ones would 3x the cost for marginal value.
  const newDraft: OutreachDraft = {
    id: `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    runId,
    pipelineId: parent.pipelineId,
    createdAt: finishedAt.toISOString(),
    buyerId: parent.buyerId,
    buyerCompany: parent.buyerCompany,
    buyerName: parent.buyerName,
    buyerTitle: parent.buyerTitle,
    productName: parent.productName,
    status: "draft",
    email: payload.followup,
    linkedin: parent.linkedin,
    sms: parent.sms,
    modelUsed: usedFallback ? "fallback (no API key)" : MODEL_SMART,
    estCostUsd: cost,
    usedFallback,
    parentDraftId: parent.id,
    followupNumber,
    followupReason: reason,
  };

  if (status === "success") {
    await store.saveDraft(newDraft);
  }

  const run: AgentRun = {
    id: runId,
    agent: "outreach",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    status,
    inputCategory: null,
    inputProductName: parent.productName,
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

  return { run, newDraft, alreadyExisted: false };
}
