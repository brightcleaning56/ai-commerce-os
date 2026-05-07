import Anthropic from "@anthropic-ai/sdk";

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
