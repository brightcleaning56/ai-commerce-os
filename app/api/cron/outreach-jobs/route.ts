import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth";
import { runBusinessOutreach } from "@/lib/agents/businessOutreach";
import { checkKillSwitch } from "@/lib/killSwitch";
import { isBusinessSuppressed, store, type OutreachJobOutcome } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron-triggered outreach-job processor. Picks the next pending or
 * running job, processes up to batchSize businesses, appends to
 * outcomes[], and updates status if the job is complete.
 *
 * Why this is its own job processor (vs. fanning out to the existing
 * /draft-outreach endpoint):
 *   - Same suppression + dedupe semantics as the sync endpoint
 *   - But state lives on the job record, not in a request payload —
 *     survives lambda death, can be inspected/cancelled mid-flight
 *   - One Anthropic call per business; serial within a tick to stay
 *     under the 60s function timeout
 *
 * Scheduled by netlify/functions/cron-outreach-jobs.mjs (every 5 min).
 * Operator can also POST this endpoint directly via the cron secret
 * to force-tick.
 */
export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  if (process.env.CRON_ENABLED === "false") {
    return NextResponse.json({ ok: true, skipped: true, reason: "CRON_ENABLED=false" });
  }

  const tickStart = Date.now();
  const ranAt = new Date().toISOString();

  function runId(): string {
    return `cron_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  // Global kill switch: skip the tick rather than fail the schedule.
  // Outreach jobs ship LLM-generated email -- exactly the kind of thing
  // operators expect a kill switch to halt during an incident.
  const ks = await checkKillSwitch();
  if (ks.killed) {
    await store.saveCronRun({
      id: runId(),
      kind: "outreach-jobs",
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

  const job = await store.getNextOutreachJob();
  if (!job) {
    await store.saveCronRun({
      id: runId(),
      kind: "outreach-jobs",
      ranAt,
      durationMs: Date.now() - tickStart,
      status: "skipped",
      summary: "no pending jobs",
    });
    return NextResponse.json({ ok: true, idle: true });
  }

  // Resume from outcomes.length forward. Bound by batchSize per tick
  // so we don't blow the function timeout on jobs with 100s of items.
  const startIdx = job.outcomes.length;
  const endIdx = Math.min(startIdx + job.batchSize, job.businessIds.length);
  const slice = job.businessIds.slice(startIdx, endIdx);

  // Mark running on first tick
  const isFirstTick = job.status === "pending";
  if (isFirstTick) {
    await store.updateOutreachJob(job.id, {
      status: "running",
      startedAt: new Date().toISOString(),
    });
  }

  const newOutcomes: OutreachJobOutcome[] = [];
  let drafted = 0;
  let skipped = 0;
  let errored = 0;

  for (const businessId of slice) {
    const at = new Date().toISOString();
    const biz = await store.getBusiness(businessId);
    if (!biz) {
      newOutcomes.push({ businessId, status: "skipped", reason: "not found", at });
      skipped++;
      continue;
    }
    if (isBusinessSuppressed(biz)) {
      newOutcomes.push({
        businessId,
        status: "skipped",
        reason: biz.status === "do_not_contact" ? "do_not_contact" : "suppressed",
        at,
      });
      skipped++;
      continue;
    }
    if (!biz.email && !biz.phone) {
      newOutcomes.push({ businessId, status: "skipped", reason: "no email or phone", at });
      skipped++;
      continue;
    }
    try {
      const { draft } = await runBusinessOutreach(biz, { pitchOverride: job.pitchOverride });
      newOutcomes.push({
        businessId,
        status: "drafted",
        draftId: draft.id,
        at,
      });
      drafted++;
      // Bump business status + outreachCount on the record so the
      // operator's /admin/businesses view reflects it.
      try {
        await store.updateBusiness(biz.id, {
          status: biz.status === "won" ? biz.status : "queued",
          outreachCount: (biz.outreachCount ?? 0) + 1,
          lastDraftId: draft.id,
        });
      } catch {
        // Non-critical — outcome is the canonical record
      }
    } catch (e) {
      newOutcomes.push({
        businessId,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
        at,
      });
      errored++;
    }
  }

  // Refresh the job in case it was cancelled mid-tick (operator clicked
  // Cancel while we were processing). If so, we keep what we've done
  // but don't write more outcomes on top of cancelled state.
  const fresh = await store.getOutreachJob(job.id);
  if (!fresh) {
    return NextResponse.json({ ok: true, jobId: job.id, lost: true });
  }
  if (fresh.status === "cancelled") {
    return NextResponse.json({
      ok: true,
      jobId: job.id,
      cancelled: true,
      processedThisTick: slice.length,
    });
  }

  const combinedOutcomes = [...fresh.outcomes, ...newOutcomes];
  const stats = {
    drafted: fresh.stats.drafted + drafted,
    skipped: fresh.stats.skipped + skipped,
    errored: fresh.stats.errored + errored,
  };
  const done = combinedOutcomes.length >= fresh.businessIds.length;
  const now = new Date().toISOString();

  await store.updateOutreachJob(job.id, {
    outcomes: combinedOutcomes,
    stats,
    lastTickAt: now,
    ...(done ? { status: "completed" as const, completedAt: now } : {}),
  });

  // ─── Job completion notification ─────────────────────────────────────
  // When this tick finishes the job, email the operator a summary so they
  // know to come review /outreach. Fire-and-forget — never blocks the
  // cron tick on email delivery (Postmark hiccups etc).
  if (done) {
    import("@/lib/jobCompletionEmail")
      .then((m) => m.sendJobCompletionEmail({ ...fresh, stats, outcomes: combinedOutcomes }))
      .catch((e) => {
        console.warn(
          `[cron-outreach-jobs] completion email failed for ${job.id}:`,
          e instanceof Error ? e.message : e,
        );
      });
  }

  // Record the tick so it shows up in /admin/system-health's activity panel.
  // Status: "success" if anything got drafted; "error" if it was all errors;
  // "skipped" if the tick consisted entirely of suppression/missing-contact
  // skips (still useful to see -- tells the operator the queue is moving).
  const tickStatus: "success" | "error" | "skipped" =
    drafted > 0
      ? "success"
      : errored > 0 && skipped === 0
        ? "error"
        : "skipped";
  await store.saveCronRun({
    id: runId(),
    kind: "outreach-jobs",
    ranAt,
    durationMs: Date.now() - tickStart,
    status: tickStatus,
    summary:
      `job ${job.id.slice(-6)} · ${drafted} drafted · ${skipped} skipped · ${errored} errored` +
      (done ? " · DONE" : ` · ${combinedOutcomes.length}/${fresh.businessIds.length}`),
  });

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    processedThisTick: slice.length,
    totalProcessed: combinedOutcomes.length,
    totalRequested: fresh.businessIds.length,
    drafted,
    skipped,
    errored,
    done,
    elapsedMs: Date.now() - tickStart,
  });
}
