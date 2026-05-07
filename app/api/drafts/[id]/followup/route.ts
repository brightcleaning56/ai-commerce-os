import { NextResponse } from "next/server";
import { runFollowup } from "@/lib/agents/followup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manually trigger a follow-up draft for a specific parent draft.
 * Used by the "Generate follow-up now" button on the /outreach page —
 * useful when you don't want to wait for cron.
 *
 * Idempotent: if a follow-up child already exists, returns it unchanged.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await runFollowup(params.id);
    return NextResponse.json({
      ok: true,
      alreadyExisted: result.alreadyExisted,
      run: result.run,
      draft: result.newDraft,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Followup failed" },
      { status: 500 },
    );
  }
}
