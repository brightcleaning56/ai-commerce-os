import { checkSpendBudget, estimateCost, getAnthropicClient, MODEL_SMART, recordSpend } from "@/lib/anthropic";
import { getOperator, getOperatorFirstName, getOperatorSignature } from "@/lib/operator";
import {
  store,
  type AgentRun,
  type BusinessRecord,
  type OutreachDraft,
} from "@/lib/store";

/**
 * Business Outreach Agent — different audience than the existing Outreach
 * Agent.
 *
 *   Outreach Agent          → AVYN operator pitches a PRODUCT to a BUYER
 *                              (the buyer would resell it)
 *   Business Outreach Agent → AVYN pitches AVYN ITSELF to a BUSINESS
 *                              (the business would sign up to use AVYN)
 *
 * The "product" pitched is AVYN — finding buyers + suppliers + automating
 * outreach. The agent personalizes per business: their industry, location,
 * and what AVYN can do for that specific shape of business.
 *
 * Output is still an OutreachDraft so it shows up in /outreach next to the
 * existing draft flow — operator reviews, edits, sends via /api/drafts/send.
 * The send route's findBuyerEmail() looks up business email when buyerId
 * starts with "biz_".
 */

const BUSINESS_OUTREACH_TOOL = {
  name: "draft_business_outreach",
  description:
    "Draft a personalized outreach package (email + LinkedIn message + SMS) pitching AVYN Commerce to a target business. Each channel must follow the rules in the system prompt.",
  input_schema: {
    type: "object" as const,
    properties: {
      email: {
        type: "object",
        properties: {
          subject: { type: "string", description: "≤ 50 chars, lowercase-ish, no exclamation marks, no spam triggers." },
          body: { type: "string", description: "70-110 words. 3 short paragraphs max. Plain text. No markdown. Reference one specific thing about THIS business (their industry, their location, their decision-maker if known). End with a single soft ask." },
        },
        required: ["subject", "body"],
      },
      linkedin: {
        type: "object",
        properties: {
          body: { type: "string", description: "≤ 50 words. Connection-request style. Mention AVYN naturally. End with a question or soft ask." },
        },
        required: ["body"],
      },
      sms: {
        type: "object",
        properties: {
          body: { type: "string", description: "≤ 160 chars. Casual tone. Identify the sender + AVYN + the ask. No emojis." },
        },
        required: ["body"],
      },
    },
    required: ["email", "linkedin", "sms"],
  },
};

type BusinessOutreachPayload = {
  email: { subject: string; body: string };
  linkedin: { body: string };
  sms: { body: string };
};

/**
 * What "AVYN solves for them" depends on the business shape.
 * The agent uses these hints to personalize the pitch — a roofing
 * contractor needs different things than a boutique e-commerce brand.
 */
function avynPitchAngleFor(b: BusinessRecord): string {
  const industry = (b.industry ?? "").toLowerCase();
  if (/(roof|construct|contractor|hvac|plumb|electric)/.test(industry)) {
    return "find better suppliers for shingles/lumber/safety gear, automate quote follow-ups";
  }
  if (/(retail|store|boutique|shop)/.test(industry)) {
    return "find trending wholesale products, automate buyer outreach to brands";
  }
  if (/(distributor|wholesal)/.test(industry)) {
    return "find new buyer chains for your product mix, automate the outreach + quote loop";
  }
  if (/(brand|manufactur|maker|cpg)/.test(industry)) {
    return "find retail + e-commerce buyers, automate first-touch + follow-ups";
  }
  if (/(restaur|food|bever|cafe|bar)/.test(industry)) {
    return "find better food/bev distributors, lock in pricing across vendors";
  }
  if (/(pet|vet|animal)/.test(industry)) {
    return "find pet supply distributors + automate buyer outreach to pet retailers";
  }
  if (/(health|dental|medical|clinic|wellness)/.test(industry)) {
    return "find equipment + supply vendors, automate quote requests";
  }
  if (/(beauty|cosmetic|salon|spa)/.test(industry)) {
    return "find product wholesalers + automate buyer outreach to beauty retailers";
  }
  return "find better suppliers and buyers + automate the outreach loop with AI";
}

