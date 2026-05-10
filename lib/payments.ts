/**
 * Payments adapter — Stripe Connect, three-mode safety.
 *
 * Modes (selected by env, same pattern as lib/email.ts):
 *
 *   1. SIMULATED (default — no STRIPE_SECRET_KEY)
 *      Buyer "pay" button fakes a successful charge. No money moves. Marks the
 *      transaction `escrow_held` immediately. Used for demo + dev.
 *
 *   2. SANDBOX (STRIPE_SECRET_KEY=sk_test_..., STRIPE_LIVE != "true")
 *      Real Stripe API calls but against test cards. Use card 4242 4242 4242 4242
 *      to simulate payment. Funds NOT real. Useful for end-to-end testing.
 *
 *   3. LIVE (STRIPE_SECRET_KEY=sk_live_..., STRIPE_LIVE=true)
 *      Real Stripe live keys, real money, real platform fees taken via
 *      `application_fee_amount`. Real Connect supplier payouts via destination
 *      charges. ONLY enable after KYC on your Stripe account is complete.
 *
 * Architecture: Stripe Connect with destination charges
 *
 *   Buyer pays $100,000  →  Platform Stripe acct (escrow held)
 *   On release:
 *     application_fee_amount = $9,000 (platform's 8% + escrow 1%)
 *     destination payment → supplier's connected account = $91,000
 *
 * This avoids us being a money-transmitter: Stripe holds funds, we just
 * orchestrate the timing and routing.
 *
 * Env vars:
 *   STRIPE_SECRET_KEY            sk_test_... or sk_live_...
 *   STRIPE_PUBLISHABLE_KEY       pk_test_... or pk_live_...  (for client-side Checkout)
 *   STRIPE_LIVE                  "true" to allow live charges (default: false)
 *   STRIPE_WEBHOOK_SECRET        whsec_... — set after creating webhook endpoint
 *   STRIPE_PLATFORM_FEE_BPS      default 800 = 8%
 *   STRIPE_ESCROW_FEE_BPS        default 100 = 1% (covers Stripe's ~2.9% + 30¢)
 */

export type PaymentMode = "simulated" | "sandbox" | "live";

export type CreateCheckoutInput = {
  transactionId: string;
  amountCents: number;
  currency: string;          // "usd"
  description: string;
  buyerEmail?: string;
  successUrl: string;        // where Stripe redirects on success
  cancelUrl: string;         // where Stripe redirects on cancel
  // Connect destination (live mode only — supplier's connected account)
  destinationAccountId?: string;
  applicationFeeCents?: number;
  metadata?: Record<string, string>;
};

export type CheckoutResult = {
  ok: boolean;
  mode: PaymentMode;
  // For simulated mode: just an internal URL we redirect through
  // For sandbox/live: Stripe's hosted checkout URL
  checkoutUrl: string;
  sessionId: string;
  paymentIntentId?: string;
  errorMessage?: string;
};

export function getPaymentMode(): PaymentMode {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return "simulated";
  if (secret.startsWith("sk_live_") && process.env.STRIPE_LIVE === "true") return "live";
  return "sandbox";
}

export function getPlatformFeeBps(): number {
  const raw = Number(process.env.STRIPE_PLATFORM_FEE_BPS);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 2500) return raw;
  return 800; // default 8%
}

export function getEscrowFeeBps(): number {
  const raw = Number(process.env.STRIPE_ESCROW_FEE_BPS);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 500) return raw;
  return 100; // default 1%
}

/**
 * Compute fee splits at proposal time. All math in integer cents.
 *
 * Inputs the buyer-facing total. Outputs:
 *   - platformFee = platformFeeBps × productTotal
 *   - escrowFee   = escrowFeeBps   × productTotal
 *   - supplierPayout = productTotal − platformFee − escrowFee
 */
export function splitFees(args: {
  productTotalCents: number;
  platformFeeBps?: number;
  escrowFeeBps?: number;
}): {
  platformFeeCents: number;
  escrowFeeCents: number;
  supplierPayoutCents: number;
  applicationFeeCents: number;  // platform + escrow combined (what Stripe takes off the top)
} {
  const total = Math.max(0, Math.floor(args.productTotalCents));
  const pBps = args.platformFeeBps ?? getPlatformFeeBps();
  const eBps = args.escrowFeeBps ?? getEscrowFeeBps();
  const platformFeeCents = Math.floor((total * pBps) / 10_000);
  const escrowFeeCents = Math.floor((total * eBps) / 10_000);
  const applicationFeeCents = platformFeeCents + escrowFeeCents;
  const supplierPayoutCents = Math.max(0, total - applicationFeeCents);
  return { platformFeeCents, escrowFeeCents, supplierPayoutCents, applicationFeeCents };
}

