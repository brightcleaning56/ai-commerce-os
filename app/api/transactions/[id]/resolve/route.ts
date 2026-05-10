import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { refundCharge } from "@/lib/payments";
import { store } from "@/lib/store";
import { transitionTransaction } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/transactions/[id]/resolve  — operator resolves a dispute.
 * Body: { resolution: "refund_buyer" | "release_supplier" | "split" }
 *
 * Transitions:
 *   disputed → refunded         (when resolution = refund_buyer or split with refund)
 *   disputed → released         (when resolution = release_supplier)
 *
 * Money side-effects:
 *   refund_buyer:    full refund to buyer — Stripe refund call in live mode
 *   release_supplier: full payout to supplier — same path as normal release
 *   split:           refund half + release half (50/50) — partial Stripe refund
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: { resolution?: "refund_buyer" | "release_supplier" | "split" } = {};
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
      // disputed → released → completed
      await transitionTransaction({
        id: params.id,
        to: "released",
        actor: "operator",
        detail: "Dispute resolved — escrow released to supplier",
        patch: {
          disputeResolution: "release_supplier",
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
        detail: "Dispute resolved — full refund to buyer",
        patch: {
          disputeResolution: "refund_buyer",
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
      detail: `Dispute resolved — 50/50 split (buyer refunded $${(halfCents / 100).toFixed(2)})`,
      patch: {
        disputeResolution: "split",
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