/**
 * Optional pitch override — used when the brand-alternatives engine has
 * picked a specific alternative supplier to recommend to this business.
 * When set, the agent's pitch becomes "switch from <currentBrand> to
 * <alternative> because <rationale>" instead of the generic AVYN intro.
 */
export type PitchOverride = {
  currentBrand: string;          // brand the business currently uses
  alternative: string;           // the alternative we're suggesting they switch to
  rationale: string;             // 1-line "why" — surfaced verbatim in the email
};

function buildPrompt(b: BusinessRecord, pitchOverride?: PitchOverride): string {
  const op = getOperator();
  const angle = avynPitchAngleFor(b);
  const location = [b.city, b.state, b.zip].filter(Boolean).join(", ") || "their region";
  const dm = b.contactName ?? "";
  const dmTitle = b.contactTitle ?? "";
  const industry = b.aiProfile?.industryRefined || b.industry || "their business";

  // When the operator drives outreach via the Brand Alternatives flow,
  // the prompt's job changes: don't pitch AVYN abstractly, pitch a
  // concrete supplier swap. The rationale comes from the alternatives
  // store (Claude-generated, operator-reviewed).
  const pitchBlock = pitchOverride
    ? `\n\n## Specific pitch angle (overrides default)
This business currently sources from **${pitchOverride.currentBrand}**. AVYN connects them to
**${pitchOverride.alternative}**, who is a better fit because: ${pitchOverride.rationale}

Lead the email + LinkedIn with the supplier swap angle. Reference the original brand by name
and the alternative by name. Don't oversell — the rationale above is the entire claim. The
ask is: "want a 10-min intro to ${pitchOverride.alternative}?"`
    : "";

  // When a Profile Scan has run, surface its findings to the prompt so
  // the pitch can reference real signals from the business's homepage
  // ("I see you carry Brand X — we have a better supplier") instead of
  // staying at the generic industry level.
  const profileBlock = b.aiProfile && b.aiProfile.confidence >= 30
    ? `\n\n## What we know about this specific business (from homepage scan, confidence ${b.aiProfile.confidence}/100)
${b.aiProfile.summary ? `Summary: ${b.aiProfile.summary}\n` : ""}${b.aiProfile.productsSold.length > 0 ? `Products/services they sell: ${b.aiProfile.productsSold.join(", ")}\n` : ""}${b.aiProfile.likelySupplierBrands.length > 0 ? `Brands they currently use (likely suppliers): ${b.aiProfile.likelySupplierBrands.join(", ")}\n` : ""}${b.aiProfile.likelyDistributors.length > 0 ? `Channels they sell through: ${b.aiProfile.likelyDistributors.join(", ")}\n` : ""}
Reference ONE of these signals naturally in the email body — pick whichever feels most relevant. Don't list them; weave one in conversationally.`
    : "";

  return `You are the Business Outreach Agent for AVYN Commerce. Your job: draft a personalized first-touch outreach to a target business pitching AVYN's value.

## Target business
- Name: ${b.name}
- Industry: ${industry}
- Location: ${location}${dm ? `\n- Decision-maker: ${dm}${dmTitle ? `, ${dmTitle}` : ""}` : ""}${b.website ? `\n- Website: ${b.website}` : ""}${b.employeesBand ? `\n- Size: ${b.employeesBand} employees` : ""}${profileBlock}${pitchBlock}

## What AVYN does for THIS shape of business
${angle}

## Sender
${op.name}, ${op.title} at ${op.company}.
Sign emails with "${op.name}" on its own line, then "${op.title} · ${op.company}".

## Rules
- Greet by first name if a decision-maker is known; otherwise greet "Hi there" or use the company name naturally
- Reference one specific thing about this business (industry vertical, city, size, OR a signal from the homepage scan if confident) — feels personal, not blast
- The ask should be soft: "open to a 15-min call?" or "want me to send a 1-page overview?"
- No buzzwords ("synergy", "circle back", "leverage", "robust", "best-in-class"). No exclamation marks.
- Email: 70-110 words, plain text, 3 short paragraphs max
- LinkedIn: ≤ 50 words, connection-request style
- SMS: ≤ 160 chars, casual but professional. Identify yourself as ${op.name} from ${op.company}.
- Don't claim AVYN does things outside the angle above. Don't fake stats ("over 10,000 brands").${pitchOverride ? "\n- When the pitch angle is set, weave the supplier swap naturally — don't sound like a robocall reading off a script. The rationale is the proof; the ask is the intro." : ""}

Call the draft_business_outreach tool with the three channel drafts.`;
}