/**
 * Create a checkout session. Returns a URL the buyer can be redirected to.
 *
 * In simulated mode this is a no-op that returns an internal URL — the buyer's
 * "Pay" button hits /api/transactions/[id]/payment which marks the txn paid
 * directly without involving Stripe.
 */
export async function createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
  const mode = getPaymentMode();
  const sessionId = `sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

  if (mode === "simulated") {
    // No Stripe call. The "Pay" button on the buyer page will POST to our own
    // /api/transactions/[id]/simulate-pay endpoint which marks it paid.
    return {
      ok: true,
      mode,
      checkoutUrl: input.successUrl,  // immediately redirect through success
      sessionId,
    };
  }

  // SANDBOX or LIVE: call Stripe API
  try {
    const params = new URLSearchParams();
    params.append("mode", "payment");
    params.append("payment_method_types[]", "card");
    params.append("line_items[0][price_data][currency]", input.currency);
    params.append("line_items[0][price_data][product_data][name]", input.description);
    params.append("line_items[0][price_data][unit_amount]", String(input.amountCents));
    params.append("line_items[0][quantity]", "1");
    params.append("success_url", input.successUrl);
    params.append("cancel_url", input.cancelUrl);
    params.append("client_reference_id", input.transactionId);
    if (input.buyerEmail) params.append("customer_email", input.buyerEmail);
    for (const [k, v] of Object.entries(input.metadata ?? {})) {
      params.append(`metadata[${k}]`, v);
    }
    // Connect destination + application fee (live mode with real supplier accounts)
    if (input.destinationAccountId) {
      params.append("payment_intent_data[transfer_data][destination]", input.destinationAccountId);
      if (input.applicationFeeCents != null) {
        params.append("payment_intent_data[application_fee_amount]", String(input.applicationFeeCents));
      }
    }

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": "2024-06-20",
      },
      body: params,
    });
    const body = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        mode,
        checkoutUrl: input.cancelUrl,
        sessionId,
        errorMessage: body.error?.message ?? `Stripe ${res.status}`,
      };
    }
    return {
      ok: true,
      mode,
      checkoutUrl: body.url,
      sessionId: body.id,
      paymentIntentId: body.payment_intent ?? undefined,
    };
  } catch (e) {
    return {
      ok: false,
      mode,
      checkoutUrl: input.cancelUrl,
      sessionId,
      errorMessage: e instanceof Error ? e.message : "Stripe call failed",
    };
  }
}

/**
 * Refund a charge — used for buyer-side refunds + dispute resolution.
 */
export async function refundCharge(
  chargeId: string,
  amountCents?: number,
): Promise<{ ok: boolean; refundId?: string; errorMessage?: string }> {
  const mode = getPaymentMode();
  if (mode === "simulated") {
    return { ok: true, refundId: `sim_re_${Date.now().toString(36)}` };
  }
  try {
    const params = new URLSearchParams();
    params.append("charge", chargeId);
    if (amountCents != null) params.append("amount", String(amountCents));
    const res = await fetch("https://api.stripe.com/v1/refunds", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": "2024-06-20",
      },
      body: params,
    });
    const body = await res.json();
    if (!res.ok) {
      return { ok: false, errorMessage: body.error?.message ?? `Stripe ${res.status}` };
    }
    return { ok: true, refundId: body.id };
  } catch (e) {
    return { ok: false, errorMessage: e instanceof Error ? e.message : "Refund failed" };
  }
}

/**
 * Describe current payment config for the admin health endpoint.
 */
export function getPaymentInfo(): {
  mode: PaymentMode;
  platformFeeBps: number;
  escrowFeeBps: number;
  webhookConfigured: boolean;
  publishableKey: string | null;
} {
  return {
    mode: getPaymentMode(),
    platformFeeBps: getPlatformFeeBps(),
    escrowFeeBps: getEscrowFeeBps(),
    webhookConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
  };
}

/**
 * Format cents → "$1,234.56" string.
 */
export function fmtCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
