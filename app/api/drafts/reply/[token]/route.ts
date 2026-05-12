import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getOperator } from "@/lib/operator";
import { sendEmail } from "@/lib/email";
import { store, type ThreadMessage } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public token-gated reply endpoint for outreach drafts. The token IS the
 * auth — anyone with it can view the conversation and append a buyer reply.
 * Tokens are minted at email-send time (POST /api/drafts/send) and embedded
 * in the email body footer.
 *
 * Returns ONLY the fields the buyer needs to make sense of the page:
 *   - the operator's name + company (so they know who they're replying to)
 *   - the original outreach subject + body (refresher of what was sent)
 *   - the existing thread (their own prior replies + any operator follow-ups)
 *
 * NEVER returns:
 *   - the draft id, share link token, pipeline id (token is the only handle)
 *   - other prospects' data, model used, costs, etc.
 *   - the buyer's own email back to them (avoid enumeration)
 */

type PublicThreadMessage = {
  role: "agent" | "buyer";
  body: string;
  at: string;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid reply link" }, { status: 400 });
  }

  const draft = await store.getDraftByReplyToken(token);
  if (!draft) {
    return NextResponse.json({ error: "Reply link not found" }, { status: 404 });
  }

  const op = getOperator();

  return NextResponse.json({
    workspace: op.company,
    sender: { name: op.name, title: op.title },
    buyerCompany: draft.buyerCompany,
    buyerName: draft.buyerName,
    productName: draft.productName,
    originalEmail: {
      subject: draft.email?.subject ?? "",
      body: draft.email?.body ?? "",
      sentAt: draft.sentAt ?? null,
    },
    thread: ((draft.thread ?? []) as ThreadMessage[]).map<PublicThreadMessage>((m) => ({
      role: m.role,
      body: m.body,
      at: m.at,
    })),
  });
}

/**
 * POST /api/drafts/reply/[token] — buyer submits a reply.
 *
 * Validates message length (1..5000 chars), appends a ThreadMessage with
 * role: "buyer" to the draft's thread, and best-effort emails the operator
 * so they know to look. The draft remains the canonical source — operator
 * sees the new message in /outreach next time the page polls.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid reply link" }, { status: 400 });
  }

  const draft = await store.getDraftByReplyToken(token);
  if (!draft) {
    return NextResponse.json({ error: "Reply link not found" }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length < 1) {
    return NextResponse.json(
      { error: "Message required (1-5000 characters)" },
      { status: 400 },
    );
  }
  if (message.length > 5000) {
    return NextResponse.json(
      { error: "Message too long (5000 character max)" },
      { status: 400 },
    );
  }

  // Optional: buyer can refresh their displayed name. Capped + sanitized.
  const senderName = typeof body.senderName === "string"
    ? body.senderName.trim().slice(0, 80)
    : "";

  const at = new Date().toISOString();
  const newMsg: ThreadMessage = {
    id: `msg_${crypto.randomBytes(6).toString("hex")}`,
    role: "buyer",
    body: message,
    at,
    summary: senderName ? `via web reply page · ${senderName}` : "via web reply page",
  };

  await store.appendToThread(draft.id, newMsg);

  // ─── Auto-fire Reply Triage Agent ────────────────────────────────────
  // As soon as the buyer message lands, kick off the agent that proposes
  // 1-3 operator-pickable responses. Fire-and-forget — never blocks the
  // buyer's submission on Anthropic latency. Errors are logged + swallowed
  // so the public reply page always returns success.
  //
  // The operator sees suggestions in /outreach next time they look at
  // the thread.
  import("@/lib/agents/replyTriage")
    .then((m) => m.runReplyTriage(draft.id))
    .catch((err) => {
      console.error("[drafts/reply] reply triage failed", err);
    });

  // Best-effort operator notification — don't block buyer's response on email.
  // Operator will see this message in /outreach either way.
  const op = getOperator();
  await sendEmail({
    to: op.email,
    subject: `${draft.buyerCompany} replied via web · ${draft.productName}`,
    textBody: [
      `${senderName || draft.buyerName || "Someone at " + draft.buyerCompany} replied to your`,
      `outreach about "${draft.productName}" via the web reply page.`,
      ``,
      `Their message:`,
      `${message}`,
      ``,
      `View the full thread in /outreach:`,
      `${process.env.NEXT_PUBLIC_APP_ORIGIN || "https://avyncommerce.com"}/outreach`,
    ].join("\n"),
    metadata: { draft_id: draft.id, kind: "web-reply" },
  }).catch((err) => {
    console.error("[drafts/reply] operator notification failed", err);
  });

  return NextResponse.json({
    ok: true,
    receivedAt: at,
  });
}
