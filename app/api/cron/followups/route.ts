import { NextRequest, NextResponse } from "next/server";
import { findFollowupCandidates, runFollowup } from "@/lib/agents/followup";
import { requireCron } from "@/lib/auth";
import { checkKillSwitch } from "@/lib/killSwitch";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron-triggered auto-followup pass. Finds drafts that have been sent for
 * N+ days without engagement and generates re-pitch drafts in the approval queue.
 *
 * Auth: same Bearer-CRON_SECRET model as /api/cron/pipeline.
 * Local dev (no CRON_SECRET set) accepts unauthenticated calls.
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
  const ranAt = new Date().toISOString();
  const runId = `cron_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  const ks = await checkKillSwitch();
  if (ks.killed) {
    await store.saveCronRun({
      id: runId,
      kind: "followups",
      ranAt,
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

  const candidates = await findFollowupCandidates();
  const results: Array<{
    parentId: string;
    buyerCompany: string;
    daysSinceSent: number;
    views: number;
    ok: boolean;
    newDraftId?: string;
    error?: string;
  }> = [];

  for (const c of candidates) {
    try {
      const r = await runFollowup(c.draft.id);
      results.push({
        parentId: c.draft.id,
        buyerCompany: c.draft.buyerCompany,
        daysSinceSent: c.daysSinceSent,
        views: c.views,
        ok: true,
        newDraftId: r.newDraft.id,
      });
    } catch (e) {
      results.push({
        parentId: c.draft.id,
        buyerCompany: c.draft.buyerCompany,
        daysSinceSent: c.daysSinceSent,
        views: c.views,
        ok: false,
        error: e instanceof Error ? e.message : "Followup failed",
      });
    }
  }

  const generated = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  const tickStatus: "success" | "error" | "skipped" =
    generated > 0
      ? "success"
      : failed > 0
        ? "error"
        : "skipped";
  await store.saveCronRun({
    id: runId,
    kind: "followups",
    ranAt,
    durationMs: Date.now() - tickStart,
    status: tickStatus,
    summary:
      candidates.length === 0
        ? "no draft followup candidates"
        : `${candidates.length} candidates · ${generated} generated · ${failed} failed`,
  });

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    generated,
    failed,
    results,
  });
}
