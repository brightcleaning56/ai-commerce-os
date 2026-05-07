import Anthropic from "@anthropic-ai/sdk";
import { store } from "@/lib/store";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === "sk-ant-...") return null;
  if (!client) {
    client = new Anthropic({ apiKey: key });
  }
  return client;
}

export const MODEL_CHEAP = process.env.ANTHROPIC_MODEL_CHEAP || "claude-haiku-4-5";
export const MODEL_SMART = process.env.ANTHROPIC_MODEL_SMART || "claude-sonnet-4-6";

// Approximate prices in USD per million tokens (input / output)
// Haiku 4.5: $1 / $5 ; Sonnet 4.6: $3 / $15 (current public pricing)
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5": { in: 1.0, out: 5.0 },
  "claude-sonnet-4-6": { in: 3.0, out: 15.0 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number) {
  const m = PRICING[model] ?? PRICING["claude-haiku-4-5"];
  return (inputTokens / 1_000_000) * m.in + (outputTokens / 1_000_000) * m.out;
}

// ─── Daily spend circuit breaker ───────────────────────────────────────────

export class SpendBudgetExceededError extends Error {
  constructor(public usdToday: number, public limit: number) {
    super(
      `Daily Anthropic spend budget exceeded: $${usdToday.toFixed(4)} >= $${limit.toFixed(2)}. ` +
        `Increase ANTHROPIC_DAILY_BUDGET_USD or wait until UTC midnight.`,
    );
    this.name = "SpendBudgetExceededError";
  }
}

/**
 * Check if today's spend has exceeded the configured cap. Throws if so.
 * Call this at the START of any agent function that might spend money.
 *
 * Caller policy:
 *   - Agents catch this and fall back to deterministic stubs (same path as
 *     "no API key configured"). The pipeline keeps moving without spending.
 *
 * Configuration:
 *   - ANTHROPIC_DAILY_BUDGET_USD — daily cap. Default $50 (generous for a
 *     small operator). Set to 0 to disable the gate entirely.
 */
export async function checkSpendBudget(): Promise<void> {
  const limitStr = process.env.ANTHROPIC_DAILY_BUDGET_USD;
  if (limitStr === "0") return; // explicit disable
  const limit = limitStr ? Number(limitStr) : 50;
  if (!Number.isFinite(limit) || limit <= 0) return;

  const today = await store.getTodaySpend();
  if (today.cost >= limit) {
    throw new SpendBudgetExceededError(today.cost, limit);
  }
}

/**
 * Record an Anthropic call against today's spend ledger. Call AFTER the API
 * returns, with the actual cost (estimateCost(model, inputTokens, outputTokens)).
 * Best-effort — failures are logged but don't propagate.
 */
export async function recordSpend(args: { agent: string; cost: number }): Promise<void> {
  try {
    await store.addSpend(args);
  } catch (e) {
    console.error("[anthropic/spend] ledger update failed:", e);
  }
}

/**
 * Convenience wrapper: gates a Claude call by daily budget AND records the
 * resulting cost on success. Agents call this so they don't have to remember
 * both check + record. Returns the API result.
 *
 * Usage:
 *   const res = await callClaudeWithBudget("trend-hunter", () =>
 *     client.messages.create({ ... })
 *   );
 *   const cost = estimateCost(MODEL_CHEAP, res.usage.input_tokens, res.usage.output_tokens);
 *   // (recordSpend is called for you with this cost)
 */
export async function callClaudeWithBudget<T extends { usage: { input_tokens: number; output_tokens: number } }>(
  agent: string,
  model: string,
  call: () => Promise<T>,
): Promise<T> {
  await checkSpendBudget();
  const result = await call();
  const cost = estimateCost(model, result.usage.input_tokens, result.usage.output_tokens);
  await recordSpend({ agent, cost });
  return result;
}
