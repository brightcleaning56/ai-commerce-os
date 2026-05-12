import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/edges/[id]
 *
 * Operator removes one SupplyEdge from the graph. Used to clean up bad
 * AI-inferred edges (model hallucinated a brand) or revoke an
 * operator-added edge.
 *
 * Transaction-observed edges should NOT be hand-deleted — they're the
 * source of truth. We don't block the delete (an operator should be
 * able to clean up if needed) but a future "edges audit" page will
 * flag transaction-deleted edges so they can be reviewed.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const ok = await store.deleteSupplyEdge(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
