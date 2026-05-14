import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { store } from "@/lib/store";
import { supplierRegistry } from "@/lib/supplierRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/suppliers/[id]/transactions — list transactions
 * linked to this supplier (via supplierRegistryId on Transaction).
 *
 * Returns a slim view (no sensitive payment metadata) plus rollups:
 *   - count
 *   - totalRevenueCents (sum of supplierPayoutCents)
 *   - totalUnits (sum of quantity)
 *   - completedCount (state in {released, delivered})
 *   - lastTransactionAt
 *
 * Capability: leads:read — anyone reading the supplier registry
 * already sees the supplier; counts are derived from there.
 * Operators with transactions:read can also access via the regular
 * /api/transactions endpoint.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "leads:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const supplier = await supplierRegistry.get(id);
  if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  const txns = await store.getTransactionsBySupplierRegistryId(id);
  txns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Slim down each row for the panel — strip Stripe ids, payment
  // intent ids, refund/dispute fields the registry view doesn't need.
  const slim = txns.map((t) => ({
    id: t.id,
    productName: t.productName,
    buyerCompany: t.buyerCompany,
    buyerName: t.buyerName,
    quantity: t.quantity,
    unitPriceCents: t.unitPriceCents,
    productTotalCents: t.productTotalCents,
    supplierPayoutCents: t.supplierPayoutCents,
    state: t.state,
    createdAt: t.createdAt,
    deliveredAt: t.deliveredAt,
    escrowReleasedAt: t.escrowReleasedAt,
  }));

  const totalRevenueCents = txns.reduce((s, t) => s + (t.supplierPayoutCents ?? 0), 0);
  const totalUnits = txns.reduce((s, t) => s + (t.quantity ?? 0), 0);
  const completedCount = txns.filter((t) =>
    t.state === "released" || t.state === "delivered" || !!t.escrowReleasedAt,
  ).length;
  const lastTransactionAt = txns.length > 0 ? txns[0].createdAt : null;

  return NextResponse.json({
    supplierId: id,
    transactions: slim,
    rollup: {
      count: txns.length,
      totalRevenueCents,
      totalUnits,
      completedCount,
      lastTransactionAt,
    },
  });
}
