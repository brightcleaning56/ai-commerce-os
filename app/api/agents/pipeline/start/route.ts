import { NextRequest, NextResponse } from "next/server";
import { startPipelineRun } from "@/lib/agents/pipelineAsync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const recent: number[] = [];

/**
 * POST /api/agents/pipeline/start
 *
 * Starts a chunked pipeline run. Returns immediately with the pipelineId and
 * the products that Trend Hunter discovered. The client then drives the rest
 * of the lifecycle by calling /[id]/buyers, /[id]/outreach, /[id]/finalize.
 *
 * Each individual call fits well inside hosted serverless function timeouts
 * (Trend Hunter alone is one Claude call, typically 4-8s).
 *
 * Body: { category?, maxProducts?, maxBuyersPerProduct?, findSuppliers?, shareTtlHours? }
 */
export async function POST(req: NextRequest) {
  const now = Date.now();
  while (recent.length && now - recent[0] > RATE_WINDOW_MS) recent.shift();
  if (recent.length >= RATE_LIMIT) {
    return NextResponse.json(
      { error: "Pipeline rate limit (5/min) exceeded — try again in a minute." },
      { status: 429 },
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
    // ok — defaults
  }

  try {
    const result = await startPipelineRun({
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
      { error: e instanceof Error ? e.message : "Pipeline start failed" },
      { status: 500 },
    );
  }
}
