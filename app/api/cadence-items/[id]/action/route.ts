import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import {
  cadenceQueueItemsStore,
  cadencesStore,
  recordCadenceItemOutcome,
} from "@/lib/cadences";
import { sendEmail } from "@/lib/email";
import { getOperator } from "@/lib/operator";
import { sendSms } from "@/lib/sms";

/** Whether a send-failure error string indicates a transient problem
 *  worth retrying (rate limit, timeout, 5xx). Suppression / invalid
 *  recipient errors are NOT transient. */
function isTransientFailure(errorMessage: string | undefined): boolean {
  if (!errorMessage) return false;
  const m = errorMessage.toLowerCase();
  if (m.includes("suppressed")) return false;
  if (m.includes("invalid")) return false;
  if (m.includes("not configured")) return false;
  if (m.includes("rate limit") || m.includes("rate-limit")) return true;
  if (m.includes("timeout") || m.includes("timed out")) return true;
  if (m.includes("network")) return true;
  // Generic "5xx" or "503" hints
  if (/\b5\d{2}\b/.test(m)) return true;
  return false;
}

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

  let body: {
    action?: string;
    outcome?: string;
    notes?: string;
    /** Required when item.requiresApproval is true. Set by the action
     *  drawer's confirm checkbox. Sending without this is rejected
     *  with 412 (Precondition Failed) so the caller can prompt. */
    confirmApproval?: boolean;
  } = {};
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

  // Approval gate -- when the cadence runner flagged this item as
  // requiresApproval (per workspace policy), the operator must
  // explicitly confirm before any send/outcome/skip can land. This
  // protects against accidental clicks blasting un-reviewed touches.
  if (item.requiresApproval && !body.confirmApproval) {
    return NextResponse.json(
      {
        error: "This item requires approval before it can be sent.",
        requiresApproval: true,
        approvalGate: "Set confirmApproval:true in the request body after operator review.",
      },
      { status: 412 },
    );
  }

  // Stamp the audit fields on first action when approval was needed.
  // We record this BEFORE the action lands so it survives even if
  // the email/SMS send adapter throws.
  let approvalStamp: { approvedBy: string; approvedAt: string } | null = null;
  if (item.requiresApproval && body.confirmApproval) {
    const approvedBy =
      "user" in auth && auth.user?.email
        ? auth.user.email
        : getOperator().email || "owner";
    approvalStamp = { approvedBy, approvedAt: new Date().toISOString() };
    await cadenceQueueItemsStore.patch(id, approvalStamp);
  }

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

    // ── Slice 19: transient-failure retry ────────────────────────
    // If the send failed with a transient error and the step has
    // retries remaining, push the item dueAt forward + bump retry
    // counter instead of marking failed. The runner / operator will
    // see the rescheduled dueAt and either auto-retry on next cron
    // or the operator clicks send again.
    if (!sendOk && isTransientFailure(sendError)) {
      const cadence = await cadencesStore.get(item.cadenceId).catch(() => null);
      const step = cadence?.steps[item.stepIndex];
      const maxRetries = step?.maxRetries ?? 0;
      const currentRetries = item.retryCount ?? 0;
      if (maxRetries > 0 && currentRetries < maxRetries) {
        const delayMin = step?.retryDelayMinutes ?? 30;
        const nextDueAt = new Date(Date.now() + delayMin * 60 * 1000).toISOString();
        const updated = await cadenceQueueItemsStore.patch(id, {
          retryCount: currentRetries + 1,
          lastRetryAt: new Date().toISOString(),
          dueAt: nextDueAt,
        });
        return NextResponse.json({
          ok: false,
          sent: false,
          retried: true,
          retryCount: currentRetries + 1,
          maxRetries,
          nextDueAt,
          errorMessage: sendError,
          item: updated,
        });
      }
    }

    // Record outcome: success OR final-failure (retries exhausted /
    // non-transient). Failed sends still take the item off the inbox
    // (operator can re-trigger via re-enrollment) and the outcome
    // propagates so any branch on "failed" can fire.
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
