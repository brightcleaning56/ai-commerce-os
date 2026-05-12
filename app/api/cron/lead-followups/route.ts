import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth";
import { findLeadFollowupCandidates, runLeadFollowup } from "@/lib/leadFollowup";
import { checkKillSwitch } from "@/lib/killSwitch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron-triggered auto-followup pass for INBOUND LEADS (sibling of the
 * existing /api/cron/followups which handles buyer-side outreach drafts).
 *
 * Finds leads where the AI auto-reply was sent N+ days ago and the buyer
 * hasn't replied (proxied by status === "new"). Generates a shorter
 * second-touch nudge via Anthropic and sends via Postmark.
 *
 * Sends are skipped (not errored) when Postmark rejects (e.g. account in
 * test mode + recipient outside From-domain) — the lead still gets an
 * aiFollowups entry showing the attempt.
 *
 * Auth model: same Bearer-CRON_SECRET pattern as /api/cron/pipeline.
 *
 * Scheduled by netlify/functions/cron-lead-followups.mjs (daily at 10:00 UTC).
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

  // Respect server-authoritative kill switch — operator hit "Activate
  // kill-switch" on /admin. Cron returns ok:true so the platform doesn't
  // mark this as a failed schedule; we just no-op until they deactivate.
  const ks = await checkKillSwitch();
  if (ks.killed) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "kill-switch-active",
      killSwitch: ks.state,
    });
  }

  const candidates = await findLeadFollowupCandidates();
  const startedAt = new Date().toISOString();

  const results: Array<{
    leadId: string;
    company: string;
    daysSinceLastTouch: number;
    status: "sent" | "skipped" | "error";
    errorMessage?: string;
  }> = [];

  for (const c of candidates) {
    const r = await runLeadFollowup(c.lead);
    results.push({
      leadId: c.lead.id,
      company: c.lead.company,
      daysSinceLastTouch: c.daysSinceLastTouch,
      status: r.status,
      errorMessage: r.errorMessage,
    });
  }

  return NextResponse.json({
    ok: true,
    startedAt,
    candidateCount: candidates.length,
    sent: results.filter((r) => r.status === "sent").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    errored: results.filter((r) => r.status === "error").length,
    results,
  });
}
