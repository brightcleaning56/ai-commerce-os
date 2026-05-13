import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { supplierRegistry } from "@/lib/supplierRegistry";
import { runL1Verification } from "@/lib/supplierVerification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/suppliers/[id]/verify — run L1 identity verification
 * against this supplier's profile.
 *
 * Current behavior: L1 only. Future levels (L2 document verification,
 * L3 operational, etc.) ship as additional endpoints / scopes once the
 * document upload pipeline lands.
 *
 * Returns the verification run (with per-check signal + evidence) AND
 * the updated supplier (whose `tier` may have advanced to "basic" if
 * L1 passed). Capability: leads:write — re-running verification is
 * scoped the same as creating a supplier.
 *
 * Idempotent in the sense that re-running just appends another L1 run
 * to the audit trail. The latest run wins for tier derivation.
 *
 * Cost: hits DNS-over-HTTPS + RDAP + the supplier's homepage. Each
 * with a short timeout; full run is bounded to ~15s worst case.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "leads:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const supplier = await supplierRegistry.get(id);
  if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const run = await runL1Verification(supplier);
  const updated = await supplierRegistry.appendVerificationRun(id, run);

  return NextResponse.json({
    ok: true,
    run,
    supplier: updated,
  });
}
