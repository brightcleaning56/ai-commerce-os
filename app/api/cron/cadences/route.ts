import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth";
import { runCadenceTick } from "@/lib/cadences";
import { checkKillSwitch } from "@/lib/killSwitch";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cronRunId(): string {
  return `cron_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Cron-triggered cadence tick.
 *
 * Walks active enrollments where nextStepDueAt is in the past and
 * schedules the corresponding queue item. Branching is resolved against
 * the previous step's recorded outcome.
 *
 * Important: this only SCHEDULES queue items — it does not auto-send
 * email/SMS or auto-call. The operator sees the scheduled item on
 * /queue and clicks send. That's intentional for the first prod test
 * of the cadence engine; auto-send opt-in lands in slice 4.
 *
 * Auth: same Bearer-CRON_SECRET pattern as /api/cron/lead-followups.
 *
 * Scheduled by netlify/functions/cron-cadences.mjs (every 15 min).
 */
export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  if (process.env.CRON_ENABLED === "false") {
    return NextResponse.json({ ok: true, skipped: true, reason: "CRON_ENABLED=false" });
  }

  const tickStart = Date.now();
  const startedAt = new Date().toISOString();

  // Respect kill switch — operator hit "Activate kill-switch" on /admin.
  // Cadence cron returns ok:true and records a skip so the operator
  // sees this in System Health's activity panel.
  const ks = await checkKillSwitch();
  if (ks.killed) {
    await store.saveCronRun({
      id: cronRunId(),
      kind: "cadences",
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

  try {
    const result = await runCadenceTick();
    const overallStatus: "success" | "error" | "skipped" =
      result.scannedEnrollments === 0
        ? "skipped"
        : result.errors.length > 0 && result.scheduledItems === 0
          ? "error"
          : "success";
    await store.saveCronRun({
      id: cronRunId(),
      kind: "cadences",
      ranAt: startedAt,
      durationMs: Date.now() - tickStart,
      status: overallStatus,
      summary:
        result.scannedEnrollments === 0
          ? "no enrollments due"
          : `${result.scannedEnrollments} due · ${result.scheduledItems} scheduled · ${result.completedEnrollments} completed · ${result.errors.length} errors`,
    });
    return NextResponse.json({ ok: true, startedAt, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await store.saveCronRun({
      id: cronRunId(),
      kind: "cadences",
      ranAt: startedAt,
      durationMs: Date.now() - tickStart,
      status: "error",
      summary: msg.slice(0, 200),
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
