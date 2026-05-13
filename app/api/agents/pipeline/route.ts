import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/lib/agents/pipeline";
import { checkKillSwitch } from "@/lib/killSwitch";

/**
 * Legacy single-shot pipeline endpoint. Used by:
 *   - /api/cron/pipeline (every-6h cron — no UI, can tolerate long runs)
 *   - Backward-compatible callers that want the full result in one POST
 *
 * The interactive UI at /pipeline now uses the chunked endpoints under
 *   /api/agents/pipeline/start
 *   /api/agents/pipeline/[id]/buyers
 *   /api/agents/pipeline/[id]/outreach
 *   /api/agents/pipeline/[id]/finalize
 * which each fit comfortably inside hosted serverless function timeouts.
 *
 * If you're hitting "Unexpected token '<' / HTML response" errors here,
 * either lower maxProducts/maxBuyersPerProduct, or migrate the caller to
 * the chunked routes.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const recent: number[] = [];

export async function POST(req: NextRequest) {
  const ks = await checkKillSwitch();
  if (ks.killed) {
    return NextResponse.json(
      { error: `Agents paused: ${ks.state.reason ?? "kill switch active"}. Resume at /admin.` },
      { status: 503 },
    );
  }

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
