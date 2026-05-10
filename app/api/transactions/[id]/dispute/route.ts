import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { transitionTransaction } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/transactions/[id]/dispute  — buyer (or operator) opens a dispute.
 * Body: { token: string, reason: string }
 *
 * Transitions: escrow_held|shipped|delivered → disputed.
 *
 * Disputed state freezes escrow until operator resolves with one of:
 *   POST /api/transactions/[id]/resolve  body: { resolution: "refund_buyer" | "release_supplier" | "split" }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const txn = await store.getTransaction(params.id);
  if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  let body: { token?: string; reason?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.token || body.token !== txn.shareToken) {
    return NextResponse.json({ error: "Invalid or missing share token" }, { status: 403 });
  }
  if (!body.reason || body.reason.trim().length < 10) {
    return NextResponse.json(
      { error: "reason required (min 10 chars — describe the issue)" },
      { status: 400 },
    );
  }

  try {
    const updated = await transitionTransaction({
      id: params.id,
      to: "disputed",
      actor: "buyer",
      detail: `Dispute raised: ${body.reason.trim().slice(0, 200)}`,
      patch: {
        disputedAt: new Date().toISOString(),
        disputeReason: body.reason.trim(),
        disputeResolution: "pending",
      },
    });
    return NextResponse.json({ ok: true, transaction: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Dispute failed" },
      { status: 400 },
    );
  }
}
