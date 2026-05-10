import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getRevenueStats } from "@/lib/transactions";
import { getPaymentInfo } from "@/lib/payments";
import { getContractMode } from "@/lib/contracts";
import { getShippingMode } from "@/lib/shipping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/transactions/stats — operator-only.
 * Returns aggregate revenue/escrow stats plus the configured payment/contract/shipping modes.
 */
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const stats = await getRevenueStats();
  return NextResponse.json({
    stats,
    modes: {
      payment: getPaymentInfo(),
      contract: getContractMode(),
      shipping: getShippingMode(),
    },
  });
}
