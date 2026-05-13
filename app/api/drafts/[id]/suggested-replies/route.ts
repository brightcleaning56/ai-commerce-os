import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runReplyTriage } from "@/lib/agents/replyTriage";
import { checkKillSwitch } from "@/lib/killSwitch";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/drafts/[id]/suggested-replies
 * Returns the suggestedReplies array on the draft. UI uses this to
 * render the triage panel. Sorted newest first.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const draft = await store.getDraft(id);
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const suggestions = (draft.suggestedReplies ?? [])
    .slice()
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));

  // Help the UI: which suggestions are tied to the LATEST buyer message
  // (the ones operator should be looking at right now)
  const buyerMessages = (draft.thread ?? []).filter((m) => m.role === "buyer");
  const latestBuyerMessageId = buyerMessages[buyerMessages.length - 1]?.id ?? null;

  return NextResponse.json({
    draftId: id,
    suggestions,
    latestBuyerMessageId,
    currentSuggestions: latestBuyerMessageId
      ? suggestions.filter((s) => s.basedOnMessageId === latestBuyerMessageId)
      : [],
  });
}

/**
 * POST /api/drafts/[id]/suggested-replies
 * Generate suggestions for the latest buyer reply on this draft.
 * Idempotent: if suggestions already exist for the latest buyer message,
 * skip with skipped:"already-suggested". Caller can pass force:true
 * (NOT IMPLEMENTED YET — currently you delete first if you want a regen).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const ks = await checkKillSwitch();
  if (ks.killed) {
    return NextResponse.json(
      { error: `Agents paused: ${ks.state.reason ?? "kill switch active"}. Resume at /admin.` },
      { status: 503 },
    );
  }

  const { id } = await params;
  const result = await runReplyTriage(id);
  return NextResponse.json({
    ok: true,
    generated: result.generated,
    skipped: result.skipped ?? null,
    runId: result.run.id,
  });
}
