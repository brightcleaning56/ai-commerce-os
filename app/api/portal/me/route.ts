import { NextRequest, NextResponse } from "next/server";
import { requireSupplier } from "@/lib/auth";
import { supplierRegistry } from "@/lib/supplierRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/portal/me — returns the supplier record behind the current
 * /portal session. Includes the full verification audit trail so the
 * portal dashboard can show tier, missing checks, etc.
 *
 * Suppliers only see THEIR OWN record; the supplier id comes from the
 * HMAC-signed session token (never from a query param) so a malicious
 * client can't probe other suppliers.
 */
export async function GET(req: NextRequest) {
  const auth = await requireSupplier(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const supplier = await supplierRegistry.get(auth.supplierId);
  if (!supplier) {
    // Owner deleted them after the token was issued. Old tokens
    // remain HMAC-valid until expiry but resolve to nothing here.
    return NextResponse.json(
      { error: "Supplier record not found. Owner may have removed it." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    supplier,
    session: {
      email: auth.email,
      role: "Supplier",
      supplierId: auth.supplierId,
      exp: auth.payload.exp,
    },
  });
}
