import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/earnings/refunds — refund attribution rollup for /earnings.
 *
 * Joins the revenue ledger's refund entries against transactions to
 * surface:
 *   - total refund volume (cents) + count
 *   - refund rate % (refunded transactions / total transactions)
 *   - breakdown by dispute resolution (refund_buyer / split / other)
 *   - recent refunds list with buyer, product, amount, reason
 *
 * Empty store → all zeros so the UI can render an "all clear" state.
 */
export async function GET() {
  const [transactions, ledger] = await Promise.all([
    store.getTransactions(),
    store.getRevenueLedger(),
  ]);

  const refundEntries = ledger.filter((e) => e.kind === "refund");
  const refundCents = refundEntries.reduce((s, e) => s + Math.abs(e.cents), 0);

  // Build a lookup so the UI can attribute refunds to buyers/products
  const txnById = new Map(transactions.map((t) => [t.id, t]));

  // Per-resolution breakdown
  const byResolution: Record<string, { count: number; cents: number }> = {
    refund_buyer: { count: 0, cents: 0 },
    split: { count: 0, cents: 0 },
    other: { count: 0, cents: 0 },
  };
  const refundedTransactionIds = new Set<string>();

  for (const e of refundEntries) {
    refundedTransactionIds.add(e.transactionId);
    const t = txnById.get(e.transactionId);
    const resolution = (t?.disputeResolution ?? "other").toString();
    const bucket =
      resolution === "refund_buyer" ? "refund_buyer" :
      resolution === "split" ? "split" : "other";
    byResolution[bucket].count++;
    byResolution[bucket].cents += Math.abs(e.cents);
  }

  // Total revenue (gross — platform + escrow fees collected) for refund rate
  const grossPlatformRevenueCents = ledger
    .filter((e) => e.kind === "platform_fee" || e.kind === "escrow_fee")
    .reduce((s, e) => s + e.cents, 0);

  const totalTransactions = transactions.length;
  const refundRatePct =
    totalTransactions === 0
      ? 0
      : (refundedTransactionIds.size / totalTransactions) * 100;

  // Recent refunds — top 8 newest with buyer/product/reason
  const recent = [...refundEntries]
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, 8)
    .map((e) => {
      const t = txnById.get(e.transactionId);
      return {
        id: e.id,
        ts: e.ts,
        transactionId: e.transactionId,
        buyerCompany: t?.buyerCompany ?? "—",
        productName: t?.productName ?? "—",
        amountCents: Math.abs(e.cents),
        reason:
          t?.disputeReason ??
          (t?.disputeResolution === "refund_buyer" ? "Full refund (dispute resolved)"
            : t?.disputeResolution === "split" ? "50/50 split"
            : t?.state === "refunded" ? "Refunded"
            : "—"),
      };
    });

  return NextResponse.json({
    summary: {
      totalRefundCents: refundCents,
      refundedTransactions: refundedTransactionIds.size,
      totalTransactions,
      refundRatePct,
      grossPlatformRevenueCents,
      // Net revenue = gross - refunds (positive number)
      netAfterRefundsCents: Math.max(0, grossPlatformRevenueCents - refundCents),
    },
    byResolution: {
      refund_buyer: byResolution.refund_buyer,
      split: byResolution.split,
      other: byResolution.other,
    },
    recent,
  });
}
