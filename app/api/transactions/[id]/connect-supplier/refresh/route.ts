import { NextRequest, NextResponse } from "next/server";
import { createAccountLink } from "@/lib/payments";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/transactions/[id]/connect-supplier/refresh
 *
 * Stripe redirects the supplier here when an existing AccountLink expires
 * or the supplier abandoned partway. We mint a fresh link and 302-redirect
 * them straight back into the hosted onboarding flow.
 *
 * No auth — this is the public refresh endpoint Stripe calls. We rely on
 * the transaction.supplierStripeAccountId having been set already; without
 * it we redirect to /transactions where the operator can re-initiate.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const txn = await store.getTransaction(params.id);
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || req.nextUrl.origin || "";

  if (!txn || !txn.supplierStripeAccountId) {
    return NextResponse.redirect(`${origin}/transactions?connect_error=missing`);
  }

  const link = await createAccountLink({
    accountId: txn.supplierStripeAccountId,
    refreshUrl: `${origin}/api/transactions/${txn.id}/connect-supplier/refresh`,
    returnUrl: `${origin}/transactions?connected=${txn.id}`,
    type: "account_onboarding",
  });

  if (!link.ok || !link.url) {
    return NextResponse.redirect(`${origin}/transactions?connect_error=link`);
  }
  return NextResponse.redirect(link.url, { status: 302 });
}
