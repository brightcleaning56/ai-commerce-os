import { NextRequest, NextResponse } from "next/server";
import { createCheckout, getPaymentMode } from "@/lib/payments";
import { store } from "@/lib/store";
import { transitionTransaction } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/transactions/[id]/pay  — buyer initiates payment.
 *
 * Body: { token: string }
 *
 * In simulated mode: marks the transaction `escrow_held` immediately and
 * returns a JSON success — buyer-side UI just refreshes.
 *
 * In sandbox/live mode: creates a Stripe Checkout session and returns the
 * redirect URL. The buyer is redirected; on payment success Stripe sends a
 * webhook that transitions us to escrow_held.
 *
 * Transitions:
 *   signed → payment_pending  (always)
 *   payment_pending → escrow_held  (simulated mode only — sandbox/live wait for webhook)
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const txn = await store.getTransaction(params.id);
  if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  let body: { token?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.token || body.token !== txn.shareToken) {
    return NextResponse.json({ error: "Invalid or missing share token" }, { status: 403 });
  }
  if (txn.state !== "signed") {
    return NextResponse.json(
      { error: `Transaction must be in 'signed' state, currently '${txn.state}'` },
      { status: 400 },
    );
  }

  // First transition: signed → payment_pending
  await transitionTransaction({
    id: params.id,
    to: "payment_pending",
    actor: "buyer",
    detail: "Buyer initiated payment",
  });

  // Build Stripe Checkout session (or simulated equivalent)
  const origin =
    process.env.NEXT_PUBLIC_APP_ORIGIN || req.nextUrl.origin || "";
  const successUrl = `${origin}/transaction/${txn.id}?t=${txn.shareToken}&paid=1`;
  const cancelUrl = `${origin}/transaction/${txn.id}?t=${txn.shareToken}&paid=cancelled`;

  const checkout = await createCheckout({
    transactionId: txn.id,
    amountCents: txn.productTotalCents,
    currency: "usd",
    description: `${txn.productName} × ${txn.quantity} for ${txn.buyerCompany}`,
    buyerEmail: txn.buyerEmail,
    successUrl,
    cancelUrl,
    destinationAccountId: txn.supplierStripeAccountId,
    applicationFeeCents: txn.platformFeeCents + txn.escrowFeeCents,
    metadata: {
      transactionId: txn.id,
      quoteId: txn.quoteId,
    },
  });

  if (!checkout.ok) {
    return NextResponse.json(
      { error: checkout.errorMessage ?? "Checkout creation failed", mode: checkout.mode },
      { status: 502 },
    );
  }

  // Persist checkout session/intent IDs
  await store.patchTransaction(txn.id, {
    paymentProvider: checkout.mode === "simulated" ? "simulated" : "stripe",
    stripeCheckoutSessionId: checkout.sessionId,
    stripePaymentIntentId: checkout.paymentIntentId,
  });

  // Simulated mode: skip Stripe entirely, mark escrow_held now
  if (checkout.mode === "simulated") {
    const updated = await transitionTransaction({
      id: params.id,
      to: "escrow_held",
      actor: "system",
      detail: "Payment simulated — funds marked as escrow held",
      patch: {
        escrowStartedAt: new Date().toISOString(),
        paymentReceivedAt: new Date().toISOString(),
      },
    });
    return NextResponse.json({
      ok: true,
      mode: "simulated",
      transaction: updated,
      checkoutUrl: checkout.checkoutUrl,
    });
  }

  // Sandbox/live: return the Stripe URL — buyer will be redirected
  return NextResponse.json({
    ok: true,
    mode: getPaymentMode(),
    checkoutUrl: checkout.checkoutUrl,
    sessionId: checkout.sessionId,
  });
}
