import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { getRevenueStats } from "@/lib/transactions";
import { scoreLead } from "@/lib/leadScore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/reports — aggregates everything the /reports page needs from
 * the persistent store. Replaces the legacy hardcoded REVENUE_BY_MONTH /
 * AGENT_ROI / FUNNEL / COHORTS / CATEGORY_REVENUE arrays.
 *
 * On a fresh install (no transactions, no drafts, no runs) every series
 * comes back empty. The page renders empty-state callouts.
 */
export async function GET() {
  const [products, drafts, runs, transactions] = await Promise.all([
    store.getProducts(),
    store.getDrafts(),
    store.getRuns(),
    store.getTransactions(),
  ]);
  const revenue = await getRevenueStats();

  // ── Revenue by month — from revenue ledger (last 7 months) ──────────
  const revenueByMonth = revenue.byMonth.slice(-7).map((m) => {
    const monthDate = new Date(m.month + "-01");
    const monthLabel = monthDate.toLocaleString("en-US", { month: "short" });
    const released = transactions.filter(
      (t) => (t.state === "released" || t.state === "completed") && (t.escrowReleasedAt ?? t.updatedAt ?? "").startsWith(m.month),
    ).length;
    return {
      m: monthLabel,
      revenue: Math.round((m.platformFeesCents + m.escrowFeesCents) / 100),
      deals: released,
    };
  });

  // ── Agent ROI — spend from runs, revenue from completed transactions ─
  const agentSpend = new Map<string, number>();
  const agentRunCount = new Map<string, number>();
  for (const r of runs) {
    agentSpend.set(r.agent, (agentSpend.get(r.agent) ?? 0) + (r.estCostUsd ?? 0));
    agentRunCount.set(r.agent, (agentRunCount.get(r.agent) ?? 0) + 1);
  }
  // Total platform revenue we can attribute equally across all 6 agents
  // (no per-agent attribution model yet — split evenly across agents that ran)
  const totalPlatformRevenue = revenue.netPlatformRevenueCents / 100;
  const agentsThatRan = Array.from(agentSpend.keys()).filter((a) => (agentRunCount.get(a) ?? 0) > 0);
  const sharePerAgent = agentsThatRan.length === 0 ? 0 : totalPlatformRevenue / agentsThatRan.length;

  const AGENT_LABEL: Record<string, string> = {
    "trend-hunter": "Trend Hunter",
    "buyer-discovery": "Buyer Discovery",
    "supplier-finder": "Supplier Finder",
    outreach: "Outreach",
    negotiation: "Negotiation",
    risk: "Risk",
  };
  const agentROI = Array.from(agentSpend.entries())
    .filter(([agent, spend]) => spend > 0 || (agentRunCount.get(agent) ?? 0) > 0)
    .map(([agent, spend]) => {
      const rev = sharePerAgent;
      const roi = spend === 0 ? 0 : Math.round((rev / spend) * 100);
      return {
        agent: AGENT_LABEL[agent] ?? agent,
        spend: +spend.toFixed(2),
        revenue: Math.round(rev),
        roi,
      };
    })
    .sort((a, b) => b.roi - a.roi);

  // ── Outreach funnel — buyers → contacted → opened → replied → meetings → closed ─
  const buyersIdentified = (await store.getDiscoveredBuyers()).length;
  const contacted = drafts.filter((d) => d.status === "sent").length;
  const opened = drafts.filter((d) => Array.isArray((d as any).threadMessages) && (d as any).threadMessages.length > 0).length;
  const replied = opened; // single-pass: replied iff has at least one inbound thread message
  const meetings = transactions.filter((t) => ["proposed", "signed", "payment_pending", "escrow_held"].includes(t.state)).length;
  const closedWon = transactions.filter((t) => t.state === "completed" || t.state === "released").length;

  const funnel = [
    { stage: "Buyers identified", value: buyersIdentified, fill: "#7c3aed" },
    { stage: "Contacted", value: contacted, fill: "#a87dff" },
    { stage: "Opened", value: opened, fill: "#3b82f6" },
    { stage: "Replied", value: replied, fill: "#06b6d4" },
    { stage: "Meetings", value: meetings, fill: "#22c55e" },
    { stage: "Closed Won", value: closedWon, fill: "#10b981" },
  ];

  // ── Weekly cohorts — last 7 weeks, drafts grouped by week ─────────────
  function weekStart(d: Date): string {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - x.getDay());
    return x.toISOString().slice(0, 10);
  }
  const weeks: Map<string, { contacted: number; replied: number; meetings: number; closed: number }> = new Map();
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const w = new Date(now);
    w.setDate(w.getDate() - i * 7);
    weeks.set(weekStart(w), { contacted: 0, replied: 0, meetings: 0, closed: 0 });
  }
  for (const d of drafts) {
    const wk = weekStart(new Date(d.createdAt));
    if (!weeks.has(wk)) continue;
    const cur = weeks.get(wk)!;
    if (d.status === "sent") cur.contacted++;
    if (Array.isArray((d as any).threadMessages) && (d as any).threadMessages.length > 0) cur.replied++;
  }
  for (const t of transactions) {
    const wk = weekStart(new Date(t.createdAt));
    if (!weeks.has(wk)) continue;
    const cur = weeks.get(wk)!;
    if (["proposed", "signed", "payment_pending", "escrow_held"].includes(t.state)) cur.meetings++;
    if (t.state === "completed" || t.state === "released") cur.closed++;
  }
  const cohorts = Array.from(weeks.entries()).map(([_, v], idx) => ({
    week: `W-${6 - idx}`,
    ...v,
  }));

  // ── Category revenue — sum transaction productTotalCents joined to product category ─
  const productById = new Map(products.map((p) => [p.id, p]));
  const productByName = new Map(products.map((p) => [p.name, p]));
  const categoryRevenueMap = new Map<string, number>();
  for (const t of transactions) {
    if (t.state !== "completed" && t.state !== "released") continue;
    // Try to resolve category via product lookup. Fallback to "Uncategorized".
    const product = productByName.get(t.productName) ?? productById.get(t.productName);
    const cat = product?.category ?? "Uncategorized";
    categoryRevenueMap.set(cat, (categoryRevenueMap.get(cat) ?? 0) + Math.round(t.productTotalCents / 100));
  }
  const categoryRevenue = Array.from(categoryRevenueMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // ── Lead funnel — submission to won, every meaningful gate in between ─
  // Distinct from the outreach funnel (which is buyer-side). This one
  // measures the inbound-lead pipeline so the operator can see attrition
  // and AI-reply effectiveness in one chart.
  const leads = await store.getLeads();
  const leadAiReplied = leads.filter((l) => l.aiReply?.status === "sent").length;
  const leadFollowedUp = leads.filter((l) => (l.aiFollowups?.length ?? 0) > 0).length;
  const leadPromoted = leads.filter((l) => !!l.promotedToBuyerId).length;
  const leadAutoPromoted = leads.filter((l) => l.promotedBy === "auto").length;
  const leadQualified = leads.filter((l) => l.status === "qualified" || l.status === "won").length;
  const leadWon = leads.filter((l) => l.status === "won").length;
  const leadFunnel = [
    { stage: "Submitted", value: leads.length, fill: "#7c3aed" },
    { stage: "AI replied", value: leadAiReplied, fill: "#a87dff" },
    { stage: "Auto-followed up", value: leadFollowedUp, fill: "#3b82f6" },
    { stage: "Promoted to buyer", value: leadPromoted, fill: "#06b6d4" },
    { stage: "Qualified", value: leadQualified, fill: "#22c55e" },
    { stage: "Won", value: leadWon, fill: "#10b981" },
  ];

  // ── Lead tier distribution — hot/warm/cold counts driven by leadScore ─
  let hot = 0;
  let warm = 0;
  let cold = 0;
  for (const l of leads) {
    const s = scoreLead(l);
    if (s.tier === "hot") hot++;
    else if (s.tier === "warm") warm++;
    else cold++;
  }
  const leadsByTier = [
    { tier: "Hot", count: hot, fill: "#ef4444" },
    { tier: "Warm", count: warm, fill: "#f59e0b" },
    { tier: "Cold", count: cold, fill: "#64748b" },
  ];

  // ── Lead source distribution — contact-form vs signup-form ────────────
  const leadsBySource = [
    { source: "contact-form", count: leads.filter((l) => l.source === "contact-form").length },
    { source: "signup-form", count: leads.filter((l) => l.source === "signup-form").length },
  ].filter((s) => s.count > 0);

  // ── AI spend — daily totals (last 14 days) + lifetime by agent ──────
  const spendLedger = await store.getSpendLedger();
  // Ledger is stored newest-first and capped at 90 days; take 14 most recent.
  const last14Days = spendLedger.slice(0, 14).reverse();
  const aiSpendByDay = last14Days.map((e) => ({
    d: e.date.slice(5), // MM-DD for compact x-axis labels
    cost: +e.totalCostUsd.toFixed(4),
    calls: e.callCount,
  }));
  // Aggregate byAgent across all retained days
  const agentSpendMap = new Map<string, { cost: number; calls: number }>();
  for (const day of spendLedger) {
    for (const [agent, v] of Object.entries(day.byAgent)) {
      const cur = agentSpendMap.get(agent) ?? { cost: 0, calls: 0 };
      cur.cost += v.cost;
      cur.calls += v.calls;
      agentSpendMap.set(agent, cur);
    }
  }
  const aiSpendByAgent = Array.from(agentSpendMap.entries())
    .map(([agent, v]) => ({
      agent: AGENT_LABEL[agent] ?? agent,
      cost: +v.cost.toFixed(4),
      calls: v.calls,
    }))
    .sort((a, b) => b.cost - a.cost);
  const aiSpendTotal14d = aiSpendByDay.reduce((s, d) => s + d.cost, 0);
  const aiCallsTotal14d = aiSpendByDay.reduce((s, d) => s + d.calls, 0);

  // ── Discovery output — how many products / buyers / suppliers the
  // pipeline discovered, by day (last 14 days). Drives a chart showing
  // whether the system is producing new top-of-funnel.
  const discoveredBuyers = await store.getDiscoveredBuyers();
  const discoveredSuppliers = await store.getDiscoveredSuppliers();
  function bucketByDay<T extends { createdAt?: string; discoveredAt?: string }>(items: T[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const it of items) {
      const ts = it.discoveredAt ?? it.createdAt;
      if (!ts) continue;
      const d = ts.slice(0, 10);
      m.set(d, (m.get(d) ?? 0) + 1);
    }
    return m;
  }
  const productCounts = bucketByDay(products);
  const buyerCounts = bucketByDay(discoveredBuyers);
  const supplierCounts = bucketByDay(discoveredSuppliers);
  const today = new Date();
  const discoveryByDay = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - (13 - i));
    const key = d.toISOString().slice(0, 10);
    return {
      d: key.slice(5),
      products: productCounts.get(key) ?? 0,
      buyers: buyerCounts.get(key) ?? 0,
      suppliers: supplierCounts.get(key) ?? 0,
    };
  });
  const discoveryTotal14d = discoveryByDay.reduce(
    (acc, d) => ({
      products: acc.products + d.products,
      buyers: acc.buyers + d.buyers,
      suppliers: acc.suppliers + d.suppliers,
    }),
    { products: 0, buyers: 0, suppliers: 0 },
  );

  // ── Compliance summary — suppression list breakdown for CAN-SPAM
  // visibility. Bounces + complaints come from Postmark webhook,
  // unsubscribes from /api/unsubscribe, manual from operator.
  const suppressions = await store.getEmailSuppressions();
  const suppressionsBySource = new Map<string, number>();
  for (const s of suppressions) {
    suppressionsBySource.set(s.source, (suppressionsBySource.get(s.source) ?? 0) + 1);
  }
  const complianceSummary = {
    suppressionTotal: suppressions.length,
    bySource: Array.from(suppressionsBySource.entries()).map(([source, count]) => ({ source, count })),
    bounces: suppressionsBySource.get("hard_bounce") ?? 0,
    complaints: suppressionsBySource.get("complaint") ?? 0,
    unsubscribes: suppressionsBySource.get("unsubscribe") ?? 0,
    manualAdds: suppressionsBySource.get("operator") ?? 0,
    imports: suppressionsBySource.get("import") ?? 0,
  };

  const hasAnyData =
    revenueByMonth.length > 0 ||
    agentROI.length > 0 ||
    contacted > 0 ||
    closedWon > 0 ||
    transactions.length > 0 ||
    leads.length > 0;

  return NextResponse.json({
    hasAnyData,
    revenueByMonth,
    agentROI,
    funnel,
    cohorts,
    categoryRevenue,
    // New sections — every report now shipped lives here so the page
    // can render them and the CSV export can include them.
    leadFunnel,
    leadsByTier,
    leadsBySource,
    leadStats: {
      total: leads.length,
      aiReplied: leadAiReplied,
      followedUp: leadFollowedUp,
      promoted: leadPromoted,
      autoPromoted: leadAutoPromoted,
      qualified: leadQualified,
      won: leadWon,
    },
    aiSpendByDay,
    aiSpendByAgent,
    aiSpendStats: {
      total14dUsd: +aiSpendTotal14d.toFixed(4),
      calls14d: aiCallsTotal14d,
      dailyBudgetUsd:
        process.env.ANTHROPIC_DAILY_BUDGET_USD === "0"
          ? null
          : Number(process.env.ANTHROPIC_DAILY_BUDGET_USD ?? 50),
    },
    discoveryByDay,
    discoveryStats: discoveryTotal14d,
    complianceSummary,
    headline: {
      totalRevenue: revenueByMonth.reduce((s, m) => s + m.revenue, 0),
      totalDeals: closedWon,
      lastMonthRevenue: revenueByMonth.at(-1)?.revenue ?? 0,
      prevMonthRevenue: revenueByMonth.at(-2)?.revenue ?? 0,
    },
  });
}
