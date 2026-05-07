import { NextRequest, NextResponse } from "next/server";
import { runNegotiation } from "@/lib/agents/negotiation";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const recent: number[] = [];

export async function POST(req: NextRequest) {
  const now = Date.now();
  while (recent.length && now - recent[0] > RATE_WINDOW_MS) recent.shift();
  if (recent.length >= RATE_LIMIT) {
    return NextResponse.json(
      { error: "Rate limit exceeded — try again in a minute." },
      { status: 429 }
    );
  }
  recent.push(now);

  let body: { draftId?: string; buyerReply?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.draftId || !body.buyerReply) {
    return NextResponse.json({ error: "Missing draftId or buyerReply" }, { status: 400 });
  }
  if (body.buyerReply.trim().length < 5) {
    return NextResponse.json({ error: "Buyer reply too short" }, { status: 400 });
  }

  try {
    const result = await runNegotiation({
      draftId: body.draftId,
      buyerReply: body.buyerReply.trim(),
    });
    const updatedDraft = await store.getDraft(body.draftId);
    return NextResponse.json({
      run: result.run,
      thread: result.thread,
      sentiment: result.sentiment,
      recommendedAction: result.recommendedAction,
      engagement: result.engagement,
      draft: updatedDraft,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Negotiation failed" },
      { status: 500 }
    );
  }
}
