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
      // ── Setup-status surface (consumed by /admin Setup panel) ────────
      stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
      stripeLive:
        !!process.env.STRIPE_SECRET_KEY &&
        process.env.STRIPE_SECRET_KEY.startsWith("sk_live_") &&
        process.env.STRIPE_LIVE === "true",
      bookingUrl: !!(process.env.BOOKING_URL ?? "").trim(),
      operatorEmail: !!process.env.OPERATOR_EMAIL,
    },
    counts: {
      drafts: drafts.length,
      agentRuns: runs.length,
      quotes: quotes.length,
      pipelineRuns: pipelines.length,
      riskFlags: flags.length,
      cronRuns: cron.length,
    },
    // ── AI health (catches silent fallback / 401 storms) ─────────────────
    // The agents fall back to deterministic templates when Anthropic 401s
    // or hits any error. The platform keeps working but the AI personalization
    // is silently degraded. This rollup makes that visible at a glance.
    aiHealth: aiHealthSummary(runs),
  });
}

type AgentRunLike = {
  agent: string;
  startedAt: string;
  status: "success" | "error";
  usedFallback: boolean;
  errorMessage?: string;
};

function aiHealthSummary(runs: AgentRunLike[]) {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - ONE_DAY_MS;
  const recent = runs.filter((r) => new Date(r.startedAt).getTime() >= cutoff);
  const total = recent.length;
  const errors = recent.filter((r) => r.status === "error").length;
  const fallbacks = recent.filter((r) => r.usedFallback).length;
  const lastError = recent.find((r) => r.status === "error" && r.errorMessage);
  const recent401 = recent.filter((r) => /\b401\b|unauthor/i.test(r.errorMessage || "")).length;

  // Status logic:
  //   "ok"        — no recent errors and no fallbacks
  //   "degraded"  — some errors or fallbacks but not all
  //   "down"      — every recent run failed (likely auth)
  //   "idle"      — no runs in the last 24h
  let status: "ok" | "degraded" | "down" | "idle";
  if (total === 0) status = "idle";
  else if (errors === total) status = "down";
  else if (errors > 0 || fallbacks > 0) status = "degraded";
  else status = "ok";

  return {
    status,
    runs24h: total,
    errors24h: errors,
    fallbacks24h: fallbacks,
    auth401Count: recent401,
    lastErrorAt: lastError?.startedAt ?? null,
    lastErrorAgent: lastError?.agent ?? null,
    lastErrorMessage: lastError?.errorMessage ?? null,
    // If many 401s in a row, surface the action operator should take
    suggestedAction:
      recent401 >= 3
        ? "Anthropic returning 401 — verify ANTHROPIC_API_KEY at https://platform.claude.com/settings/keys, then redeploy"
        : null,
  };
}
