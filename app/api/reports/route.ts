import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { getRevenueStats } from "@/lib/transactions";

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

  const hasAnyData =
    revenueByMonth.length > 0 ||
    agentROI.length > 0 ||
    contacted > 0 ||
    closedWon > 0 ||
    transactions.length > 0;

  return NextResponse.json({
    hasAnyData,
    revenueByMonth,
    agentROI,
    funnel,
    cohorts,
    categoryRevenue,
    headline: {
      totalRevenue: revenueByMonth.reduce((s, m) => s + m.revenue, 0),
      totalDeals: closedWon,
      lastMonthRevenue: revenueByMonth.at(-1)?.revenue ?? 0,
      prevMonthRevenue: revenueByMonth.at(-2)?.revenue ?? 0,
    },
  });
}
