import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { transitionTransaction } from "@/lib/transactions";
import { requireCapability } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/transactions/[id]/deliver  â€” mark as delivered.
 *
 * Two callers:
 *   - Buyer: body has { token, confirmedBy: "buyer" } â€” public access via share token
 *   - Operator: bearer/cookie auth â€” body has { confirmedBy: "operator"|"carrier" }
 *
 * Transitions: shipped â†’ delivered.
 *
 * After delivery, the system enters a 7-day inspection window. If buyer doesn't
 * dispute within that window, an automated cron (future slice) will release.
 * For now: delivered stays in `delivered` state until explicit /release call.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const txn = await store.getTransaction(params.id);
  if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  let body: { token?: string; confirmedBy?: "buyer" | "operator" | "carrier" } = {};
  try {
    body = await req.json();
  } catch {
    // body optional for operator path
  }

  let actor: "buyer" | "operator" = "operator";
  let confirmedBy: "buyer_confirmed" | "operator" | "carrier" = "operator";

  // Buyer path: token in body
  if (body.token && body.token === txn.shareToken) {
    actor = "buyer";
    confirmedBy = "buyer_confirmed";
  } else {
    // Operator path: require bearer/cookie auth
    const auth = await requireCapability(req, "transactions:write");
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
    confirmedBy =
      body.confirmedBy === "carrier"
        ? "carrier"
        : "operator";
  }

  try {
    const updated = await transitionTransaction({
      id: params.id,
      to: "delivered",
      actor,
      detail: `Delivery confirmed (${confirmedBy})`,
      patch: {
        deliveredAt: new Date().toISOString(),
        deliveryConfirmedBy: confirmedBy,
      },
    });
    return NextResponse.json({ ok: true, transaction: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Deliver failed" },
      { status: 400 },
    );
  }
}
