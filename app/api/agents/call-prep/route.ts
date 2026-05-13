import { NextRequest, NextResponse } from "next/server";
import { runCallPrep, type CallPrepInput } from "@/lib/agents/callPrep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const recent: number[] = [];

/**
 * POST /api/agents/call-prep
 *
 * Generates 3-5 talking points + opener + closer for an outbound call.
 * Used by /tasks call-session drawer above the Place Call button.
 *
 * No admin auth -- this endpoint just composes a prompt + returns text;
 * it doesn't read or write any operator data. Rate-limited to 10/min/IP
 * to bound Anthropic spend if the page is hammered.
 *
 * Body matches CallPrepInput. Required: buyerName, buyerCompany.
 * Returns: { ok, opener, talkingPoints[], closer, model, usedFallback }
 */
export async function POST(req: NextRequest) {
  const now = Date.now();
  while (recent.length && now - recent[0] > RATE_WINDOW_MS) recent.shift();
  if (recent.length >= RATE_LIMIT) {
    return NextResponse.json(
      { error: "Rate limit exceeded — try again in a minute." },
      { status: 429 },
    );
  }
  recent.push(now);

  let body: Partial<CallPrepInput> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.buyerName || !body.buyerCompany) {
    return NextResponse.json(
      { error: "buyerName and buyerCompany are required" },
      { status: 400 },
    );
  }

  const result = await runCallPrep(body as CallPrepInput);
  return NextResponse.json(result);
}
