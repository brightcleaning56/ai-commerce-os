import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/transactions/[id]
 *
 * Two access patterns:
 *   1. Operator (Authorization: Bearer ADMIN_TOKEN or aicos_admin cookie) — full data
 *   2. Buyer (?t=<shareToken>) — full data + signs the public viewer flow
 *      Same data either way; the route just gates on either form of auth.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const txn = await store.getTransaction(params.id);
  if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  // Auto-release window — exposed so the buyer page can render the
  // dispute-deadline countdown authoritatively.
  const autoReleaseHours = Math.max(1, Number(process.env.AUTO_RELEASE_HOURS ?? "168") || 168);

  const token = req.nextUrl.searchParams.get("t") || "";
  if (token && token === txn.shareToken) {
    // Public buyer access — check expiry
    if (Date.now() > new Date(txn.shareExpiresAt).getTime()) {
      return NextResponse.json({ error: "Share link expired" }, { status: 410 });
    }
    return NextResponse.json({ transaction: txn, viewer: "buyer", autoReleaseHours });
  }

  // Otherwise require admin
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  return NextResponse.json({ transaction: txn, viewer: "operator", autoReleaseHours });
}
