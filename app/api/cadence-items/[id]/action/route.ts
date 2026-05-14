import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import {
  cadenceQueueItemsStore,
  recordCadenceItemOutcome,
} from "@/lib/cadences";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cadence-items/[id]/action — operator action on a cadence-
 * scheduled queue item from /queue.
 *
 * Body:
 *   { action: "send",  notes?: string }
 *     -> Sends the email/SMS via the configured adapter, marks the
 *        item done with outcome based on send result, records the
 *        outcome on the parent enrollment so the next cadence tick
 *        can branch on it. Channel="call" rejects (use action:"outcome"
 *        instead since the call itself happens via the voice device).
 *
 *   { action: "outcome", outcome: string, notes?: string }
 *     -> Records the outcome without sending. Used for call channel
 *        ("connected" / "voicemail" / "no-answer") AND for any channel
 *        where the operator already acted out-of-band (e.g. they
 *        emailed from gmail directly). Marks done.
 *
 *   { action: "skip", notes?: string }
 *     -> Marks done with outcome="skipped". Doesn't send. Used when
 *        the operator decides this step is no longer relevant (buyer
 *        replied, deal closed, lost, etc.).
 *
 * Capability: outreach:write — same gate as cadence creation/enroll.
 *
 * Outcome propagation: every successful action calls
 * recordCadenceItemOutcome which updates BOTH the item's status AND
 * the enrollment's lastStepOutcome. The next runCadenceTick reads
 * lastStepOutcome to evaluate branches before scheduling the next
 * step.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "outreach:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;

  let body: { action?: string; outcome?: string; notes?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const item = await cadenceQueueItemsStore.get(id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (item.status !== "pending") {
    return NextResponse.json(
      { error: `Item is already ${item.status} -- can't act on it again` },
      { status: 409 },
    );
  }

  const action = body.action;

  // ─── send ────────────────────────────────────────────────────────
  if (action === "send") {
    if (item.channel === "call") {
      return NextResponse.json(
        { error: "Call channel can't be auto-sent. Use action:\"outcome\" with the call result." },
        { status: 400 },
      );
    }
    if (!item.to) {
      return NextResponse.json(
        { error: `Cadence step has no destination (${item.channel === "email" ? "email" : "phone"} missing on buyer)` },
        { status: 400 },
      );
    }

    let sendOk = false;
    let sendError: string | undefined;
    let messageId: string | undefined;

    if (item.channel === "email") {
      try {
        const res = await sendEmail({
          to: item.to,
          subject: item.subject ?? `Following up — ${item.buyerCompany}`,
          textBody: item.body ?? "",
          metadata: {
            kind: "cadence-step",
            cadence_id: item.cadenceId,
            enrollment_id: item.enrollmentId,
            step_index: String(item.stepIndex),
          },
        });
        sendOk = res.ok;
        sendError = res.errorMessage;
        messageId = res.messageId;
      } catch (e) {
        sendOk = false;
        sendError = e instanceof Error ? e.message : "send failed";
      }
    } else if (item.channel === "sms") {
      try {
        const res = await sendSms({ to: item.to, body: item.body ?? "" });
        sendOk = res.ok;
        sendError = res.errorMessage;
        messageId = res.messageSid;
      } catch (e) {
        sendOk = false;
        sendError = e instanceof Error ? e.message : "send failed";
      }
    }

    // Record outcome regardless: failed sends still take the item off
    // the inbox (operator can re-trigger via re-enrollment) and the
    // outcome propagates so any branch on "failed" can fire.
    const finalStatus = sendOk ? "done" : "failed";
    const outcome = sendOk ? "sent" : sendError ? `failed: ${sendError.slice(0, 80)}` : "failed";
    const updated = await recordCadenceItemOutcome({
      itemId: id,
      status: finalStatus,
      outcome,
      notes: body.notes,
    });

    return NextResponse.json({
      ok: sendOk,
      sent: sendOk,
      messageId,
      errorMessage: sendError,
      item: updated.item,
      enrollment: updated.enrollment,
    });
  }

  // ─── outcome (no send) ────────────────────────────────────────────
  if (action === "outcome") {
    if (!body.outcome) {
      return NextResponse.json({ error: "outcome is required" }, { status: 400 });
    }
    const updated = await recordCadenceItemOutcome({
      itemId: id,
      status: "done",
      outcome: body.outcome.slice(0, 80),
      notes: body.notes,
    });
    return NextResponse.json({ ok: true, item: updated.item, enrollment: updated.enrollment });
  }

  // ─── skip ─────────────────────────────────────────────────────────
  if (action === "skip") {
    const updated = await recordCadenceItemOutcome({
      itemId: id,
      status: "skipped",
      outcome: "skipped",
      notes: body.notes,
    });
    return NextResponse.json({ ok: true, item: updated.item, enrollment: updated.enrollment });
  }

  return NextResponse.json({ error: "action must be one of: send, outcome, skip" }, { status: 400 });
}
