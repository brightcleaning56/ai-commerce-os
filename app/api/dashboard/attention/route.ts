import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/attention — what does the operator need to do RIGHT NOW?
 *
 * Aggregates actionable items across the platform into one prioritized list.
 * Each item is a clear "go fix this" tile with a deep-link to the page that
 * handles it. The Command Center renders this above the KPI grid so the
 * operator's first glance is always "here's what to act on."
 *
 * Items returned (only when count > 0):
 *
 *   draft_approval       N drafts in the queue awaiting human review
 *   shipment_due         N transactions in escrow_held — supplier needs to ship
 *   delivered_release    N delivered transactions (operator can release manually)
 *   dispute_closing      N delivered transactions <24h from auto-release
 *   dispute_open         N transactions in disputed state — operator must resolve
 *   risk_flag            N high/critical risk flags awaiting action
 *   supplier_disconnect  N transactions in escrow_held without Stripe Connect
 *                        account (escrow release will simulate locally rather
 *                        than pay supplier)
 */
export async function GET() {
  const [drafts, transactions, riskFlags] = await Promise.all([
    store.getDrafts(),
    store.getTransactions(),
    store.getRiskFlags(),
  ]);

  const now = Date.now();
  const autoReleaseHours = Math.max(1, Number(process.env.AUTO_RELEASE_HOURS ?? "168") || 168);
  const autoReleaseMs = autoReleaseHours * 60 * 60 * 1000;
  const closingThresholdMs = 24 * 60 * 60 * 1000; // <24h to deadline

  type Item = {
    type:
      | "draft_approval"
      | "shipment_due"
      | "delivered_release"
      | "dispute_closing"
      | "dispute_open"
      | "risk_flag"
      | "supplier_disconnect";
    count: number;
    urgency: "high" | "medium" | "low";
    label: string;
    detail: string;
    href: string;
    cta: string;
  };
  const items: Item[] = [];

  // ── Pending drafts awaiting approval ──────────────────────────────────
  const pendingDrafts = drafts.filter((d) => d.status === "draft").length;
  if (pendingDrafts > 0) {
    items.push({
      type: "draft_approval",
      count: pendingDrafts,
      urgency: pendingDrafts >= 5 ? "high" : "medium",
      label: `${pendingDrafts} draft${pendingDrafts === 1 ? "" : "s"} awaiting approval`,
      detail: pendingDrafts >= 5
        ? "Use j/k/a/s shortcuts on /approvals to clear the queue fast"
        : "Review and approve outreach before it can be sent",
      href: "/approvals",
      cta: "Review queue",
    });
  }

  // ── Transactions in escrow_held — supplier prep / ship ────────────────
  const escrowHeld = transactions.filter((t) => t.state === "escrow_held");
  if (escrowHeld.length > 0) {
    items.push({
      type: "shipment_due",
      count: escrowHeld.length,
      urgency: "medium",
      label: `${escrowHeld.length} transaction${escrowHeld.length === 1 ? "" : "s"} ready to ship`,
      detail: "Buyer paid, escrow holds funds. Mark shipped once carrier picks up.",
      href: "/transactions",
      cta: "Open transactions",
    });
  }

  // ── Delivered, awaiting release (or auto-release) ────────────────────
  const delivered = transactions.filter((t) => t.state === "delivered");
  if (delivered.length > 0) {
    // Sub-bucket: deadline closing in <24h
    const closing = delivered.filter((t) => {
      if (!t.deliveredAt) return false;
      const deliveredMs = new Date(t.deliveredAt).getTime();
      const remaining = autoReleaseMs - (now - deliveredMs);
      return remaining > 0 && remaining < closingThresholdMs;
    });
    if (closing.length > 0) {
      items.push({
        type: "dispute_closing",
        count: closing.length,
        urgency: "high",
        label: `${closing.length} delivered ${closing.length === 1 ? "transaction's" : "transactions'"} dispute window closing in <24h`,
        detail: "After this, funds auto-release. Confirm delivery or release manually now.",
        href: "/transactions",
        cta: "Review delivered",
      });
    }
    const restDelivered = delivered.length - closing.length;
    if (restDelivered > 0) {
      items.push({
        type: "delivered_release",
        count: restDelivered,
        urgency: "low",
        label: `${restDelivered} delivered transaction${restDelivered === 1 ? "" : "s"} ready to release`,
        detail: "Click Release Now in /transactions or wait for auto-release.",
        href: "/transactions",
        cta: "Open transactions",
      });
    }
  }

  // ── Disputed — operator must resolve ──────────────────────────────────
  const disputed = transactions.filter((t) => t.state === "disputed").length;
  if (disputed > 0) {
    items.push({
      type: "dispute_open",
      count: disputed,
      urgency: "high",
      label: `${disputed} dispute${disputed === 1 ? "" : "s"} need resolution`,
      detail: "Funds frozen until you choose: refund buyer / release supplier / split.",
      href: "/transactions",
      cta: "Resolve disputes",
    });
  }

  // ── Risk flags (Critical/High only) ───────────────────────────────────
  const criticalRisk = riskFlags.filter(
    (f) => f.severity === "Critical" || f.severity === "High",
  ).length;
  if (criticalRisk > 0) {
    items.push({
      type: "risk_flag",
      count: criticalRisk,
      urgency: "high",
      label: `${criticalRisk} critical/high risk flag${criticalRisk === 1 ? "" : "s"}`,
      detail: "Risk Agent surfaced fraud or compliance concerns",
      href: "/risk",
      cta: "Open Risk Center",
    });
  }

  // ── Suppliers not onboarded to Stripe Connect ─────────────────────────
  // Only flag for transactions where the supplier hasn't connected AND the
  // transaction is past payment_pending (so a real payout will be needed)
  const needsConnect = transactions.filter(
    (t) =>
      ["escrow_held", "shipped", "delivered"].includes(t.state) &&
      !t.supplierStripeAccountId,
  ).length;
  if (needsConnect > 0) {
    items.push({
      type: "supplier_disconnect",
      count: needsConnect,
      urgency: "medium",
      label: `${needsConnect} supplier${needsConnect === 1 ? "" : "s"} not connected to Stripe`,
      detail: "Without onboarding, escrow release will simulate locally instead of paying out",
      href: "/transactions",
      cta: "Onboard suppliers",
    });
  }

  // Sort: high urgency first, then medium, then low — within the same
  // urgency keep insertion order (which roughly matches the natural funnel
  // priority).
  const urgencyRank = { high: 0, medium: 1, low: 2 } as const;
  items.sort((a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency]);

  return NextResponse.json({
    items,
    counts: {
      total: items.length,
      high: items.filter((i) => i.urgency === "high").length,
      medium: items.filter((i) => i.urgency === "medium").length,
      low: items.filter((i) => i.urgency === "low").length,
    },
    autoReleaseHours,
  });
}
