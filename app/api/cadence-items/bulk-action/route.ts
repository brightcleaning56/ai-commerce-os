import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import {
  cadenceQueueItemsStore,
  recordCadenceItemOutcome,
} from "@/lib/cadences";
import { sendEmail } from "@/lib/email";
import { getOperator } from "@/lib/operator";
import { sendSms } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cadence-items/bulk-action — operate on N cadence-scheduled
 * queue items in one round-trip.
 *
 * Body:
 *   {
 *     ids: string[],               // 1..200 cadence item ids
 *     action: "send" | "skip",     // "outcome" not supported (each
 *                                  //   item would need its own outcome
 *                                  //   value -- not a fit for batch)
 *     confirmApproval?: boolean,   // required when ANY item has
 *                                  //   requiresApproval=true
 *     notes?: string,              // applied to each item
 *   }
 *
 * Returns per-item results so the client can render a "12 sent, 1
 * failed, 1 skipped" toast with a drill-down on failures.
 *
 * Approval gate:
 *   - If any selected item has requiresApproval=true and
 *     confirmApproval is not true, returns 412 with the list of
 *     gated ids so the client can prompt before retrying.
 *   - On approve+send, each gated item gets approvedBy + approvedAt
 *     stamped before its action lands (same audit semantics as the
 *     single-item endpoint).
 *
 * Hard cap of 200 items per call to keep the lambda inside the 60s
 * timeout budget. Clients selecting more should chunk client-side.
 *
 * Capability: outreach:write -- same as single-item action.
 */

const MAX_BATCH = 200;

type ItemResult =
  | {
      id: string;
      ok: true;
      action: "send" | "skip";
      sent?: boolean;
      messageId?: string;
    }
  | {
      id: string;
      ok: false;
      reason: string;
      status?: number;
    };

export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "outreach:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: {
    ids?: string[];
    action?: string;
    confirmApproval?: boolean;
    notes?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "ids[] required" }, { status: 400 });
  }
  if (body.ids.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Too many items (${body.ids.length}); max ${MAX_BATCH} per call` },
      { status: 413 },
    );
  }
  if (body.action !== "send" && body.action !== "skip") {
    return NextResponse.json(
      { error: 'action must be "send" or "skip" (outcome not supported in batch)' },
      { status: 400 },
    );
  }

  // Pre-flight: load all items + check which need approval. If any do
  // and confirmApproval isn't true, fail fast with the list so the
  // client can show "These N need approval -- check the box?" UI.
  const items = await Promise.all(body.ids.map((id) => cadenceQueueItemsStore.get(id)));
  const missing: string[] = [];
  const notPending: string[] = [];
  const needsApproval: string[] = [];
  items.forEach((item, i) => {
    const id = body.ids![i];
    if (!item) missing.push(id);
    else if (item.status !== "pending") notPending.push(id);
    else if (item.requiresApproval) needsApproval.push(id);
  });

  if (missing.length === body.ids.length) {
    return NextResponse.json(
      { error: "All items missing", missing },
      { status: 404 },
    );
  }

  if (needsApproval.length > 0 && !body.confirmApproval) {
    return NextResponse.json(
      {
        error: `${needsApproval.length} item${needsApproval.length === 1 ? "" : "s"} require approval`,
        requiresApproval: true,
        approvalGate: "Set confirmApproval:true after operator review.",
        gatedIds: needsApproval,
      },
      { status: 412 },
    );
  }

  // Resolve operator email for the approval audit stamps.
  const approvedBy =
    "user" in auth && auth.user?.email
      ? auth.user.email
      : getOperator().email || "owner";
  const approvedAt = new Date().toISOString();

  const results: ItemResult[] = [];

  for (let i = 0; i < body.ids.length; i++) {
    const id = body.ids[i];
    const item = items[i];
    if (!item) {
      results.push({ id, ok: false, reason: "Not found", status: 404 });
      continue;
    }
    if (item.status !== "pending") {
      results.push({
        id,
        ok: false,
        reason: `Already ${item.status}`,
        status: 409,
      });
      continue;
    }

    // Stamp approval audit BEFORE the action lands so it survives
    // adapter throws.
    if (item.requiresApproval && body.confirmApproval) {
      await cadenceQueueItemsStore
        .patch(id, { approvedBy, approvedAt })
        .catch(() => null);
    }

    if (body.action === "skip") {
      const r = await recordCadenceItemOutcome({
        itemId: id,
        status: "skipped",
        outcome: "skipped",
        notes: body.notes,
      });
      if (r.item) {
        results.push({ id, ok: true, action: "skip" });
      } else {
        results.push({ id, ok: false, reason: "Skip failed" });
      }
      continue;
    }

    // action === "send"
    if (item.channel === "call") {
      results.push({
        id,
        ok: false,
        reason: "Call channel can't be auto-sent in batch (record outcome individually)",
        status: 400,
      });
      continue;
    }
    if (!item.to) {
      results.push({
        id,
        ok: false,
        reason: `Buyer missing ${item.channel === "email" ? "email" : "phone"}`,
        status: 400,
      });
      continue;
    }

    let sendOk = false;
    let sendError: string | undefined;
    let messageId: string | undefined;
    try {
      if (item.channel === "email") {
        const res = await sendEmail({
          to: item.to,
          subject: item.subject ?? `Following up — ${item.buyerCompany}`,
          textBody: item.body ?? "",
          metadata: {
            kind: "cadence-step-bulk",
            cadence_id: item.cadenceId,
            enrollment_id: item.enrollmentId,
            step_index: String(item.stepIndex),
          },
        });
        sendOk = res.ok;
        sendError = res.errorMessage;
        messageId = res.messageId;
      } else if (item.channel === "sms") {
        const res = await sendSms({ to: item.to, body: item.body ?? "" });
        sendOk = res.ok;
        sendError = res.errorMessage;
        messageId = res.messageSid;
      }
    } catch (e) {
      sendOk = false;
      sendError = e instanceof Error ? e.message : "send failed";
    }

    const finalStatus = sendOk ? "done" : "failed";
    const outcome = sendOk ? "sent" : sendError ? `failed: ${sendError.slice(0, 80)}` : "failed";
    await recordCadenceItemOutcome({
      itemId: id,
      status: finalStatus,
      outcome,
      notes: body.notes,
    }).catch(() => null);

    if (sendOk) {
      results.push({ id, ok: true, action: "send", sent: true, messageId });
    } else {
      results.push({
        id,
        ok: false,
        reason: sendError ?? "send failed",
      });
    }
  }

  const summary = {
    total: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  };

  return NextResponse.json({ ok: summary.failed === 0, summary, results });
}
