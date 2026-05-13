import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { getBackend, store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operator health check â€” surfaces backend status, today's spend, and key
 * configuration. Useful for monitoring + sanity-checking after deploy.
 *
 * Returns:
 *   - storage: backend name, ok status, detail
 *   - spend: today's cost / calls / configured budget
 *   - config: which integrations are configured (without leaking secrets)
 *   - counts: rough size of each entity store
 */
export async function GET(req: Request) {
  const auth = await requireCapability(req, "system:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const backend = getBackend();
  const [storageHealth, today, drafts, runs, quotes, pipelines, flags, cron, leads] = await Promise.all([
    backend.health(),
    store.getTodaySpend(),
    store.getDrafts().catch(() => []),
    store.getRuns().catch(() => []),
    store.getQuotes().catch(() => []),
    store.getPipelineRuns().catch(() => []),
    store.getRiskFlags().catch(() => []),
    store.getCronRuns().catch(() => []),
    store.getLeads().catch(() => []),
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
      // â”€â”€ Setup-status surface (consumed by /admin Setup panel) â”€â”€â”€â”€â”€â”€â”€â”€
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
      leads: leads.length,
    },
    // â”€â”€ AI health (catches silent fallback / 401 storms) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // The agents fall back to deterministic templates when Anthropic 401s
    // or hits any error. The platform keeps working but the AI personalization
    // is silently degraded. This rollup makes that visible at a glance.
    aiHealth: aiHealthSummary(runs),
    // â”€â”€ Auto-promote summary (lead â†’ buyer automation) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Shows whether the lead-auto-promote rule is firing and how often.
    // If it's set high enough to be disabled, threshold === null.
    autoPromote: autoPromoteSummary(leads),
  });
}

type LeadLike = {
  createdAt: string;
  promotedToBuyerId?: string;
  promotedAt?: string;
  promotedBy?: "operator" | "auto";
};

function autoPromoteSummary(leads: LeadLike[]) {
  const TWENTY_EIGHT_DAYS_MS = 28 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - TWENTY_EIGHT_DAYS_MS;
  const recent = leads.filter((l) => new Date(l.createdAt).getTime() >= cutoff);
  const promoted = recent.filter((l) => !!l.promotedToBuyerId);
  const auto = promoted.filter((l) => l.promotedBy === "auto").length;
  const operator = promoted.filter((l) => l.promotedBy === "operator").length;

  const raw = process.env.AUTO_PROMOTE_LEAD_SCORE;
  const parsed = raw ? Number.parseInt(raw, 10) : 70;
  const threshold = !raw || (Number.isFinite(parsed) && parsed >= 0 && parsed < 999) ? parsed : null;

  return {
    leads28d: recent.length,
    promoted28d: promoted.length,
    auto28d: auto,
    operator28d: operator,
    autoPct: promoted.length > 0 ? Math.round((auto / promoted.length) * 100) : 0,
    threshold,                                           // null = disabled (>=999)
    enabled: threshold !== null,
  };
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
  //   "ok"        â€” no recent errors and no fallbacks
  //   "degraded"  â€” some errors or fallbacks but not all
  //   "down"      â€” every recent run failed (likely auth)
  //   "idle"      â€” no runs in the last 24h
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
        ? "Anthropic returning 401 â€” verify ANTHROPIC_API_KEY at https://platform.claude.com/settings/keys, then redeploy"
        : null,
  };
}
