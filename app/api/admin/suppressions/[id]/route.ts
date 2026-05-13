import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/suppressions/[id] â€” remove an email from the
 * suppression list. Used SPARINGLY â€” only when the operator has
 * explicit re-opt-in consent from the recipient. Removing a
 * suppression without consent is a CAN-SPAM violation.
 *
 * This endpoint does NOT propagate to BusinessRecord.doNotContact
 * automatically â€” operator should manually flip that flag too if
 * they want the business to be re-eligible for outreach. Keeping
 * these separate is intentional: "remove from suppression list"
 * and "re-enable outreach to this business" are distinct decisions.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "system:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const ok = await store.removeEmailSuppression(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
