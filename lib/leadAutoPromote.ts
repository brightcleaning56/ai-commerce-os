import { leadToDiscoveredBuyer } from "@/lib/leadPromotion";
import { scoreLead } from "@/lib/leadScore";
import { store, type Lead } from "@/lib/store";

/**
 * Auto-promote a lead to a DiscoveredBuyer when its score crosses the
 * threshold. Wired into POST /api/leads so the moment a hot lead arrives
 * (after the AI auto-reply fires), they appear in the discovered-buyers
 * pipeline ready for the Outreach Agent's next run — no operator click
 * required.
 *
 * Also called from /api/cron/lead-followups so leads that escalate via
 * resubmission (e.g. additional fields added later push them over the
 * threshold) get promoted on the next sweep.
 *
 * Threshold defaults to 70 (the "hot" tier from leadScore). Override
 * with AUTO_PROMOTE_LEAD_SCORE env var. Set to 999 to disable.
 *
 * Idempotent: if the lead is already promoted, this is a no-op.
 */

function getThreshold(): number {
  const raw = process.env.AUTO_PROMOTE_LEAD_SCORE;
  if (!raw) return 70;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 70;
  return n;
}

export type AutoPromoteResult =
  | { promoted: false; reason: "already-promoted" | "below-threshold" | "disabled"; score: number; threshold: number }
  | { promoted: true; lead: Lead; buyerId: string; score: number; threshold: number };

export async function autoPromoteIfHot(lead: Lead): Promise<AutoPromoteResult> {
  const threshold = getThreshold();
  const { total: score } = scoreLead(lead);

  if (threshold >= 999) {
    return { promoted: false, reason: "disabled", score, threshold };
  }
  if (lead.promotedToBuyerId) {
    return { promoted: false, reason: "already-promoted", score, threshold };
  }
  if (score < threshold) {
    return { promoted: false, reason: "below-threshold", score, threshold };
  }

  const buyer = leadToDiscoveredBuyer(lead, { agent: "lead-auto-promote" });
  await store.saveDiscoveredBuyers([buyer]);

  // Bump status to "qualified" so it shows up in the right inbox bucket
  // and stops getting re-touched by the auto-followup cron.
  const nextStatus =
    lead.status === "new" || lead.status === "contacted" ? "qualified" : lead.status;

  const updated = await store.updateLead(lead.id, {
    promotedToBuyerId: buyer.id,
    promotedAt: new Date().toISOString(),
    promotedBy: "auto",
    status: nextStatus,
  });

  return {
    promoted: true,
    lead: updated ?? lead,
    buyerId: buyer.id,
    score,
    threshold,
  };
}
