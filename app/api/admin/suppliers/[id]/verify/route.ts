import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { supplierRegistry } from "@/lib/supplierRegistry";
import { runL1Verification, runL2Verification } from "@/lib/supplierVerification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/suppliers/[id]/verify?level=L1|L2 — run a
 * verification level against this supplier's data.
 *
 *   L1 — identity (domain / phone / email / address). Hits external
 *        DNS + RDAP, ~15s worst case.
 *   L2 — business verification (license + tax/EIN + insurance +
 *        industry certs). Reads uploaded documents from
 *        /api/admin/suppliers/[id]/documents and grades by approval
 *        state.
 *
 * Default level: L1 (preserves the previous behavior).
 *
 * Returns the verification run (with per-check signal + evidence) AND
 * the updated supplier (whose `tier` may have advanced based on the
 * latest passed run across all levels). Capability: leads:write.
 *
 * Idempotent — re-running just appends another run to the audit
 * trail. The latest run per level wins for tier derivation.
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

  const url = new URL(req.url);
  const level = (url.searchParams.get("level") || "L1").toUpperCase();
  let run;
  if (level === "L2") {
    run = await runL2Verification(supplier);
  } else if (level === "L1") {
    run = await runL1Verification(supplier);
  } else {
    return NextResponse.json(
      { error: `level must be L1 or L2 (got ${level})` },
      { status: 400 },
    );
  }
  const updated = await supplierRegistry.appendVerificationRun(id, run);

  return NextResponse.json({
    ok: true,
    run,
    supplier: updated,
  });
}
