import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { getRevenueStats } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/stats — aggregates real numbers from the store for
 * the Command Center KPI grid + welcome message.
 *
 * No auth gate — called from the client-side dashboard which is already
 * inside the (app) layout (admin-protected via middleware).
 *
 * Returns zeros + hasAnyData=false on a fresh install so the dashboard can
 * render an empty-state CTA instead of pretending demo numbers are real.
 */
export async function GET() {
  const [products, buyers, drafts, runs, transactions] = await Promise.all([
    store.getProducts(),
    store.getDiscoveredBuyers(),
    store.getDrafts(),
    store.getRuns(),
    store.getTransactions(),
  ]);

  const sentDrafts = drafts.filter((d) => d.status === "sent").length;
  const respondedDrafts = drafts.filter((d) => Array.isArray((d as any).threadMessages) && (d as any).threadMessages.length > 0).length;
  const highDemandCount = products.filter((p) => (p.demandScore ?? 0) >= 70).length;
  const totalOpportunities = products.length + buyers.length + drafts.length;

  // Active deal pipeline = non-terminal transaction states
  const activeDealStates = ["draft", "proposed", "signed", "payment_pending", "escrow_held", "shipped", "delivered"];
  const dealsInPipeline = transactions.filter((t) => activeDealStates.includes(t.state)).length;
  const pipelineValueCents = transactions
    .filter((t) => activeDealStates.includes(t.state))
    .reduce((s, t) => s + t.productTotalCents, 0);

  // Revenue ledger for the est-revenue and platform-fee numbers
  const revenue = await getRevenueStats();

  const hasAnyData =
    products.length > 0 ||
    buyers.length > 0 ||
    drafts.length > 0 ||
    runs.length > 0 ||
    transactions.length > 0;

  return NextResponse.json({
    hasAnyData,
    totals: {
      opportunities: totalOpportunities,
      highDemandProducts: highDemandCount,
      buyersContacted: sentDrafts,
      responsesReceived: respondedDrafts,
      dealsInPipeline,
      pipelineValueCents,
      // "Estimated revenue" = sum of in-flight escrow + already-released net platform revenue
      estRevenueCents: pipelineValueCents + revenue.netPlatformRevenueCents,
    },
    counts: {
      products: products.length,
      buyers: buyers.length,
      drafts: drafts.length,
      runs: runs.length,
      transactions: transactions.length,
    },
  });
}
