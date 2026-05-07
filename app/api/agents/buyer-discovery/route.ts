import { NextRequest, NextResponse } from "next/server";
import { runBuyerDiscovery } from "@/lib/agents/buyerDiscovery";

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

  let body: { productName?: string; productCategory?: string; productNiche?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body — error below
  }

  if (!body.productName || !body.productCategory) {
    return NextResponse.json(
      { error: "Missing productName or productCategory" },
      { status: 400 }
    );
  }

  try {
    const run = await runBuyerDiscovery({
      productName: body.productName,
      productCategory: body.productCategory,
      productNiche: body.productNiche || body.productCategory,
    });
    return NextResponse.json({ run });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Agent run failed" },
      { status: 500 }
    );
  }
}
