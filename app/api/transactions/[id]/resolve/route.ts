import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { refundCharge } from "@/lib/payments";
import { store } from "@/lib/store";
import { transitionTransaction } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/transactions/[id]/resolve  â€” operator resolves a dispute.
 * Body: { resolution: "refund_buyer" | "release_supplier" | "split", notes?: string }
 *
 * Transitions:
 *   disputed â†’ refunded         (when resolution = refund_buyer or split with refund)
 *   disputed â†’ released         (when resolution = release_supplier)
 *
 * Money side-effects:
 *   refund_buyer:    full refund to buyer â€” Stripe refund call in live mode
 *   release_supplier: full payout to supplier â€” same path as normal release
 *   split:           refund half + release half (50/50) â€” partial Stripe refund
 *
 * `notes` (optional, max 500 chars) captures operator rationale â€” persisted
 * on the txn as disputeResolutionNotes + appended to the stateHistory detail
 * line so /admin/audit shows WHY, not just WHAT.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCapability(req, "transactions:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: {
    resolution?: "refund_buyer" | "release_supplier" | "split";
    notes?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.resolution || !["refund_buyer", "release_supplier", "split"].includes(body.resolution)) {
    return NextResponse.json(
      { error: "resolution must be 'refund_buyer' | 'release_supplier' | 'split'" },
      { status: 400 },
    );
  }

  // Sanitize notes: trim, hard-cap at 500 chars, empty â†’ undefined
  const rawNotes = typeof body.notes === "string" ? body.notes.trim() : "";
  const notes: string | undefined = rawNotes ? rawNotes.slice(0, 500) : undefined;
  const notesSuffix = notes ? ` Â· "${notes.slice(0, 80)}${notes.length > 80 ? "â€¦" : ""}"` : "";

  const txn = await store.getTransaction(params.id);
  if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  if (txn.state !== "disputed") {
    return NextResponse.json(
      { error: `Can only resolve disputed transactions, currently '${txn.state}'` },
      { status: 400 },
    );
  }

  try {
    if (body.resolution === "release_supplier") {
      // disputed â†’ released â†’ completed
      await transitionTransaction({
        id: params.id,
        to: "released",
        actor: "operator",
        detail: `Dispute resolved â€” escrow released to supplier${notesSuffix}`,
        patch: {
          disputeResolution: "release_supplier",
          disputeResolutionNotes: notes,
          escrowReleasedAt: new Date().toISOString(),
          escrowReleaseAuthorizedBy: "operator",
        },
      });
      const completed = await transitionTransaction({
        id: params.id,
        to: "completed",
        actor: "system",
        detail: "Transaction completed (post-dispute)",
      });
      return NextResponse.json({ ok: true, transaction: completed });
    }

    if (body.resolution === "refund_buyer") {
      // Trigger Stripe refund if real payment, else simulated
      let refundResult: { ok: boolean; refundId?: string; errorMessage?: string } = { ok: true };
      if (txn.stripeChargeId) {
        refundResult = await refundCharge(txn.stripeChargeId, txn.productTotalCents);
        if (!refundResult.ok) {
          return NextResponse.json(
            { error: `Refund failed: ${refundResult.errorMessage}` },
            { status: 502 },
          );
        }
      }
      const updated = await transitionTransaction({
        id: params.id,
        to: "refunded",
        actor: "operator",
        detail: `Dispute resolved â€” full refund to buyer${notesSuffix}`,
        patch: {
          disputeResolution: "refund_buyer",
          disputeResolutionNotes: notes,
          refundedAt: new Date().toISOString(),
          refundCents: txn.productTotalCents,
        },
        meta: { refundId: refundResult.refundId },
      });
      return NextResponse.json({ ok: true, transaction: updated });
    }

    // split: refund half to buyer, release half to supplier
    // For state-machine simplicity, we mark this as "refunded" with half cents
    // and record the split in the event detail. (Future: a more granular state.)
    const halfCents = Math.floor(txn.productTotalCents / 2);
    let refundResult: { ok: boolean; refundId?: string; errorMessage?: string } = { ok: true };
    if (txn.stripeChargeId) {
      refundResult = await refundCharge(txn.stripeChargeId, halfCents);
      if (!refundResult.ok) {
        return NextResponse.json(
          { error: `Partial refund failed: ${refundResult.errorMessage}` },
          { status: 502 },
        );
      }
    }
    const updated = await transitionTransaction({
      id: params.id,
      to: "refunded",
      actor: "operator",
      detail: `Dispute resolved â€” 50/50 split (buyer refunded $${(halfCents / 100).toFixed(2)})${notesSuffix}`,
      patch: {
        disputeResolution: "split",
        disputeResolutionNotes: notes,
        refundedAt: new Date().toISOString(),
        refundCents: halfCents,
      },
      meta: { refundId: refundResult.refundId, splitCents: halfCents },
    });
    return NextResponse.json({ ok: true, transaction: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Resolve failed" },
      { status: 400 },
    );
  }
}
