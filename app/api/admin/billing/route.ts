import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Real billing data for /admin/billing.
 *
 * What's real today:
 *   - usage:        derived from real stores (drafts sent, buyers
 *                   discovered, suppliers tracked, products discovered,
 *                   AI cost from spend ledger, API call count from
 *                   api-keys usageWindow)
 *   - subscription: honest Stripe state (not configured / configured /
 *                   live). When STRIPE_SECRET_KEY isn't set, returns
 *                   { configured: false } so the UI shows "no
 *                   subscription active â€” wire Stripe to enable"
 *                   instead of pretending the operator is on Growth.
 *   - invoices:     []. Real Stripe invoice fetch ships when subscriptions
 *                   are wired; until then we never invent rows.
 *
 * What we deliberately do NOT do:
 *   - Pretend the operator is on a paid plan they never bought
 *   - Show fake usage numbers ("4,120,000 AI tokens" was hardcoded
 *     before this slice â€” now it's the real spend-ledger month total)
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "billing:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const [drafts, buyers, suppliers, products, apiKeys, ledger] = await Promise.all([
    store.getDrafts().catch(() => []),
    store.getDiscoveredBuyers().catch(() => []),
    store.getDiscoveredSuppliers().catch(() => []),
    store.getProducts().catch(() => []),
    store.getApiKeys().catch(() => []),
    store.getSpendLedger().catch(() => []),
  ]);

  // â”€â”€ Usage (calendar month) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthStartMs = new Date(monthStart).getTime();

  const sentDraftsThisMonth = drafts.filter(
    (d) => d.sentAt && new Date(d.sentAt).getTime() >= monthStartMs,
  ).length;

  // Spend ledger entries are { date: 'YYYY-MM-DD', totalCostUsd, callCount, ... }
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthSpend = ledger
    .filter((e) => e.date.startsWith(monthPrefix))
    .reduce(
      (acc, e) => ({
        cost: acc.cost + (e.totalCostUsd ?? 0),
        calls: acc.calls + (e.callCount ?? 0),
      }),
      { cost: 0, calls: 0 },
    );

  // API calls in the last 24h â€” sum of usageWindow lengths across active keys
  const apiCalls24h = apiKeys.reduce((acc, k) => acc + (k.usageWindow?.length ?? 0), 0);

  // â”€â”€ Subscription state (honest) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
  const stripeConfigured = !!stripeKey;
  const stripeLive =
    stripeKey.startsWith("sk_live_") && process.env.STRIPE_LIVE === "true";
  const stripeMode = !stripeConfigured ? "none" : stripeLive ? "live" : "test";

  return NextResponse.json({
    subscription: {
      configured: stripeConfigured,
      mode: stripeMode,                         // "none" | "test" | "live"
      // Until we actually call Stripe, status is honest:
      status: stripeConfigured ? "configured-but-not-yet-fetched" : "no-subscription",
      planId: null,                              // null = no active plan
      currentPeriodEnd: null,
      message: stripeConfigured
        ? `Stripe ${stripeMode === "live" ? "LIVE" : "TEST"} mode key detected. Subscription fetch ships in the next slice.`
        : "No Stripe key configured. Set STRIPE_SECRET_KEY (sk_live_â€¦ for production, STRIPE_LIVE=true) in Netlify env to enable subscription billing.",
    },
    usage: {
      monthLabel: now.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      // Each item: { label, used, cap (or null = uncapped today), hint }
      items: [
        {
          label: "Products discovered (lifetime)",
          used: products.length,
          cap: null,
          hint: "Lifetime, not month â€” products accumulate",
        },
        {
          label: "Buyers discovered (lifetime)",
          used: buyers.length,
          cap: null,
          hint: "Lifetime â€” buyers accumulate across pipeline runs",
        },
        {
          label: "Suppliers discovered (lifetime)",
          used: suppliers.length,
          cap: null,
          hint: "Lifetime",
        },
        {
          label: "Outreach sends (this month)",
          used: sentDraftsThisMonth,
          cap: null,
          hint: "Email + SMS + LinkedIn drafts that actually went out",
        },
        {
          label: "AI spend (this month)",
          used: Math.round(monthSpend.cost * 10000) / 10000,
          unit: "$",
          cap: null,
          hint: `${monthSpend.calls.toLocaleString()} Anthropic calls Â· daily budget = $${process.env.ANTHROPIC_DAILY_BUDGET_USD ?? "50"}`,
        },
        {
          label: "API calls (last 24h)",
          used: apiCalls24h,
          cap: null,
          hint: `Across ${apiKeys.filter((k) => k.status === "Active").length} active API keys`,
        },
      ],
    },
    invoices: [],
    invoicesNote: stripeConfigured
      ? "Real Stripe invoice fetch ships in the next slice."
      : "No invoices to show â€” billing isn't configured yet.",
  });
}
