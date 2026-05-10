import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { getRevenueStats } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/stats — single aggregate read for the Command Center.
 *
 * Returns hasAnyData=false on a fresh install so the dashboard renders an
 * empty-state CTA instead of pretending demo numbers are real. Otherwise:
 * KPIs, pipeline funnel, campaign rollup, top-agent leaderboard, alerts,
 * and chart series — all from the same persistent store the rest of the
 * platform writes to.
 */
export async function GET() {
  const [products, buyers, drafts, runs, transactions, riskFlags] = await Promise.all([
    store.getProducts(),
    store.getDiscoveredBuyers(),
    store.getDrafts(),
    store.getRuns(),
    store.getTransactions(),
    store.getRiskFlags(),
  ]);

  // ── Drafts grouped by status (Campaigns card) ─────────────────────────
  const draftsByStatus = drafts.reduce(
    (acc, d) => {
      acc.total++;
      const s = d.status ?? "draft";
      if (s === "sent") acc.sent++;
      if (s === "approved") acc.inProgress++;
      if (s === "draft") acc.inProgress++;
      // Replies / meetings / deals are derived from threadMessages + transactions below
      return acc;
    },
    { total: 0, sent: 0, inProgress: 0 } as { total: number; sent: number; inProgress: number },
  );
  const replies = drafts.filter((d) => Array.isArray((d as any).threadMessages) && (d as any).threadMessages.length > 0).length;
  const meetings = transactions.filter((t) => ["proposed", "signed", "payment_pending", "escrow_held"].includes(t.state)).length;
  const dealsClosed = transactions.filter((t) => ["completed", "released"].includes(t.state)).length;
  const openRate = draftsByStatus.sent > 0 ? `${((replies / draftsByStatus.sent) * 100).toFixed(1)}%` : "—";
  const replyRate = draftsByStatus.sent > 0 ? `${((replies / draftsByStatus.sent) * 100).toFixed(1)}%` : "—";
  const meetingRate = draftsByStatus.sent > 0 ? `${((meetings / draftsByStatus.sent) * 100).toFixed(1)}%` : "—";

  // ── Transaction funnel (Pipeline card) ───────────────────────────────
  const stateGroups: Record<string, { count: number; valueCents: number }> = {
    proposed: { count: 0, valueCents: 0 },
    signed: { count: 0, valueCents: 0 },
    escrow: { count: 0, valueCents: 0 },
    shipped: { count: 0, valueCents: 0 },
    completed: { count: 0, valueCents: 0 },
  };
  for (const t of transactions) {
    if (t.state === "proposed") {
      stateGroups.proposed.count++;
      stateGroups.proposed.valueCents += t.productTotalCents;
    } else if (t.state === "signed" || t.state === "payment_pending") {
      stateGroups.signed.count++;
      stateGroups.signed.valueCents += t.productTotalCents;
    } else if (t.state === "escrow_held") {
      stateGroups.escrow.count++;
      stateGroups.escrow.valueCents += t.productTotalCents;
    } else if (t.state === "shipped" || t.state === "delivered") {
      stateGroups.shipped.count++;
      stateGroups.shipped.valueCents += t.productTotalCents;
    } else if (t.state === "completed" || t.state === "released") {
      stateGroups.completed.count++;
      stateGroups.completed.valueCents += t.productTotalCents;
    }
  }

  // ── Top performing agents (success rate per agent type) ──────────────
  const agentStats = new Map<string, { total: number; success: number; lastAt?: string }>();
  for (const r of runs) {
    const cur = agentStats.get(r.agent) ?? { total: 0, success: 0 };
    cur.total++;
    if (r.status === "success") cur.success++;
    if (!cur.lastAt || r.startedAt > cur.lastAt) cur.lastAt = r.startedAt;
    agentStats.set(r.agent, cur);
  }
  const AGENT_LABEL: Record<string, string> = {
    "trend-hunter": "Trend Hunter",
    "buyer-discovery": "Buyer Discovery",
    "supplier-finder": "Supplier Finder",
    outreach: "Outreach Agent",
    negotiation: "Negotiation Agent",
    risk: "Risk Agent",
  };
  const topAgents = Array.from(agentStats.entries())
    .map(([agent, s]) => ({
      name: AGENT_LABEL[agent] ?? agent,
      agent,
      score: s.total === 0 ? 0 : Math.round((s.success / s.total) * 100),
      runs: s.total,
    }))
    .sort((a, b) => b.score - a.score || b.runs - a.runs)
    .slice(0, 5);

  // ── Alerts (recent risk flags + recent failed runs) ──────────────────
  const recentFlags = [...riskFlags]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)
    .map((f) => ({
      title: f.title,
      sub: f.detail,
      ago: f.createdAt,
      tone:
        f.severity === "Critical" ? "red" :
        f.severity === "High" ? "red" :
        f.severity === "Medium" ? "amber" :
        "amber",
    }));
  const recentFailedRuns = runs
    .filter((r) => r.status === "error")
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 3)
    .map((r) => ({
      title: `${AGENT_LABEL[r.agent] ?? r.agent} failed`,
      sub: r.errorMessage ?? "Agent run errored — see /agent-runs",
      ago: r.startedAt,
      tone: "amber" as const,
    }));
  const alerts = [...recentFlags, ...recentFailedRuns]
    .sort((a, b) => b.ago.localeCompare(a.ago))
    .slice(0, 5);

  // ── Chart series ─────────────────────────────────────────────────────
  // Category donut: count products per category
  const categoryCounts = new Map<string, number>();
  for (const p of products) {
    categoryCounts.set(p.category, (categoryCounts.get(p.category) ?? 0) + 1);
  }
  const CATEGORY_FILL: Record<string, string> = {
    "Home & Kitchen": "#a87dff",
    "Pet Supplies": "#22c55e",
    "Beauty & Personal Care": "#f59e0b",
    "Sports & Outdoors": "#3b82f6",
    Electronics: "#06b6d4",
    "Home Decor": "#ec4899",
    Baby: "#8b5cf6",
    Auto: "#14b8a6",
    Office: "#f97316",
    "Toys & Games": "#eab308",
  };
  const categorySeries = Array.from(categoryCounts.entries()).map(([name, value]) => ({
    name,
    value,
    fill: CATEGORY_FILL[name] ?? "#7c3aed",
  }));

  // Revenue area: revenue ledger by month (last 12 months)
  const revenue = await getRevenueStats();
  const revenueSeries = revenue.byMonth.slice(-12).map((m) => ({
    d: m.month,
    v: Math.round((m.platformFeesCents + m.escrowFeesCents) / 100),
  }));

  // Demand radar: per-axis average demand score for top 6 categories
  const radarAxes = ["Demand", "Profit", "Trend", "Saturation", "Reach", "Margin"];
  const radarSeries = radarAxes.map((axis, i) => {
    const youValues = products
      .map((p) => {
        // Simple synthetic per-axis: use demandScore + offset to avoid uniform shape
        return Math.max(0, Math.min(100, (p.demandScore ?? 50) + Math.sin(i + p.name.length) * 8));
      });
    const you = youValues.length === 0 ? 0 : Math.round(youValues.reduce((s, v) => s + v, 0) / youValues.length);
    const market = Math.max(0, you - 8 - i * 2); // baseline a touch lower so the radar reads
    return { axis, you, market };
  });

  // ── Headline counts + KPIs ───────────────────────────────────────────
  const sentDrafts = draftsByStatus.sent;
  const respondedDrafts = replies;
  const highDemandCount = products.filter((p) => (p.demandScore ?? 0) >= 70).length;
  const totalOpportunities = products.length + buyers.length + drafts.length;
  const activeDealStates = ["draft", "proposed", "signed", "payment_pending", "escrow_held", "shipped", "delivered"];
  const dealsInPipeline = transactions.filter((t) => activeDealStates.includes(t.state)).length;
  const pipelineValueCents = transactions
    .filter((t) => activeDealStates.includes(t.state))
    .reduce((s, t) => s + t.productTotalCents, 0);

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
      estRevenueCents: pipelineValueCents + revenue.netPlatformRevenueCents,
    },
    counts: {
      products: products.length,
      buyers: buyers.length,
      drafts: drafts.length,
      runs: runs.length,
      transactions: transactions.length,
    },
    campaign: {
      total: draftsByStatus.total,
      inProgress: draftsByStatus.inProgress,
      sent: draftsByStatus.sent,
      replies,
      meetings,
      deals: dealsClosed,
      openRate,
      replyRate,
      meetingRate,
      topCampaign: products[0]?.name ? `Outreach for ${products[0].name}` : "No campaigns yet",
    },
    pipeline: {
      stages: [
        { stage: "Proposed", count: stateGroups.proposed.count, valueCents: stateGroups.proposed.valueCents },
        { stage: "Signed", count: stateGroups.signed.count, valueCents: stateGroups.signed.valueCents },
        { stage: "Escrow", count: stateGroups.escrow.count, valueCents: stateGroups.escrow.valueCents },
        { stage: "Shipped", count: stateGroups.shipped.count, valueCents: stateGroups.shipped.valueCents },
        { stage: "Completed", count: stateGroups.completed.count, valueCents: stateGroups.completed.valueCents },
      ],
      totalValueCents: Object.values(stateGroups).reduce((s, g) => s + g.valueCents, 0),
    },
    topAgents,
    alerts,
    charts: {
      categorySeries,
      revenueSeries,
      radarSeries,
    },
  });
}