/**
 * Deterministic fallback when Anthropic isn't configured / errors out.
 * Mirrors the existing outreach agent's fakeDrafts pattern so /outreach
 * always has SOMETHING to render even with no API key.
 */
function fakeBusinessDrafts(b: BusinessRecord, pitchOverride?: PitchOverride): BusinessOutreachPayload {
  const op = getOperator();
  const opFirst = getOperatorFirstName();
  const sig = getOperatorSignature();
  const angle = avynPitchAngleFor(b);
  const greet = b.contactName ? `Hi ${b.contactName.split(" ")[0]}` : "Hi there";

  if (pitchOverride) {
    // Specific supplier-swap pitch fallback (Anthropic not configured).
    const subj = `Quick alt to ${pitchOverride.currentBrand}`;
    return {
      email: {
        subject: subj,
        body: `${greet},\n\nNoticed ${b.name} works with ${pitchOverride.currentBrand}. I run ${op.company} and we partner with ${pitchOverride.alternative} — ${pitchOverride.rationale}\n\nWant a 10-min intro to ${pitchOverride.alternative}? Happy to broker the conversation.\n\n${sig}`,
      },
      linkedin: {
        body: `${greet} — ${opFirst} from ${op.company}. We partner with ${pitchOverride.alternative} (alt to ${pitchOverride.currentBrand}). 10-min intro?`,
      },
      sms: {
        body: `Hey, ${opFirst} from ${op.company}. Alt to ${pitchOverride.currentBrand}: ${pitchOverride.alternative}. 10-min intro?`,
      },
    };
  }

  const cityBit = b.city ? `running ${b.industry ?? "things"} out of ${b.city}` : `working in ${b.industry ?? "your space"}`;

  return {
    email: {
      subject: `Quick note for ${b.name}`,
      body: `${greet},\n\nI run ${op.company} — we help businesses like yours ${angle}. Saw you're ${cityBit} and figured it was worth a 90-second intro.\n\nIf any of that's interesting, happy to send a 1-page overview or hop on a 15-min call this week. Whichever's easier?\n\n${sig}`,
    },
    linkedin: {
      body: `${greet} — ${opFirst} from ${op.company}. We help businesses ${angle.split(",")[0]}. Worth a quick chat?`,
    },
    sms: {
      body: `Hey, ${opFirst} from ${op.company}. We help ${b.industry ?? "businesses"} ${angle.split(",")[0].slice(0, 50)}. Worth a 15-min call this week?`,
    },
  };
}

/**
 * Draft outreach for a single BusinessRecord. Returns the new
 * OutreachDraft (saved to the store) and the AgentRun for cost tracking.
 *
 * Caller is responsible for the suppression check (isBusinessSuppressed)
 * BEFORE calling this — keeps the agent itself simple and testable.
 *
 * Dedupe: if a draft for this business already exists in the last
 * BUSINESS_OUTREACH_DEDUPE_DAYS days (default 30), returns the existing
 * draft instead of generating a new one. Default is longer than the
 * normal Outreach Agent dedupe (14 days) because business-acquisition
 * outreach burns goodwill faster than product pitches.
 */
function getDedupeWindowDays(): number {
  const raw = process.env.BUSINESS_OUTREACH_DEDUPE_DAYS;
  if (raw === undefined) return 30;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 30;
}

async function findRecentBusinessDraft(
  businessId: string,
  windowDays: number,
  productName?: string,
): Promise<OutreachDraft | null> {
  if (windowDays <= 0) return null;
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const drafts = await store.getDrafts();
  const targetProduct = productName?.trim().toLowerCase();
  for (const d of drafts) {
    if (d.status === "rejected") continue;
    if (d.buyerId !== businessId) continue;
    // When a pitchOverride is in play, dedupe is scoped to the same
    // alternative — operator can pitch a different alternative to the
    // same business inside the dedupe window without it being a dupe.
    if (targetProduct && d.productName.trim().toLowerCase() !== targetProduct) continue;
    const ts = new Date(d.createdAt).getTime();
    if (Number.isFinite(ts) && ts >= cutoff) return d;
  }
  return null;
}

