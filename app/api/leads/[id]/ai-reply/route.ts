import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { runLeadFirstReply } from "@/lib/leadFirstReply";
import { runLeadFollowup } from "@/lib/leadFollowup";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/leads/[id]/ai-reply â€” admin-only manual trigger for the AI
 * outreach to a single lead. Operator-facing button companion to the
 * auto-trigger in /api/leads (which fires on form submission).
 *
 * Behavior is state-aware:
 *  - If `aiReply` is missing OR status === "error" / "skipped" / "pending":
 *    fire the FIRST-touch reply (overwrites aiReply). Useful when the
 *    auto-trigger failed (Postmark not approved yet, transient Anthropic
 *    error, etc.) and the operator wants to retry.
 *  - If `aiReply.status === "sent"`: fire a SECOND-touch followup, appended
 *    to aiFollowups[]. Same engine the daily cron uses, but on-demand.
 *
 * Idempotency: not strictly idempotent â€” each call generates and sends a
 * fresh message. The UI button is debounced via `pending` state to prevent
 * accidental double-clicks.
 *
 * Returns the updated lead so the client can refresh without a second GET.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "leads:write");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const { id } = await params;
  const lead = await store.getLead(id);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const isFirstTouch =
    !lead.aiReply ||
    lead.aiReply.status === "error" ||
    lead.aiReply.status === "skipped" ||
    lead.aiReply.status === "pending";

  if (isFirstTouch) {
    const result = await runLeadFirstReply(lead);
    const updated = await store.getLead(id);
    return NextResponse.json({
      ok: result.ok,
      kind: "first-touch",
      status: result.status,
      channels: result.channels,
      errorMessage: result.errorMessage,
      lead: updated,
    });
  }

  // Followup branch â€” aiReply was already sent successfully.
  const result = await runLeadFollowup(lead);
  const updated = await store.getLead(id);
  return NextResponse.json({
    ok: result.ok,
    kind: "followup",
    status: result.status,
    errorMessage: result.errorMessage,
    lead: updated,
  });
}
