import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { transitionTransaction } from "@/lib/transactions";
import type { Carrier } from "@/lib/shipping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/transactions/[id]/ship  â€” operator/supplier marks shipped.
 * Body: { carrier: Carrier, trackingNumber: string, carrierName?: string }
 *
 * Transitions: escrow_held â†’ shipped.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: { carrier?: Carrier; trackingNumber?: string; carrierName?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.carrier || !body.trackingNumber) {
    return NextResponse.json({ error: "carrier + trackingNumber required" }, { status: 400 });
  }

  try {
    const updated = await transitionTransaction({
      id: params.id,
      to: "shipped",
      actor: "operator",
      detail: `Shipped via ${body.carrier} (tracking ${body.trackingNumber})`,
      patch: {
        shippingProvider: "manual",
        trackingNumber: body.trackingNumber,
        carrierName: body.carrierName ?? body.carrier,
        shippedAt: new Date().toISOString(),
      },
    });
    return NextResponse.json({ ok: true, transaction: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ship failed" },
      { status: 400 },
    );
  }
}
