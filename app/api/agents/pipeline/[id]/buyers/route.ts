import { NextRequest, NextResponse } from "next/server";
import { runBuyersStage } from "@/lib/agents/pipelineAsync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/agents/pipeline/[id]/buyers
 *
 * Runs Buyer Discovery + Supplier Finder for ONE product in parallel.
 * Each is at most 1 Claude call so this stage typically lands in 5-10s.
 * Body: { productId: string }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { productId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.productId) {
    return NextResponse.json({ error: "Missing productId" }, { status: 400 });
  }

  try {
    const result = await runBuyersStage(params.id, body.productId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Buyers stage failed" },
      { status: 500 },
    );
  }
}
