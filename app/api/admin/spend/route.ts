import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { requireCapability } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily Anthropic spend ledger. Powers the admin spend page + lets ops
 * verify the circuit breaker is configured correctly.
 *
 * Returns last 30 days, today's totals, and the configured budget cap.
 */
export async function GET(req: Request) {
  const auth = await requireCapability(req, "billing:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const ledger = await store.getSpendLedger();
  const today = await store.getTodaySpend();
  const limitStr = process.env.ANTHROPIC_DAILY_BUDGET_USD;
  const budget =
    limitStr === "0"
      ? null
      : Number(limitStr ?? 50);

  return NextResponse.json({
    today,
    budget,
    ledger: ledger.slice(0, 30),
  });
}
