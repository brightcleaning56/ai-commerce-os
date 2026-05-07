import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/lib/agents/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const recent: number[] = [];

export async function POST(req: NextRequest) {
  const now = Date.now();
  while (recent.length && now - recent[0] > RATE_WINDOW_MS) recent.shift();
  if (recent.length >= RATE_LIMIT) {
    return NextResponse.json(
      { error: "Pipeline rate limit (5/min) exceeded — try again in a minute." },
      { status: 429 }
    );
  }
  recent.push(now);

  let body: {
    category?: string;
    maxProducts?: number;
    maxBuyersPerProduct?: number;
    findSuppliers?: boolean;
    shareTtlHours?: number;
  } = {};
  try {
    body = await req.json();
  } catch {
    // ok, defaults
  }

  try {
    const result = await runPipeline({
      category: body.category,
      maxProducts: body.maxProducts,
      maxBuyersPerProduct: body.maxBuyersPerProduct,
      findSuppliers: body.findSuppliers,
      shareTtlHours: body.shareTtlHours,
      triggeredBy: "manual",
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Pipeline failed" },
      { status: 500 }
    );
  }
}
