import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth";
import { runBusinessOutreach } from "@/lib/agents/businessOutreach";
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
  const job = await store.getNextOutreachJob();
  if (!job) {
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
