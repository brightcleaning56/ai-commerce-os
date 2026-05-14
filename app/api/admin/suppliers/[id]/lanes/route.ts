import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { store } from "@/lib/store";
import { supplierRegistry } from "@/lib/supplierRegistry";
import { computeSupplierLanes } from "@/lib/supplierLanes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/suppliers/[id]/lanes
 *
 * Returns the Layer 6 Distribution Intelligence rollup for one
 * supplier — origin (from the registry record) → destination (from
 * each linked transaction's buyer fields), aggregated as lanes with
 * transaction count, total units, total supplier payout, recency.
 *
 * Capability: leads:read — same as the supplier registry view.
 *
 * Lanes will be empty until either:
 *   1. New transactions land with buyer destination populated, OR
 *   2. Operator backfills existing transactions via
 *      POST /api/transactions/[id]/destination
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
  const rollup = computeSupplierLanes(supplier, txns);

  return NextResponse.json(rollup);
}
