import { NextResponse } from "next/server";
import { describeSchedule, nextCronFire, PIPELINE_CRON_SCHEDULE } from "@/lib/cron";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const runs = await store.getCronRuns();
  const lastRun = runs[0] ?? null;
  const nextFire = nextCronFire(PIPELINE_CRON_SCHEDULE);

  // Auto-detect deployed environment. We're cron-scheduled either via:
  //   - Vercel cron (vercel.json + VERCEL env present)
  //   - Netlify Scheduled Functions (netlify.toml + NETLIFY env present)
  // Only "deployed:false" if neither platform's marker env is set (i.e. local).
  const deployed = !!(process.env.VERCEL || process.env.NETLIFY || process.env.URL);
  const platform = process.env.VERCEL ? "vercel" : process.env.NETLIFY ? "netlify" : "local";
  const enabled = process.env.CRON_ENABLED !== "false";
  const secretConfigured = !!process.env.CRON_SECRET;

  return NextResponse.json({
    deployed,
    platform,
    enabled,
    secretConfigured,
    schedule: PIPELINE_CRON_SCHEDULE,
    scheduleHuman: describeSchedule(PIPELINE_CRON_SCHEDULE),
    nextRunAt: nextFire?.toISOString() ?? null,
    lastRun,
    recentRuns: runs.slice(0, 10),
  });
}
