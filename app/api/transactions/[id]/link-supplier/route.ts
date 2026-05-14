import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { store } from "@/lib/store";
import { supplierRegistry } from "@/lib/supplierRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/transactions/[id]/link-supplier
 *   Body: { supplierRegistryId: string | null }
 *
 * Links (or unlinks, when supplierRegistryId === null) a transaction
 * to a record in the supplier registry. The link is what unblocks:
 *   - L3 Operational verification (auto-validate self-reported MOQ
 *     vs aggregated transaction quantity)
 *   - Layer 6 Distribution Intelligence (lane = supplier origin →
 *     buyer destination; needs the supplier's address from the
 *     registry record)
 *   - Per-supplier revenue rollups in /admin/suppliers
 *
 * Capability: transactions:write -- editing transaction metadata.
 *
 * Validates that the supplier exists. Stamps supplierLinkedAt +
 * supplierLinkedBy from auth context for the audit trail. Does NOT
 * touch supplierStripeAccountId — the Stripe Connect account stays
 * the source of truth for payouts; the registry link is metadata.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "transactions:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const txn = await store.getTransaction(id);
  if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body.supplierRegistryId;
  // null / "" → unlink. Anything else → must be a valid registry id.
  if (raw === null || raw === "") {
    const updated = await store.patchTransaction(id, {
      supplierRegistryId: undefined,
      supplierLinkedAt: undefined,
      supplierLinkedBy: undefined,
    });
    return NextResponse.json({ ok: true, transaction: updated, unlinked: true });
  }
  if (typeof raw !== "string" || !raw.trim()) {
    return NextResponse.json({ error: "supplierRegistryId must be a string or null" }, { status: 400 });
  }
  const supplier = await supplierRegistry.get(raw);
  if (!supplier) {
    return NextResponse.json({ error: `No supplier with id ${raw}` }, { status: 404 });
  }

  const op = getOperator();
  const isOwner = auth.mode === "production" ? !auth.user : true;
  const linkedBy = isOwner ? op.email : (auth.user?.email ?? "unknown");

  const updated = await store.patchTransaction(id, {
    supplierRegistryId: supplier.id,
    supplierLinkedAt: new Date().toISOString(),
    supplierLinkedBy: linkedBy,
    // Backfill supplierName from the registry record if it's not already
    // set on the transaction (older txns predate this field).
    supplierName: txn.supplierName || supplier.legalName,
  });

  return NextResponse.json({
    ok: true,
    transaction: updated,
    supplier: {
      id: supplier.id,
      legalName: supplier.legalName,
      tier: supplier.tier,
      trustScore: supplier.trustScore,
    },
  });
}
