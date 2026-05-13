/**
 * Call-prep agent — generates 3-5 talking points the operator can use
 * during an outbound phone call. Surfaces in the /tasks call session
 * drawer above the Place Call button.
 *
 * Pattern: Anthropic Haiku (cheap), tool-use enforced output schema,
 * deterministic fallback when the API key is missing.
 */
import { callClaudeWithBudget, getAnthropicClient, MODEL_CHEAP } from "@/lib/anthropic";
import { checkKillSwitch } from "@/lib/killSwitch";

export type CallPrepInput = {
  buyerName: string;
  buyerTitle?: string;
  buyerCompany: string;
  buyerIndustry?: string;
  buyerType?: string;
  intentScore?: number;
  rationale?: string;          // why the agent surfaced this buyer
  forProduct?: string;          // what we're pitching
  recentAttempts?: Array<{
    outcome: string;
    notes?: string;
    daysAgo: number;
  }>;
};

export type CallPrepResult = {
  ok: boolean;
  talkingPoints: string[];     // 3-5 bullets, ≤ 22 words each
  opener: string;               // first-line opening hook
  closer: string;               // suggested next step
  model: string;
  estCostUsd?: number;
  usedFallback: boolean;
  errorMessage?: string;
};

/**
 * Generate the talking points. Never throws -- returns ok:false with
 * fallback content when something goes wrong (no API key, kill switch,
 * Anthropic 5xx, etc).
 */
export async function runCallPrep(input: CallPrepInput): Promise<CallPrepResult> {
  // Kill-switch gate -- consistent with every other agent entry point
  const ks = await checkKillSwitch();
  if (ks.killed) {
    return {
      ...fallback(input),
      ok: false,
      errorMessage: `Kill switch active${ks.state.reason ? ` — ${ks.state.reason}` : ""}`,
    };
  }

  const client = getAnthropicClient();
  if (!client) return fallback(input);

  // Compose the prompt with everything the operator would want the AI
  // to consider: who they are, why we surfaced them, what to pitch,
  // what we already tried.
  const lines: string[] = [];
  lines.push(`Buyer: ${input.buyerName}${input.buyerTitle ? ` (${input.buyerTitle})` : ""} at ${input.buyerCompany}`);
  if (input.buyerIndustry) lines.push(`Industry: ${input.buyerIndustry}`);
  if (input.buyerType) lines.push(`Type: ${input.buyerType}`);
  if (input.intentScore != null) lines.push(`Intent score: ${input.intentScore}/100`);
  if (input.forProduct) lines.push(`Pitching: ${input.forProduct}`);
  if (input.rationale) lines.push(`Why we're calling: ${input.rationale}`);
  if (input.recentAttempts && input.recentAttempts.length > 0) {
    lines.push(``);
    lines.push(`Previous call attempts:`);
    for (const a of input.recentAttempts.slice(0, 5)) {
      lines.push(
        `  - ${a.daysAgo === 0 ? "today" : `${a.daysAgo}d ago`}: ${a.outcome}${
          a.notes ? ` — "${a.notes.slice(0, 200)}"` : ""
        }`,
      );
    }
  }

  const userPrompt = lines.join("\n");

  try {
    const res = await callClaudeWithBudget("call-prep", MODEL_CHEAP, () =>
      client.messages.create({
        model: MODEL_CHEAP,
        max_tokens: 800,
        system:
          `You're a B2B sales call coach. Given a buyer profile + history, ` +
          `produce 3-5 SHORT talking points (≤22 words each) plus a 1-line ` +
          `opening hook and 1-line suggested closer. Tone: warm, founder-to- ` +
          `founder, NEVER salesy. Specific over generic. Reference industry ` +
          `pain points the buyer would actually feel. If previous attempts ` +
          `exist, address them directly (e.g. "you mentioned X last time").`,
        messages: [{ role: "user", content: userPrompt }],
        tools: [
          {
            name: "emit_call_prep",
            description: "Return the structured call-prep output.",
            input_schema: {
              type: "object",
              properties: {
                opener: {
                  type: "string",
                  description: "1-sentence opening hook (≤25 words). Should reference something specific about their company or industry.",
                },
                talkingPoints: {
                  type: "array",
                  description: "3-5 talking points, ≤22 words each. Concrete, not generic.",
                  items: { type: "string" },
                  minItems: 3,
                  maxItems: 5,
                },
                closer: {
                  type: "string",
                  description: "1-sentence suggested next step / closing ask (≤25 words). E.g. \"Should I send you our 1-pager so you can review with the team?\"",
                },
              },
              required: ["opener", "talkingPoints", "closer"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "emit_call_prep" },
      }),
    );

    const block = res.content.find((c) => c.type === "tool_use");
    if (block && block.type === "tool_use") {
      const out = block.input as { opener: string; talkingPoints: string[]; closer: string };
      return {
        ok: true,
        opener: out.opener,
        talkingPoints: out.talkingPoints,
        closer: out.closer,
        model: MODEL_CHEAP,
        usedFallback: false,
      };
    }
    return { ...fallback(input), ok: false, errorMessage: "No tool_use block in response" };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { ...fallback(input), ok: false, errorMessage };
  }
}

/**
 * Deterministic fallback so the operator always sees SOMETHING in the
 * drawer, even when Anthropic is unreachable. Generic but not harmful.
 */
function fallback(input: CallPrepInput): CallPrepResult {
  const product = input.forProduct ?? "our wholesale catalog";
  return {
    ok: true,
    opener: `Hi ${input.buyerName.split(" ")[0]}, I caught your interest in ${product} — got a quick minute?`,
    talkingPoints: [
      `Confirm what they're trying to solve and the timeline they're working against.`,
      `Mention 1-2 buyers in their industry already using ${product} and the result.`,
      `Ask about decision-makers and the budget cycle so the next call goes to the right room.`,
      `Surface objections early — pricing, integration time, switching cost — don't wait for them.`,
    ],
    closer: `Would a 15-minute walkthrough this week make sense, or should I send a 1-pager first?`,
    model: "fallback (no API key)",
    usedFallback: true,
  };
}
