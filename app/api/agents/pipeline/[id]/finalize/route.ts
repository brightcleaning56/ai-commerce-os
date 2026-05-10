import { NextRequest, NextResponse } from "next/server";
import { finalizePipelineRun } from "@/lib/agents/pipelineAsync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/agents/pipeline/[id]/finalize
 *
 * Runs Risk Agent (1 Claude call) and marks the run "completed".
 * Computes durationMs + persists final totals.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const run = await finalizePipelineRun(params.id);
    return NextResponse.json({ run });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Finalize failed" },
      { status: 500 },
    );
  }
}
