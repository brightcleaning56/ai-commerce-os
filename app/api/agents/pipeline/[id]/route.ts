import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/agents/pipeline/[id] — poll pipeline run status.
 *
 * Returns the StoredPipelineRun snapshot. Client polls this every ~1s while
 * status === "running" to render live stage progress. Operator-facing only;
 * sharing uses /api/share/[id]?t=<token>.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const run = await store.getPipelineRun(params.id);
  if (!run) return NextResponse.json({ error: "Pipeline run not found" }, { status: 404 });
  return NextResponse.json({ run });
}
