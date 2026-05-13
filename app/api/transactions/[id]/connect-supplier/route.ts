import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { createAccountLink, createConnectedAccount, retrieveConnectedAccount } from "@/lib/payments";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/transactions/[id]/connect-supplier â€” onboard the supplier to
 * Stripe Connect so the platform can route the supplier portion of the
 * payment via destination charges (transfer_data.destination on the
 * checkout session).
 *
 * Behavior:
 *   - If the transaction already has a supplierStripeAccountId, generate a
 *     fresh AccountLink (type="account_update") so the supplier can refresh
 *     any newly-required fields. Returns the hosted URL.
 *   - Otherwise, create a new Express account, persist the id on the
 *     transaction, and return an AccountLink (type="account_onboarding").
 *   - In simulated mode, fakes everything end-to-end so the operator UI
 *     can demo without real Stripe creds.
 *
 * Body (optional):
 *   { country?: string, businessName?: string, email?: string }
 *
 * Returns:
 *   { url, accountId, mode, alreadyConnected, status: ConnectedAccount }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCapability(req, "transactions:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const txn = await store.getTransaction(params.id);
  if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  let body: { country?: string; businessName?: string; email?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body optional
  }

  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || req.nextUrl.origin || "";
  const refreshUrl = `${origin}/api/transactions/${txn.id}/connect-supplier/refresh`;
  const returnUrl = `${origin}/transactions?connected=${txn.id}`;

  let accountId = txn.supplierStripeAccountId;
  let alreadyConnected = false;

  // Reuse existing account if we have one â€” generate an update link so the
  // supplier can clear any newly-flagged requirements.
  if (accountId) {
    alreadyConnected = true;
  } else {
    const created = await createConnectedAccount({
      country: body.country,
      businessName: body.businessName ?? txn.supplierName,
      email: body.email,
    });
    if (!created.ok || !created.accountId) {
      return NextResponse.json(
        { error: created.errorMessage ?? "Failed to create connected account" },
        { status: 502 },
      );
    }
    accountId = created.accountId;
    await store.patchTransaction(txn.id, { supplierStripeAccountId: accountId });
  }

  const link = await createAccountLink({
    accountId,
    refreshUrl,
    returnUrl,
    type: alreadyConnected ? "account_update" : "account_onboarding",
  });
  if (!link.ok || !link.url) {
    return NextResponse.json(
      { error: link.errorMessage ?? "Failed to generate onboarding link" },
      { status: 502 },
    );
  }

  // Best-effort status fetch so the operator UI can show enabled / pending
  const status = await retrieveConnectedAccount(accountId);

  return NextResponse.json({
    ok: true,
    url: link.url,
    accountId,
    alreadyConnected,
    status: status.account ?? null,
  });
}

/**
 * GET â€” return current onboarding status for the supplier on this transaction.
 * Used by the operator UI to display chargesEnabled / payoutsEnabled / due-fields.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCapability(req, "transactions:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const txn = await store.getTransaction(params.id);
  if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  if (!txn.supplierStripeAccountId) {
    return NextResponse.json({ connected: false, accountId: null, status: null });
  }
  const status = await retrieveConnectedAccount(txn.supplierStripeAccountId);
  return NextResponse.json({
    connected: true,
    accountId: txn.supplierStripeAccountId,
    status: status.account ?? null,
    error: status.ok ? null : status.errorMessage,
  });
}
