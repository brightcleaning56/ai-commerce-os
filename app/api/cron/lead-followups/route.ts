import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth";
import { findLeadFollowupCandidates, runLeadFollowup } from "@/lib/leadFollowup";
import { checkKillSwitch } from "@/lib/killSwitch";
import { store } from "@/lib/store";

function cronRunId(): string {
  return `cron_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

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

  const tickStart = Date.now();
  const startedAt = new Date().toISOString();

  // Respect server-authoritative kill switch — operator hit "Activate
  // kill-switch" on /admin. Cron returns ok:true so the platform doesn't
  // mark this as a failed schedule; we just no-op until they deactivate.
  // Record the skip so the operator can see it in the activity panel.
  const ks = await checkKillSwitch();
  if (ks.killed) {
    await store.saveCronRun({
      id: cronRunId(),
      kind: "lead-followups",
      ranAt: startedAt,
      durationMs: Date.now() - tickStart,
      status: "skipped",
      summary: "kill-switch active",
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "kill-switch-active",
      killSwitch: ks.state,
    });
  }

  const candidates = await findLeadFollowupCandidates();

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

  const sent = results.filter((r) => r.status === "sent").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;
  const errored = results.filter((r) => r.status === "error").length;

  // Record the cron run so the operator sees this in System Health's
  // activity panel. "skipped" status when there were candidates but the
  // configured provider rejected (Postmark approval pending, etc).
  const overallStatus: "success" | "error" | "skipped" =
    candidates.length === 0
      ? "skipped"
      : errored > 0 && sent === 0
        ? "error"
        : "success";
  await store.saveCronRun({
    id: cronRunId(),
    kind: "lead-followups",
    ranAt: startedAt,
    durationMs: Date.now() - tickStart,
    status: overallStatus,
    summary:
      candidates.length === 0
        ? "no candidates ready"
        : `${candidates.length} candidates · ${sent} sent · ${skippedCount} skipped · ${errored} errored`,
  });

  return NextResponse.json({
    ok: true,
    startedAt,
    candidateCount: candidates.length,
    sent,
    skipped: skippedCount,
    errored,
    results,
  });
}
