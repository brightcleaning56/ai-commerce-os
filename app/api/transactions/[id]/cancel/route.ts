import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { transitionTransaction } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/transactions/[id]/cancel  — operator kills a transaction
 * before payment is held in escrow.
 *
 * Allowed only from: draft, proposed, signed, payment_pending.
 * After escrow_held, must use /dispute → /resolve flow instead.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: { reason?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body optional
  }

  try {
    const updated = await transitionTransaction({
      id: params.id,
      to: "cancelled",
      actor: "operator",
      detail: body.reason ? `Cancelled: ${body.reason.slice(0, 200)}` : "Cancelled by operator",
    });
    return NextResponse.json({ ok: true, transaction: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Cancel failed" },
      { status: 400 },
    );
  }
}
