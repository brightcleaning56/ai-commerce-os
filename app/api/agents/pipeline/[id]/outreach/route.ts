import { NextRequest, NextResponse } from "next/server";
import { runOutreachStage } from "@/lib/agents/pipelineAsync";
import { checkKillSwitch } from "@/lib/killSwitch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/agents/pipeline/[id]/outreach
 *
 * Runs Outreach (1 Claude call) for ONE buyer. Typically 4-8s.
 * Body: { buyerId: string }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ks = await checkKillSwitch();
  if (ks.killed) {
    return NextResponse.json(
      { error: `Agents paused: ${ks.state.reason ?? "kill switch active"}. Resume at /admin.` },
      { status: 503 },
    );
  }

  let body: { buyerId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.buyerId) {
    return NextResponse.json({ error: "Missing buyerId" }, { status: 400 });
  }

  try {
    const result = await runOutreachStage(params.id, body.buyerId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Outreach stage failed" },
      { status: 500 },
    );
  }
}
