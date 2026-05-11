import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Aggregated outreach stats derived from REAL data only:
 *
 *   - sent          = drafts where status === "sent"
 *   - opened        = sum of accessLog views attributed to each sent draft's
 *                     shareLinkToken across the parent pipeline runs
 *   - replied       = drafts where the conversation thread has at least one
 *                     buyer message
 *   - meetingsBooked = drafts whose thread mentions a meeting/calendar URL
 *                      (heuristic — promote to an explicit field later)
 *   - closedDeals   = transactions in released or completed states
 *   - inFlightDrafts = sent drafts that have not yet drawn a buyer reply
 *                      (replaces the fake "active campaigns" stat)
 *   - hasAnyData    = false when nothing has been sent yet, so the page can
 *                     render an honest empty state instead of zeros
 *
 * No hardcoded marketing numbers. If a number is zero, it's because the
 * underlying activity hasn't happened yet.
 */
export async function GET() {
  const [drafts, transactions, runs] = await Promise.all([
    store.getDrafts(),
    store.getTransactions(),
    store.getPipelineRuns(),
  ]);

  // Build a quick map: shareLinkToken -> view count
  const viewsByToken = new Map<string, number>();
  for (const r of runs) {
    for (const entry of r.accessLog ?? []) {
      if (!entry.linkToken) continue;
      viewsByToken.set(entry.linkToken, (viewsByToken.get(entry.linkToken) ?? 0) + 1);
    }
  }

  let sent = 0;
  let opened = 0;
  let replied = 0;
  let meetingsBooked = 0;
  let inFlightDrafts = 0;

  // Match calendar / meeting links in any thread message.
  const meetingPattern = /(calendly\.com|cal\.com|meet\.google\.com|zoom\.us\/j\/|teams\.microsoft\.com|hubspot\.com\/meetings|chilipiper\.com)/i;

  for (const d of drafts) {
    if (d.status !== "sent") continue;
    sent += 1;

    if (d.shareLinkToken) {
      opened += viewsByToken.get(d.shareLinkToken) ?? 0;
    }

    const buyerReplies = (d.thread ?? []).filter((m) => m.role === "buyer");
    const hasBuyerReply = buyerReplies.length > 0;
    if (hasBuyerReply) replied += 1;
    else inFlightDrafts += 1;

    if (buyerReplies.some((m) => meetingPattern.test(m.body))) {
      meetingsBooked += 1;
    }
  }

  const closedDeals = transactions.filter(
    (t) => t.state === "released" || t.state === "completed",
  ).length;

  const hasAnyData = sent > 0 || closedDeals > 0;

  return NextResponse.json({
    hasAnyData,
    sent,
    opened,
    replied,
    meetingsBooked,
    closedDeals,
    inFlightDrafts,
    // Helpful denominators for UI percentages so the client doesn't have to
    // re-compute (and so we can change formula in one place later).
    openRatePct: sent > 0 ? Math.round((opened / sent) * 1000) / 10 : 0,
    replyRatePct: sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0,
    totals: { drafts: drafts.length, transactions: transactions.length },
  });
}
