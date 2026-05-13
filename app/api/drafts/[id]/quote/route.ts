import { NextResponse } from "next/server";
import { runQuote } from "@/lib/agents/quote";
import { checkKillSwitch } from "@/lib/killSwitch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Generate a structured quote for a draft. Idempotent — if an active quote
 * already exists for this draft, returns it instead of regenerating.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ks = await checkKillSwitch();
  if (ks.killed) {
    return NextResponse.json(
      { error: `Agents paused: ${ks.state.reason ?? "kill switch active"}. Resume at /admin.` },
      { status: 503 },
    );
  }

  try {
    const result = await runQuote({ draftId: params.id });
    return NextResponse.json({
      ok: true,
      alreadyExisted: result.alreadyExisted,
      quote: result.quote,
      run: result.run,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Quote generation failed" },
      { status: 500 },
    );
  }
}
