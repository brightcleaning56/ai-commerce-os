import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth";
import { checkKillSwitch } from "@/lib/killSwitch";
import { store } from "@/lib/store";
import { supplierRegistry } from "@/lib/supplierRegistry";
import { runL3Verification } from "@/lib/supplierVerification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron — re-run L3 (Operational Verification) for active suppliers
 * whose linked-transaction state has changed since their last L3 run.
 *
 * What "needs re-running" means:
 *   - The supplier has at least one linked transaction
 *   - AND either:
 *       no L3 run on file yet, OR
 *       latest L3 ran BEFORE the supplier's most recent linked
 *       transaction (the new transaction may flip MOQ-consistency,
 *       capacity-real, lead-time-real, or recency)
 *
 * Why nightly: L3 only changes when the linked-transaction set
 * changes. A daily tick keeps trust scores fresh without burning
 * compute on suppliers whose state hasn't moved.
 *
 * Per-tick safety:
 *   - SUPPLIER_L3_REFRESH_BATCH (default 50) caps the number of
 *     re-runs per tick so we don't blow the function timeout
 *   - kill switch respected via checkKillSwitch
 *   - CRON_ENABLED=false short-circuits for emergencies
 *
 * Auth: same Bearer-CRON_SECRET model as the other cron routes.
 */

const DEFAULT_BATCH = 50;
const STALE_GRACE_MINUTES = 5; // ignore transactions written in the last 5 min to avoid race with create→link

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

  const kill = await checkKillSwitch();
  if (kill.killed) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Kill switch active: ${kill.state.reason ?? "(no reason given)"}`,
    });
  }

  const tickStart = Date.now();
  const batchSize = Math.max(
    1,
    Number(process.env.SUPPLIER_L3_REFRESH_BATCH ?? DEFAULT_BATCH) || DEFAULT_BATCH,
  );

  // Pull everything once. The registry is bounded (~5000) so this is cheap.
  // Suppliers that aren't active or pending get skipped — no point re-grading
  // rejected/suspended records.
  const suppliers = await supplierRegistry.list({});
  const eligible = suppliers.filter((s) => s.status === "active" || s.status === "pending");

  // Build a lightweight (supplierId → most recent linked txn timestamp) map.
  // One full transactions read; in-memory filter is fastest.
  const allTxns = await store.getTransactions();
  const lastTxnAtBySupplier = new Map<string, string>();
  const graceCutoff = new Date(Date.now() - STALE_GRACE_MINUTES * 60 * 1000).toISOString();
  for (const t of allTxns) {
    if (!t.supplierRegistryId) continue;
    if (t.createdAt > graceCutoff) continue; // ignore very-recent races
    const cur = lastTxnAtBySupplier.get(t.supplierRegistryId);
    if (!cur || t.createdAt > cur) {
      lastTxnAtBySupplier.set(t.supplierRegistryId, t.createdAt);
    }
  }

  // Decide who to re-run.
  type Candidate = {
    supplierId: string;
    legalName: string;
    lastTxnAt: string;
    lastL3At: string | null;
    reason: "never-run" | "stale";
  };
  const candidates: Candidate[] = [];
  for (const s of eligible) {
    const lastTxnAt = lastTxnAtBySupplier.get(s.id);
    if (!lastTxnAt) continue; // no linked transactions → L3 has nothing to grade
    const latestL3 = [...s.verificationRuns]
      .filter((r) => r.level === "L3")
      .sort((a, b) => b.ranAt.localeCompare(a.ranAt))[0];
    if (!latestL3) {
      candidates.push({
        supplierId: s.id,
        legalName: s.legalName,
        lastTxnAt,
        lastL3At: null,
        reason: "never-run",
      });
      continue;
    }
    if (latestL3.ranAt < lastTxnAt) {
      candidates.push({
        supplierId: s.id,
        legalName: s.legalName,
        lastTxnAt,
        lastL3At: latestL3.ranAt,
        reason: "stale",
      });
    }
  }

  // Cap per-tick to keep the function under timeout.
  const toRun = candidates.slice(0, batchSize);

  const results: Array<{
    supplierId: string;
    legalName: string;
    score: number;
    passed: boolean;
    tier: string;
    reason: Candidate["reason"];
    error?: string;
  }> = [];

  for (const c of toRun) {
    try {
      // Re-fetch the supplier in case something else updated it during the
      // tick. Cheap given the bounded registry.
      const fresh = await supplierRegistry.get(c.supplierId);
      if (!fresh) {
        results.push({
          supplierId: c.supplierId,
          legalName: c.legalName,
          score: 0,
          passed: false,
          tier: "unknown",
          reason: c.reason,
          error: "supplier disappeared mid-tick",
        });
        continue;
      }
      const run = await runL3Verification(fresh);
      const updated = await supplierRegistry.appendVerificationRun(fresh.id, run);
      results.push({
        supplierId: fresh.id,
        legalName: fresh.legalName,
        score: run.score,
        passed: run.passed,
        tier: updated?.tier ?? fresh.tier,
        reason: c.reason,
      });
    } catch (e) {
      results.push({
        supplierId: c.supplierId,
        legalName: c.legalName,
        score: 0,
        passed: false,
        tier: "error",
        reason: c.reason,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Persist a CronRun record so /admin/system-health can show this as
  // an actual job that fires (consistent with other crons).
  const erroredCount = results.filter((r) => !!r.error).length;
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed && !r.error).length;
  try {
    await store.saveCronRun({
      id: `cr_${Date.now().toString(36)}`,
      kind: "supplier-l3-refresh",
      ranAt: new Date(tickStart).toISOString(),
      durationMs: Date.now() - tickStart,
      status: erroredCount > 0 ? "error" : (toRun.length === 0 ? "skipped" : "success"),
      summary: `L3 re-ran for ${toRun.length}/${candidates.length} eligible — ${passedCount} passed, ${failedCount} failed${erroredCount > 0 ? `, ${erroredCount} errored` : ""}`,
    });
  } catch (e) {
    console.warn("[cron/supplier-l3-refresh] cron-run record failed:", e);
  }

  return NextResponse.json({
    ok: true,
    elapsedMs: Date.now() - tickStart,
    eligibleSuppliers: eligible.length,
    candidates: candidates.length,
    ran: toRun.length,
    deferred: Math.max(0, candidates.length - toRun.length),
    results,
  });
}
