import { NextRequest, NextResponse } from "next/server";
import { processInbound } from "@/lib/inbound";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manual inbound trigger — used by the UI's "Simulate inbound reply" button.
 *
 * Body: { draftId, body }
 * Resolves the draft's recipient + subject and runs the same processInbound flow
 * the Postmark webhook uses. Lets you test the Negotiation Agent without setting
 * up real inbound forwarding.
 */
export async function POST(req: NextRequest) {
  let body: { draftId?: string; body?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.draftId || !body.body || body.body.trim().length < 5) {
    return NextResponse.json({ error: "Need draftId and body (≥5 chars)" }, { status: 400 });
  }

  const draft = await store.getDraft(body.draftId);
  if (!draft) return NextResponse.json({ error: `Draft ${body.draftId} not found` }, { status: 404 });
  if (!draft.sentAt || !draft.sentToEmail) {
    return NextResponse.json(
      { error: "Draft hasn't been sent yet — send it first to simulate a reply" },
      { status: 400 }
    );
  }

  try {
    const result = await processInbound({
      fromEmail: draft.sentToEmail,
      fromName: draft.buyerName,
      subject: `Re: ${draft.email.subject}`,
      textBody: body.body,
      inReplyToMessageId: draft.messageId,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Inbound failed" },
      { status: 500 }
    );
  }
}
