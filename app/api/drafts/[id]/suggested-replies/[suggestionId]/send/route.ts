import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { store, type ThreadMessage } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/drafts/[id]/suggested-replies/[suggestionId]/send
 *
 * Operator picked a suggestion + clicked Send. This endpoint:
 *   1. Looks up the suggestion + draft + buyer email
 *   2. Sends the suggestion body via the existing email pipeline
 *      (CAN-SPAM footer auto-attached, suppression check enforced)
 *   3. Stamps `sentAt` + `sentMessageId` on the suggestion record
 *   4. Appends a ThreadMessage with role:"agent" so the response shows
 *      in /outreach next to the buyer message it answered
 *
 * Idempotent: re-sending the same suggestion is a no-op that returns
 * the existing sent state.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; suggestionId: string }> },
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id, suggestionId } = await params;
  const draft = await store.getDraft(id);
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  const suggestions = draft.suggestedReplies ?? [];
  const idx = suggestions.findIndex((s) => s.id === suggestionId);
  if (idx === -1) {
    return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
  }
  const sug = suggestions[idx];
  if (sug.sentAt) {
    return NextResponse.json({
      ok: true,
      alreadySent: true,
      sentAt: sug.sentAt,
      messageId: sug.sentMessageId,
    });
  }
  if (sug.discardedAt) {
    return NextResponse.json(
      { error: "This suggestion was discarded — pick a different one or regenerate" },
      { status: 400 },
    );
  }

  // Resolve buyer email — same lookup as /api/drafts/send. Reuses the
  // store.getBusiness path for biz_-prefixed ids.
  let buyerEmail: string | undefined;
  if (draft.buyerId.startsWith("biz_")) {
    const biz = await store.getBusiness(draft.buyerId);
    buyerEmail = biz?.email;
  } else {
    const discovered = await store.getDiscoveredBuyers();
    buyerEmail = discovered.find((b) => b.id === draft.buyerId)?.email;
  }
  if (!buyerEmail) {
    return NextResponse.json(
      { error: `Could not resolve buyer email for ${draft.buyerCompany}` },
      { status: 422 },
    );
  }

  // Send through the standard pipeline — CAN-SPAM footer auto-appends,
  // suppression check fires first, List-Unsubscribe headers attach.
  const sendResult = await sendEmail({
    to: buyerEmail,
    subject: sug.subject,
    textBody: sug.body,
    metadata: {
      kind: "reply-triage",
      draftId: draft.id,
      suggestionId: sug.id,
      actionLabel: sug.actionLabel,
    },
  });

  if (!sendResult.ok) {
    return NextResponse.json(
      {
        error: sendResult.errorMessage ?? "Send failed",
        suppressed: sendResult.suppressed,
        provider: sendResult.provider,
      },
      { status: sendResult.suppressed ? 410 : 502 },
    );
  }

  const sentAt = new Date().toISOString();

  // Update the suggestion record
  const updatedSuggestions = suggestions.slice();
  updatedSuggestions[idx] = {
    ...sug,
    sentAt,
    sentMessageId: sendResult.messageId,
  };

  // Append a ThreadMessage so the response shows in the thread view.
  // Role "agent" (the operator/AVYN side). Summary cites the suggestion
  // so operator can see which option was picked.
  const newMessage: ThreadMessage = {
    id: `msg_${crypto.randomBytes(6).toString("hex")}`,
    role: "agent",
    subject: sug.subject,
    body: sug.body,
    at: sentAt,
    summary: `Reply triage · ${sug.actionLabel} (confidence ${sug.confidence}%)`,
    recommendedAction: sug.actionLabel,
  };

  await store.patchDraft(draft.id, {
    suggestedReplies: updatedSuggestions,
    thread: [...(draft.thread ?? []), newMessage],
  });

  return NextResponse.json({
    ok: true,
    sentAt,
    messageId: sendResult.messageId,
    provider: sendResult.provider,
    threadMessageId: newMessage.id,
  });
}

/**
 * DELETE /api/drafts/[id]/suggested-replies/[suggestionId]/send
 *
 * Operator clicks Discard. Stamps `discardedAt` on the suggestion so
 * it disappears from the active suggestions panel. Suggestion record
 * stays in the array for audit.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; suggestionId: string }> },
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id, suggestionId } = await params;
  const draft = await store.getDraft(id);
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  const suggestions = draft.suggestedReplies ?? [];
  const idx = suggestions.findIndex((s) => s.id === suggestionId);
  if (idx === -1) return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
  if (suggestions[idx].sentAt) {
    return NextResponse.json({ error: "Can't discard a sent suggestion" }, { status: 400 });
  }
  if (suggestions[idx].discardedAt) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const updated = suggestions.slice();
  updated[idx] = { ...suggestions[idx], discardedAt: new Date().toISOString() };
  await store.patchDraft(id, { suggestedReplies: updated });
  return NextResponse.json({ ok: true });
}
