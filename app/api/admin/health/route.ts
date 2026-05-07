import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getBackend, store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operator health check — surfaces backend status, today's spend, and key
 * configuration. Useful for monitoring + sanity-checking after deploy.
 *
 * Returns:
 *   - storage: backend name, ok status, detail
 *   - spend: today's cost / calls / configured budget
 *   - config: which integrations are configured (without leaking secrets)
 *   - counts: rough size of each entity store
 */
export async function GET(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const backend = getBackend();
  const [storageHealth, today, drafts, runs, quotes, pipelines, flags, cron] = await Promise.all([
    backend.health(),
    store.getTodaySpend(),
    store.getDrafts().catch(() => []),
    store.getRuns().catch(() => []),
    store.getQuotes().catch(() => []),
    store.getPipelineRuns().catch(() => []),
    store.getRiskFlags().catch(() => []),
    store.getCronRuns().catch(() => []),
  ]);

  const limitStr = process.env.ANTHROPIC_DAILY_BUDGET_USD;
  const budget = limitStr === "0" ? null : Number(limitStr ?? 50);

  return NextResponse.json({
    ok: storageHealth.ok,
    storage: storageHealth,
    spend: { today, budget },
    config: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      anthropicBudget: budget,
      adminTokenEnabled: !!process.env.ADMIN_TOKEN,
      cronSecretEnabled: !!process.env.CRON_SECRET,
      cronEnabled: process.env.CRON_ENABLED !== "false",
      emailLive: process.env.EMAIL_LIVE === "true",
      emailProvider: process.env.POSTMARK_TOKEN
        ? "postmark"
        : process.env.RESEND_TOKEN
        ? "resend"
        : "simulated",
      smsConfigured: !!(
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_FROM_NUMBER
      ),
      smsLive: process.env.SMS_LIVE === "true",
      firstViewWebhook: !!process.env.SHARE_FIRSTVIEW_WEBHOOK_URL,
      firstViewWebhookSigned: !!process.env.SHARE_FIRSTVIEW_WEBHOOK_SECRET,
      sentryConfigured: !!process.env.SENTRY_DSN,
      storeBackend: backend.name,
    },
    counts: {
      drafts: drafts.length,
      agentRuns: runs.length,
      quotes: quotes.length,
      pipelineRuns: pipelines.length,
      riskFlags: flags.length,
      cronRuns: cron.length,
    },
  });
}
