import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { transitionTransaction } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/transactions/[id]/release  â€” release escrow to supplier.
 *
 * Operator-gated (or auto-triggered by the 7-day timeout cron â€” future).
 *
 * Transitions:
 *   delivered â†’ released â†’ completed (immediately advanced together)
 *
 * Side effects in lib/transactions.ts:
 *   - Revenue ledger: +platformFee, +escrowFee, -supplierPayout
 *   - In live mode: Stripe transfers to supplier's connected account auto-trigger
 *     because we set transfer_data.destination at checkout creation time.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  try {
    // delivered â†’ released
    const released = await transitionTransaction({
      id: params.id,
      to: "released",
      actor: "operator",
      detail: "Escrow released â€” supplier payout authorized",
      patch: {
        escrowReleasedAt: new Date().toISOString(),
        escrowReleaseAuthorizedBy: "operator",
      },
    });

    // released â†’ completed (terminal)
    const completed = await transitionTransaction({
      id: params.id,
      to: "completed",
      actor: "system",
      detail: "Transaction completed",
    });

    return NextResponse.json({ ok: true, transaction: completed });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Release failed" },
      { status: 400 },
    );
  }
}
