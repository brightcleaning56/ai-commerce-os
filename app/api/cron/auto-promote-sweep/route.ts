import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth";
import { checkKillSwitch } from "@/lib/killSwitch";
import { autoPromoteIfHot } from "@/lib/leadAutoPromote";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron-triggered sweep that catches any hot leads that escaped the
 * synchronous auto-promote path on /api/leads. Runs hourly.
 *
 * Cases this catches:
 *   - The sync path errored out (Netlify lambda hiccup, store write race,
 *     etc.) and the lead landed un-promoted. Operator gets the buyer
 *     within an hour.
 *   - AUTO_PROMOTE_LEAD_SCORE was raised post-deploy and now-eligible
 *     leads from before the change get caught up.
 *   - Backfill — someone bulk-imports leads outside the API path and
 *     the sweep promotes the hot ones.
 *
 * Bounded scan: only looks at leads created in the last 30 days to keep
 * the worst-case duration predictable. Anything older is operator-only.
 *
 * Auth: same Bearer-CRON_SECRET pattern as the other crons.
 *
 * Scheduled by netlify/functions/cron-auto-promote-sweep.mjs (hourly at :15).
 */
export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  if (process.env.CRON_ENABLED === "false") {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "CRON_ENABLED=false",
    });
  }

  const ks = await checkKillSwitch();
  if (ks.killed) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "kill-switch-active",
      killSwitch: ks.state,
    });
  }

  const startedAt = new Date().toISOString();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - THIRTY_DAYS_MS;

  const leads = await store.getLeads();
  const candidates = leads.filter((l) => {
    if (l.promotedToBuyerId) return false;
    // Only re-touch active-looking leads — don't yank a "lost" lead back into
    // outreach against the operator's wishes.
    if (l.status === "lost" || l.status === "won") return false;
    return new Date(l.createdAt).getTime() >= cutoff;
  });

  type Outcome = "promoted" | "below-threshold" | "already-promoted" | "disabled" | "error";
  const results: Array<{
    leadId: string;
    company: string;
    score: number;
    threshold: number;
    outcome: Outcome;
    buyerId?: string;
    errorMessage?: string;
  }> = [];

  for (const lead of candidates) {
    try {
      const r = await autoPromoteIfHot(lead);
      if (r.promoted) {
        results.push({
          leadId: lead.id,
          company: lead.company,
          score: r.score,
          threshold: r.threshold,
          outcome: "promoted",
          buyerId: r.buyerId,
        });
      } else {
        results.push({
          leadId: lead.id,
          company: lead.company,
          score: r.score,
          threshold: r.threshold,
          outcome: r.reason,
        });
      }
    } catch (err) {
      results.push({
        leadId: lead.id,
        company: lead.company,
        score: 0,
        threshold: 0,
        outcome: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const promoted = results.filter((r) => r.outcome === "promoted").length;
  const errored = results.filter((r) => r.outcome === "error").length;

  return NextResponse.json({
    ok: true,
    startedAt,
    scanned: candidates.length,
    promoted,
    skipped: results.length - promoted - errored,
    errored,
    // Only return per-lead details when something actually happened so the
    // response stays small on quiet ticks.
    results: promoted > 0 || errored > 0 ? results.filter((r) => r.outcome === "promoted" || r.outcome === "error") : [],
  });
}
