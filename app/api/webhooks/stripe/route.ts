import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { transitionTransaction } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook receiver. Configure in Stripe dashboard:
 *   - URL: https://<your-domain>/api/webhooks/stripe
 *   - Events: checkout.session.completed, payment_intent.succeeded,
 *     payment_intent.payment_failed, charge.refunded
 *   - Copy the signing secret → STRIPE_WEBHOOK_SECRET env var
 *
 * Without STRIPE_WEBHOOK_SECRET set, this endpoint refuses all requests
 * (we won't trust unsigned webhook bodies).
 *
 * Behavior:
 *   checkout.session.completed   → transition payment_pending → escrow_held
 *   payment_intent.payment_failed → transition payment_pending → cancelled
 *   charge.refunded              → already handled via /resolve, but we log
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook not configured (STRIPE_WEBHOOK_SECRET unset)" },
      { status: 503 },
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });

  // Read raw body — Stripe signs the raw bytes, so we cannot use req.json()
  const rawBody = await req.text();

  if (!verifyStripeSignature(rawBody, sig, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { type: string; data: { object: any } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const txnId = session.client_reference_id || session.metadata?.transactionId;
        if (!txnId) {
          console.warn("[stripe-webhook] checkout.session.completed without transactionId");
          break;
        }
        const txn = await store.getTransaction(txnId);
        if (!txn) break;
        if (txn.state === "escrow_held") break; // idempotent

        await transitionTransaction({
          id: txnId,
          to: "escrow_held",
          actor: "system",
          detail: `Payment captured via Stripe (session ${session.id})`,
          patch: {
            paymentReceivedAt: new Date().toISOString(),
            escrowStartedAt: new Date().toISOString(),
            stripePaymentIntentId: session.payment_intent ?? txn.stripePaymentIntentId,
            stripeChargeId: session.latest_charge ?? undefined,
            paymentMethodLast4: session.payment_intent_data?.last4 ?? undefined,
          },
          meta: { stripeSessionId: session.id, amountTotal: session.amount_total },
        });
        break;
      }
      case "payment_intent.payment_failed": {
        const intent = event.data.object;
        const txnId = intent.metadata?.transactionId;
        if (!txnId) break;
        const txn = await store.getTransaction(txnId);
        if (!txn || txn.state !== "payment_pending") break;
        await transitionTransaction({
          id: txnId,
          to: "cancelled",
          actor: "system",
          detail: `Payment failed: ${intent.last_payment_error?.message ?? "unknown error"}`,
          meta: { stripeIntentId: intent.id, errorCode: intent.last_payment_error?.code },
        });
        break;
      }
      case "charge.refunded": {
        // Refunds initiated via /resolve already updated state; this is just a confirmation
        const charge = event.data.object;
        console.log(`[stripe-webhook] charge.refunded ${charge.id} amount=${charge.amount_refunded}`);
        break;
      }
      default:
        // Ignore other event types
        break;
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[stripe-webhook] processing failed:", e);
    // Return 500 so Stripe retries
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Webhook processing failed" },
      { status: 500 },
    );
  }
}

/**
 * Verify Stripe's signature using the documented HMAC-SHA256 scheme.
 * Header format: t=<timestamp>,v1=<signature>
 */
function verifyStripeSignature(body: string, header: string, secret: string): boolean {
  const parts = header.split(",").reduce<Record<string, string>>((acc, p) => {
    const [k, v] = p.split("=");
    if (k && v) acc[k] = v;
    return acc;
  }, {});
  const ts = parts.t;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  // Tolerance: reject events older than 5 minutes (replay protection)
  const tsMs = Number(ts) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
    return false;
  }

  const signed = `${ts}.${body}`;
  const expected = crypto.createHmac("sha256", secret).update(signed).digest("hex");
  if (expected.length !== v1.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
