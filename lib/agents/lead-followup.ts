import {
  checkSpendBudget,
  estimateCost,
  getAnthropicClient,
  MODEL_SMART,
  recordSpend,
} from "@/lib/anthropic";
import type { Lead } from "@/lib/store";

export type LeadFollowupResult = {
  subject: string;
  body: string;          // plain text email body
  smsBody?: string;      // short SMS variant (<=160 chars) when phone present
  model: string;         // identifier used (or "fallback" when no API key)
  estCostUsd?: number;
  usedFallback: boolean;
};

const TOOL = {
  name: "lead_followup",
  description:
    "Compose a warm, concise first-touch outreach to a fresh inbound lead. " +
    "The lead just filled out a form on the AVYN Commerce site. The reply " +
    "should thank them by first name, reflect their stated goal back, propose " +
    "one specific next step (booking a 15-min call), and feel like it's from " +
    "a real human founder — not a template. Avoid corporate jargon, exclamation " +
    "marks, em-dashes overuse, or 'I hope this email finds you well'.",
  input_schema: {
    type: "object" as const,
    properties: {
      subject: {
        type: "string",
        description:
          "Subject line. Max 70 chars. Conversational, references the lead's " +
          "company or goal. Sentence case (don't Title Case).",
      },
      body: {
        type: "string",
        description:
          "Plain-text email body. 4-8 short sentences across 2-3 paragraphs. " +
          "Start with 'Hi {FirstName},'. Mention their company by name. " +
          "Reflect their stated goal/use case briefly. Propose a 15-min call. " +
          "Sign off with 'Eric Moore · Founder, AVYN Commerce'. No bullet lists.",
      },
      smsBody: {
        type: "string",
        description:
          "Optional SMS variant. ONLY include if it adds value beyond email. " +
          "Max 160 chars. No links unless absolutely necessary. " +
          "Stop with the founder's first name only.",
      },
    },
    required: ["subject", "body"],
  },
};

function fakeFollowup(lead: Lead): LeadFollowupResult {
  const first = lead.name.split(" ")[0] || "there";
  const goal =
    lead.useCases?.[0] === "find-buyers"
      ? "finding new buyers"
      : lead.useCases?.[0] === "find-products"
        ? "sourcing winning products"
        : lead.useCases?.[0] === "automate-outbound"
          ? "automating outbound"
          : "scaling revenue with AI";
  const subject = `Got your note — ${lead.company}`;
  const body =
    `Hi ${first},\n\n` +
    `Thanks for reaching out about ${goal} at ${lead.company}. ` +
    `I run AVYN Commerce and saw your request come through a minute ago.\n\n` +
    `Quick question to help me come back with something useful: are you ` +
    `currently doing outbound manually, or is this entirely new territory? ` +
    `Either way I can pull together a 15-min walk-through of how the agent ` +
    `stack would map to your goal — usually faster than going through a deck.\n\n` +
    `If you'd rather I just send numbers + a couple of customer examples by ` +
    `email, reply with "send the email" and I'll do that instead.\n\n` +
    `Eric Moore · Founder, AVYN Commerce`;
  const smsBody =
    `Hi ${first} — Eric from AVYN. Got your note about ${lead.company}. ` +
    `Want a 15-min walk-through, or should I send numbers by email? Eric`;
  return {
    subject,
    body,
    smsBody: smsBody.length <= 320 ? smsBody : undefined,
    model: "fallback (no API key)",
    usedFallback: true,
  };
}

function buildPrompt(lead: Lead): string {
  const bookingUrl = (process.env.BOOKING_URL ?? "").trim();
  const callInstruction = bookingUrl
    ? `Suggest a 15-min call as the next step and include EXACTLY this link inline: ${bookingUrl}`
    : `Suggest a 15-min call as the next step and ask them to reply with two ` +
      `times that work in their timezone. Do NOT invent a booking link or ` +
      `placeholder like <BOOKING_LINK> — Eric will follow up to schedule.`;

  const lines: (string | null)[] = [
    `You're composing the first reply from Eric Moore (founder of AVYN Commerce) `,
    `to a fresh inbound lead who just filled out our /contact or /signup form. `,
    `The reply should feel personal and short — not a templated drip email.\n\n`,
    `LEAD DETAILS:\n`,
    `- Name: ${lead.name}`,
    `- Company: ${lead.company}`,
    lead.industry ? `- Industry: ${lead.industry}` : null,
    lead.companySize ? `- Company size: ${lead.companySize}` : null,
    lead.phone ? `- Phone provided: yes` : null,
    lead.useCases?.length ? `- Stated goals: ${lead.useCases.join(", ")}` : null,
    lead.timeline ? `- Timeline: ${lead.timeline}` : null,
    lead.budget ? `- Budget signal: ${lead.budget}` : null,
    lead.message ? `- Their own message: "${lead.message}"` : null,
    `- Source: ${lead.source}`,
    ``,
    `Compose subject + body now. Body must address them by first name. `,
    `Keep total length to 4-8 sentences. ${callInstruction} `,
    `Sign off "Eric Moore · Founder, AVYN Commerce".`,
    ``,
    `Also write an optional SMS variant (max 160 chars) only if their phone was provided.`,
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * Strip any placeholder-style tokens the model might still hallucinate
 * (<BOOKING_LINK>, [CALENDAR_URL], {{LINK}}, etc.) so they never reach a
 * real lead's inbox even if the prompt instruction is ignored.
 */
function scrubPlaceholders(text: string): string {
  return text
    .replace(/[<\[{]{1,2}\s*(BOOKING_LINK|CALENDAR_URL|CALENDLY|MEETING_LINK|LINK|URL)\s*[>\]}]{1,2}/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Generate a personalized first-touch reply for a fresh inbound lead.
 *
 * Falls back to a deterministic template when no Anthropic key is configured
 * so the email still goes out (and the lead never sits in silence). The
 * fallback is honest copy from "Eric Moore · Founder" — no fake first names
 * or invented details — so even in degraded mode the lead gets a real reply.
 */
export async function generateLeadFollowup(lead: Lead): Promise<LeadFollowupResult> {
  const client = getAnthropicClient();
  if (!client) return fakeFollowup(lead);

  let inputTokens = 0;
  let outputTokens = 0;
  try {
    await checkSpendBudget();
    const res = await client.messages.create({
      model: MODEL_SMART,
      max_tokens: 800,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: buildPrompt(lead) }],
    });
    inputTokens = res.usage.input_tokens;
    outputTokens = res.usage.output_tokens;
    await recordSpend({ agent: "outreach", cost: estimateCost(MODEL_SMART, inputTokens, outputTokens) });

    const toolUse = res.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("Model did not return a tool_use block");
    }
    const payload = toolUse.input as { subject: string; body: string; smsBody?: string };
    return {
      subject: scrubPlaceholders(payload.subject).slice(0, 200),
      body: scrubPlaceholders(payload.body).slice(0, 5000),
      smsBody: payload.smsBody ? scrubPlaceholders(payload.smsBody).slice(0, 320) : undefined,
      model: MODEL_SMART,
      estCostUsd: estimateCost(MODEL_SMART, inputTokens, outputTokens),
      usedFallback: false,
    };
  } catch {
    // Any Anthropic failure → fall back to the deterministic template so the
    // lead still gets a reply within seconds of submitting.
    return fakeFollowup(lead);
  }
}
