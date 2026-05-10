import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createTransactionFromQuote } from "@/lib/transactions";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/transactions  — list all transactions (operator-gated)
 */
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const txns = await store.getTransactions();
  return NextResponse.json({ transactions: txns });
}

/**
 * POST /api/transactions  — create a new transaction from an existing quote.
 * Body: {
 *   quoteId: string,
 *   shippingCents?: number,
 *   refundPolicy?: string,
 *   supplierName?: string,
 *   supplierStripeAccountId?: string,
 *   buyerEmail?: string,
 * }
 */
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: {
    quoteId?: string;
    shippingCents?: number;
    refundPolicy?: string;
    supplierName?: string;
    supplierStripeAccountId?: string;
    buyerEmail?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.quoteId) return NextResponse.json({ error: "Missing quoteId" }, { status: 400 });

  const quote = await store.getQuote(body.quoteId);
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  // Idempotent: if a transaction already exists for this quote, return it
  const existing = await store.getTransactionByQuote(body.quoteId);
  if (existing) {
    return NextResponse.json({ transaction: existing, alreadyExisted: true });
  }

  const txn = await createTransactionFromQuote(quote, {
    shippingCents: body.shippingCents,
    refundPolicy: body.refundPolicy,
    supplierName: body.supplierName,
    supplierStripeAccountId: body.supplierStripeAccountId,
    buyerEmail: body.buyerEmail,
  });

  return NextResponse.json({ transaction: txn, alreadyExisted: false });
}
