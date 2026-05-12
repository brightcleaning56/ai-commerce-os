import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { describeSchedule, PIPELINE_CRON_SCHEDULE, nextCronFire } from "@/lib/cron";
import { getKillSwitch } from "@/lib/killSwitch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/system-health — admin-only.
 *
 * Answers the one question every operator asks: "Is the AI outreach actually
 * going to work right now?" Each section reports whether its env config is
 * present, what features depend on it, and what severity a miss has.
 *
 * Severity model:
 *  - "blocking" — the feature literally does not run without this
 *  - "warning"  — degraded mode (e.g. fallback template, no SMS) but emails
 *                 still land
 *  - "info"     — purely cosmetic / optional
 *
 * Never reveals secret values. Only reports presence + the minimum metadata
 * needed for the operator to debug ("masked tail" of the From-email, the
 * 4-char prefix of the Anthropic key, etc).
 */
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  // ── Anthropic / AI generation ──────────────────────────────────────────
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const anthropicConfigured = !!anthropicKey && anthropicKey !== "sk-ant-...";
  const anthropic = {
    ok: anthropicConfigured,
    severity: "blocking" as const,
    affects: [
      "AI auto-reply to inbound leads",
      "AI followup nudges (daily cron)",
      "Reply triage suggestions",
      "Outreach Agent drafts",
      "Trend Hunter / Buyer Discovery / Supplier Finder agents",
    ],
    detail: anthropicConfigured
      ? {
          keyPrefix: anthropicKey!.slice(0, 8) + "…",
          modelCheap: process.env.ANTHROPIC_MODEL_CHEAP || "claude-haiku-4-5",
          modelSmart: process.env.ANTHROPIC_MODEL_SMART || "claude-sonnet-4-6",
          dailyBudgetUsd:
            process.env.ANTHROPIC_DAILY_BUDGET_USD === "0"
              ? "disabled"
              : `$${process.env.ANTHROPIC_DAILY_BUDGET_USD ?? "50"}`,
        }
      : { fixHint: "Set ANTHROPIC_API_KEY in Netlify env vars. Without it every agent falls back to deterministic templates." },
  };

  // ── Postmark / outbound email ─────────────────────────────────────────
  const postmarkToken = process.env.POSTMARK_TOKEN;
  const resendToken = process.env.RESEND_TOKEN;
  const fromAddress = process.env.EMAIL_FROM || process.env.OPERATOR_EMAIL || null;
  const emailLive = process.env.EMAIL_LIVE === "true";
  const testRecipient = process.env.EMAIL_TEST_RECIPIENT || null;
  const provider = postmarkToken ? "postmark" : resendToken ? "resend" : null;
  const email = {
    ok: !!provider && !!fromAddress,
    severity: "blocking" as const,
    affects: [
      "All outbound mail — AI replies, followups, operator notifications, outreach drafts",
      "CAN-SPAM compliance footers (won't matter if no mail goes out)",
    ],
    detail:
      provider && fromAddress
        ? {
            provider,
            fromAddress,
            liveMode: emailLive,
            testRecipient,
            note: emailLive
              ? "Live mode is ON — every recipient gets the real email."
              : "Live mode is OFF — every send is routed to the test recipient (or skipped). Flip EMAIL_LIVE=true to ship.",
          }
        : {
            fixHint:
              "Set POSTMARK_TOKEN (or RESEND_TOKEN) AND either EMAIL_FROM or OPERATOR_EMAIL. Without a provider every send is a no-op.",
          },
  };

  // ── Twilio / outbound SMS ─────────────────────────────────────────────
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_FROM;
  const smsLive = process.env.SMS_LIVE === "true";
  const smsTestRecipient = process.env.SMS_TEST_RECIPIENT || null;
  const sms = {
    ok: !!(twilioSid && twilioToken && twilioFrom),
    severity: "warning" as const,
    affects: ["SMS first-touch reply to leads who provide a phone number (email path still works without SMS)"],
    detail:
      twilioSid && twilioToken && twilioFrom
        ? {
            sidPrefix: twilioSid.slice(0, 6) + "…",
            fromNumber: twilioFrom,
            liveMode: smsLive,
            testRecipient: smsTestRecipient,
          }
        : { fixHint: "Set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM. Without these, SMS is silently skipped and only email goes out." },
  };

  // ── CAN-SPAM compliance ───────────────────────────────────────────────
  const operatorEmail = process.env.OPERATOR_EMAIL || null;
  const operatorCompany = process.env.OPERATOR_COMPANY || null;
  const operatorName = process.env.OPERATOR_NAME || null;
  const operatorTitle = process.env.OPERATOR_TITLE || null;
  const operatorPostal = process.env.OPERATOR_POSTAL_ADDRESS || null;
  const unsubscribeSecret = process.env.UNSUBSCRIBE_SECRET || process.env.ADMIN_TOKEN;
  const compliance = {
    ok: !!(operatorEmail && operatorCompany && operatorPostal && unsubscribeSecret),
    severity: "blocking" as const,
    affects: [
      "CAN-SPAM § 7704 footers on every outbound email",
      "RFC 8058 List-Unsubscribe one-click",
      "Penalties up to $50,120/violation if you scale sending without these",
    ],
    detail: {
      operatorEmail: operatorEmail ?? "MISSING",
      operatorCompany: operatorCompany ?? "MISSING",
      operatorName: operatorName ?? "(optional)",
      operatorTitle: operatorTitle ?? "(optional)",
      operatorPostalAddress: operatorPostal ?? "MISSING — physical address required",
      unsubscribeSecretConfigured: !!unsubscribeSecret,
      fixHint:
        !operatorEmail || !operatorCompany || !operatorPostal || !unsubscribeSecret
          ? "Set OPERATOR_EMAIL, OPERATOR_COMPANY, OPERATOR_POSTAL_ADDRESS (full mailing address), and UNSUBSCRIBE_SECRET (random hex). The footer auto-renders into every send."
          : "All set — every outbound email now ships with the compliant footer and the List-Unsubscribe header.",
    },
  };

  // ── Postmark webhook ──────────────────────────────────────────────────
  const postmarkWebhookSecret = process.env.POSTMARK_WEBHOOK_SECRET;
  const postmarkWebhook = {
    ok: !!postmarkWebhookSecret,
    severity: "warning" as const,
    affects: [
      "Auto-suppression of hard bounces and spam complaints from Postmark",
      "Without this, bounces still happen but your suppression list goes stale",
    ],
    detail: postmarkWebhookSecret
      ? {
          configured: true,
          endpoint: "/api/webhooks/postmark",
          authMode: "Bearer header or ?token query",
        }
      : {
          fixHint:
            "Set POSTMARK_WEBHOOK_SECRET (random hex). In Postmark dashboard, point the bounce + complaint webhook at /api/webhooks/postmark with this token.",
        },
  };

  // ── Cron / scheduled work ─────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const cronEnabled = process.env.CRON_ENABLED !== "false";
  const deployed = !!(process.env.VERCEL || process.env.NETLIFY || process.env.URL);
  const platform = process.env.VERCEL ? "vercel" : process.env.NETLIFY ? "netlify" : "local";
  const cron = {
    ok: !!cronSecret && cronEnabled && deployed,
    severity: "blocking" as const,
    affects: [
      "Daily lead followups (3, 6, 9 days after first touch)",
      "Pipeline auto-run for buyer discovery",
      "Outreach jobs (bulk-draft queue processor, every 5 min)",
      "Auto-promote sweep (re-scores existing leads)",
      "Auto-release (escrow released when delivered)",
      "Daily ops digest",
    ],
    detail: {
      secretConfigured: !!cronSecret,
      enabled: cronEnabled,
      deployed,
      platform,
      pipelineSchedule: PIPELINE_CRON_SCHEDULE,
      pipelineHuman: describeSchedule(PIPELINE_CRON_SCHEDULE),
      nextPipelineRunAt: nextCronFire(PIPELINE_CRON_SCHEDULE)?.toISOString() ?? null,
      fixHint:
        !cronSecret
          ? "Set CRON_SECRET in env. Cron handlers reject requests without a matching Bearer token."
          : !cronEnabled
            ? "CRON_ENABLED=false — set to true (or remove) to re-enable scheduled work."
            : !deployed
              ? "Local environment detected — cron only fires when deployed to Netlify or Vercel. The schedules are live in production."
              : "All set — schedules are firing on platform.",
    },
  };

  // ── Auth ──────────────────────────────────────────────────────────────
  const adminToken = process.env.ADMIN_TOKEN;
  const authConfig = {
    ok: !!adminToken && adminToken !== "change-me",
    severity: "blocking" as const,
    affects: ["Admin pages (/leads, /admin/*, /agent-runs) and admin API endpoints"],
    detail: adminToken
      ? {
          configured: true,
          isDefault: adminToken === "change-me",
          tokenPrefix: adminToken.slice(0, 4) + "…",
          fixHint:
            adminToken === "change-me"
              ? "ADMIN_TOKEN is still the default placeholder. Rotate it before exposing the deploy."
              : undefined,
        }
      : { fixHint: "Set ADMIN_TOKEN (random hex). Every admin route requires this." },
  };

  // ── Booking link for AI reply CTA ─────────────────────────────────────
  const bookingUrl = process.env.BOOKING_URL || null;
  const booking = {
    ok: !!bookingUrl,
    severity: "info" as const,
    affects: [
      "AI auto-reply email body can include a one-click meeting link",
      "Without it the AI proposes a manual reply-to-schedule flow",
    ],
    detail: bookingUrl
      ? { url: bookingUrl }
      : { fixHint: "Optional. Set BOOKING_URL to your Calendly / Cal.com / SavvyCal link. Lead-followup agent will weave it into the body." },
  };

  // ── Kill switch — surfaces the global pause so the operator sees it
  // at the top of every health snapshot, not buried in /admin.
  const killSwitchState = await getKillSwitch();
  const killSwitch = {
    // "ok" here means NOT killed — green icon when agents are running normally,
    // amber when the operator has explicitly paused everything.
    ok: !killSwitchState.active,
    severity: "warning" as const,
    affects: [
      "All agent paths skip while active: cron pipeline, lead followup cron, outreach jobs, lead AI auto-reply, manual retry-stuck, per-lead Send AI now",
    ],
    detail: killSwitchState.active
      ? {
          active: true,
          activatedAt: killSwitchState.activatedAt,
          activatedBy: killSwitchState.activatedBy ?? "(unknown)",
          reason: killSwitchState.reason ?? "(no reason given)",
          fixHint: "Deactivate at /admin Super Admin to resume agents",
        }
      : { active: false },
  };

  // ── Roll-up ───────────────────────────────────────────────────────────
  const checks = {
    anthropic,
    email,
    sms,
    compliance,
    postmarkWebhook,
    cron,
    killSwitch,
    auth: authConfig,
    booking,
  };

  const blockingFailures = Object.entries(checks).filter(
    ([, v]) => v.severity === "blocking" && !v.ok,
  ).length;
  const warningFailures = Object.entries(checks).filter(
    ([, v]) => v.severity === "warning" && !v.ok,
  ).length;
  const infoFailures = Object.entries(checks).filter(
    ([, v]) => v.severity === "info" && !v.ok,
  ).length;

  // overall green/yellow/red light
  const overall: "green" | "yellow" | "red" =
    blockingFailures > 0 ? "red" : warningFailures > 0 ? "yellow" : "green";

  return NextResponse.json({
    overall,
    blockingFailures,
    warningFailures,
    infoFailures,
    checks,
    generatedAt: new Date().toISOString(),
  });
}
