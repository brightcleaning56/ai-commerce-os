import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/lib/agents/pipeline";
import { requireCron } from "@/lib/auth";
import { checkKillSwitch } from "@/lib/killSwitch";
import { store, type CronRun } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron entry point.
 * Schedule is defined in vercel.json under `crons`.
 * Vercel sends a GET with `Authorization: Bearer ${CRON_SECRET}` if the env var is set.
 *
 * To disable cron without redeploying, set `CRON_ENABLED=false` in Vercel env vars.
 */
export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  // Kill switch — set CRON_ENABLED=false in Vercel env to pause without redeploy
  if (process.env.CRON_ENABLED === "false") {
    return NextResponse.json({
      skipped: true,
      reason: "CRON_ENABLED=false in env",
    });
  }

  // Server-authoritative kill switch (toggle from /admin). Same semantics as
  // CRON_ENABLED=false: ack the tick and skip. We don't write a cron-run
  // record on skip so the cron-run history stays honest about what fired.
  const ks = await checkKillSwitch();
  if (ks.killed) {
    return NextResponse.json({
      skipped: true,
      reason: "kill-switch-active",
      killSwitch: ks.state,
    });
  }

  const id = `cron_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = Date.now();

  try {
    const result = await runPipeline({
      maxProducts: 1,
      maxBuyersPerProduct: 1,
      findSuppliers: true,
      triggeredBy: "cron",
    });

    const cronRun: CronRun = {
      id,
      ranAt: result.startedAt,
      durationMs: Date.now() - startedAt,
      status: "success",
      pipelineId: result.pipelineId,
      totals: {
        products: result.totals.products,
        buyers: result.totals.buyers,
        suppliers: result.totals.suppliers,
        drafts: result.totals.drafts,
        totalCost: result.totals.totalCost,
      },
    };
    await store.saveCronRun(cronRun);

    return NextResponse.json({
      ok: true,
      cronRun,
      pipelineId: result.pipelineId,
    });
  } catch (e) {
    const cronRun: CronRun = {
      id,
      ranAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      status: "error",
      pipelineId: "",
      totals: { products: 0, buyers: 0, suppliers: 0, drafts: 0, totalCost: 0 },
      errorMessage: e instanceof Error ? e.message : String(e),
    };
    await store.saveCronRun(cronRun);
    return NextResponse.json(
      { ok: false, error: cronRun.errorMessage, cronRun },
      { status: 500 }
    );
  }
}
