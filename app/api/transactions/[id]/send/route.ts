import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { transitionTransaction } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/transactions/[id]/send  â€” operator sends transaction to buyer.
 * Transitions: draft â†’ proposed.
 *
 * In production this would also send the buyer an email with the public link.
 * For now: returns the public URL so the operator can copy/paste manually.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCapability(req, "transactions:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  try {
    const txn = await transitionTransaction({
      id: params.id,
      to: "proposed",
      actor: "operator",
      detail: "Operator sent the proposal to the buyer",
    });
    const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || req.nextUrl.origin || "";
    const buyerUrl = origin
      ? `${origin}/transaction/${txn.id}?t=${txn.shareToken}`
      : `/transaction/${txn.id}?t=${txn.shareToken}`;
    return NextResponse.json({ ok: true, transaction: txn, buyerUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Send failed" },
      { status: 400 },
    );
  }
}