export async function runBusinessOutreach(
  b: BusinessRecord,
  options: { pitchOverride?: PitchOverride } = {},
): Promise<{
  run: AgentRun;
  draft: OutreachDraft;
  deduped?: boolean;
}> {
  const { pitchOverride } = options;
  // The productName field doubles as the dedupe + insights key. When
  // pitching a specific alternative, encode the swap so the operator
  // can see what was pitched without opening the draft body.
  const productName = pitchOverride
    ? `Switch ${pitchOverride.currentBrand} → ${pitchOverride.alternative}`
    : "AVYN Commerce onboarding";

  // Dedupe first — don't burn Anthropic tokens or reputation re-pitching
  // the same business with the same angle. Operator can override by
  // deleting the existing draft, OR by setting
  // BUSINESS_OUTREACH_DEDUPE_DAYS=0.
  const dedupeDays = getDedupeWindowDays();
  const existing = await findRecentBusinessDraft(b.id, dedupeDays, productName);
  if (existing) {
    const synthetic: AgentRun = {
      id: existing.runId,
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
    return { run: synthetic, draft: existing, deduped: true };
  }

  const startedAt = new Date();
  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const draftId = `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const client = getAnthropicClient();
  const usedFallback = !client;

  let payload: BusinessOutreachPayload;
  let inputTokens = 0;
  let outputTokens = 0;
  let errorMessage: string | undefined;
  let runStatus: "success" | "error" = "success";

  try {
    if (!client) {
      payload = fakeBusinessDrafts(b, pitchOverride);
    } else {
      await checkSpendBudget();
      const res = await client.messages.create({
        model: MODEL_SMART,
        max_tokens: 1500,
        tools: [BUSINESS_OUTREACH_TOOL],
        tool_choice: { type: "tool", name: BUSINESS_OUTREACH_TOOL.name },
        messages: [{ role: "user", content: buildPrompt(b, pitchOverride) }],
      });
      inputTokens = res.usage.input_tokens;
      outputTokens = res.usage.output_tokens;
      await recordSpend({ agent: "outreach", cost: estimateCost(MODEL_SMART, inputTokens, outputTokens) });

      const toolUse = res.content.find((blk) => blk.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Model did not return a tool_use block");
      }
      payload = toolUse.input as BusinessOutreachPayload;
    }
  } catch (e) {
    runStatus = "error";
    errorMessage = e instanceof Error ? e.message : String(e);
    payload = fakeBusinessDrafts(b, pitchOverride);
  }

  const finishedAt = new Date();
  const cost = usedFallback ? undefined : estimateCost(MODEL_SMART, inputTokens, outputTokens);

  // Map BusinessRecord → OutreachDraft.
  // Key conventions:
  //   - buyerId starts with "biz_" so /api/drafts/send can route email
  //     lookup through store.getBusiness instead of the buyer/discovered
  //     stores. (Patched in /api/drafts/send/route.ts in this slice.)
  //   - productName = "AVYN Commerce onboarding" so dedupe + insights
  //     don't conflate these with product-pitch drafts.
  const draft: OutreachDraft = {
    id: draftId,
    runId,
    createdAt: finishedAt.toISOString(),
    buyerId: b.id,
    buyerCompany: b.name,
    buyerName: b.contactName ?? "",
    buyerTitle: b.contactTitle ?? "",
    productName,
    status: "draft",
    email: payload.email,
    linkedin: payload.linkedin,
    sms: payload.sms,
    modelUsed: usedFallback ? "fallback (no API key)" : MODEL_SMART,
    estCostUsd: cost,
    usedFallback,
  };

  if (runStatus === "success") {
    await store.saveDraft(draft);
  }

  const run: AgentRun = {
    id: runId,
    agent: "outreach",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    status: runStatus,
    inputCategory: b.industry ?? null,
    inputProductName: productName,
    productCount: 0,
    buyerCount: 1,
    modelUsed: usedFallback ? "fallback (no API key)" : MODEL_SMART,
    inputTokens: usedFallback ? undefined : inputTokens,
    outputTokens: usedFallback ? undefined : outputTokens,
    estCostUsd: cost,
    usedFallback,
    errorMessage,
  };
  await store.saveRun(run);
  return { run, draft };
}
