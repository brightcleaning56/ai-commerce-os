import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { describeSchedule, PIPELINE_CRON_SCHEDULE, nextCronFire } from "@/lib/cron";
import { getFreightProvider } from "@/lib/freight";
import { getKillSwitch } from "@/lib/killSwitch";
import { getVoiceProvider, type VoiceProviderInfo } from "@/lib/voice";

/**
 * Slice 83: per-provider voice fix hint. Same partial-config
 * diagnostic pattern as slice 80 SMS/email -- when VOICE_PROVIDER
 * is set but some required vars are missing, name the specific
 * missing ones instead of "see .env.local.example."
 */
function voiceFixHint(info: VoiceProviderInfo): string {
  const d = info.detail as Record<string, unknown>;
  if (info.provider === "twilio") {
    const missing: string[] = [];
    if (!d.accountSidSet) missing.push("TWILIO_ACCOUNT_SID");
    if (!d.apiKeySet) missing.push("TWILIO_API_KEY");
    if (!d.apiSecretSet) missing.push("TWILIO_API_SECRET");
    if (!d.twimlAppSidSet) missing.push("TWILIO_TWIML_APP_SID");
    if (missing.length === 0) return "All Twilio voice vars are set.";
    if (missing.length === 4) {
      return "VOICE_PROVIDER=twilio but no Twilio vars set. Need ACCOUNT_SID + API_KEY + API_SECRET + TWIML_APP_SID. Create API key under Account > API keys; create TwiML App under Voice > TwiML > Apps.";
    }
    return `Twilio voice partially configured -- missing: ${missing.join(", ")}.`;
  }
  if (info.provider === "vapi") {
    const missing: string[] = [];
    if (!d.privateKeySet) missing.push("VAPI_PRIVATE_KEY");
    if (!d.phoneNumberIdSet) missing.push("VAPI_PHONE_NUMBER_ID");
    if (missing.length === 0) return "All required Vapi vars set.";
    if (missing.length === 2) {
      return "VOICE_PROVIDER=vapi but no Vapi vars set. Need VAPI_PRIVATE_KEY + VAPI_PHONE_NUMBER_ID at minimum (VAPI_PUBLIC_KEY enables browser calls).";
    }
    return `Vapi partially configured -- missing: ${missing.join(", ")}.`;
  }
  if (info.provider === "bland") {
    return d.apiKeySet
      ? "Bland configured."
      : "VOICE_PROVIDER=bland but BLAND_API_KEY is missing.";
  }
  return `Set the matching env vars for ${info.provider} -- see .env.local.example.`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/system-health â€” admin-only.
 *
 * Answers the one question every operator asks: "Is the AI outreach actually
 * going to work right now?" Each section reports whether its env config is
 * present, what features depend on it, and what severity a miss has.
 *
 * Severity model:
 *  - "blocking" â€” the feature literally does not run without this
 *  - "warning"  â€” degraded mode (e.g. fallback template, no SMS) but emails
 *                 still land
 *  - "info"     â€” purely cosmetic / optional
 *
 * Never reveals secret values. Only reports presence + the minimum metadata
 * needed for the operator to debug ("masked tail" of the From-email, the
 * 4-char prefix of the Anthropic key, etc).
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "system:read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  // â”€â”€ Anthropic / AI generation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          keyPrefix: anthropicKey!.slice(0, 8) + "â€¦",
          modelCheap: process.env.ANTHROPIC_MODEL_CHEAP || "claude-haiku-4-5",
          modelSmart: process.env.ANTHROPIC_MODEL_SMART || "claude-sonnet-4-6",
          dailyBudgetUsd:
            process.env.ANTHROPIC_DAILY_BUDGET_USD === "0"
              ? "disabled"
              : `$${process.env.ANTHROPIC_DAILY_BUDGET_USD ?? "50"}`,
        }
      : { fixHint: "Set ANTHROPIC_API_KEY in Netlify env vars. Without it every agent falls back to deterministic templates." },
  };

  // â”€â”€ Postmark / outbound email â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const postmarkToken = process.env.POSTMARK_TOKEN;
  const resendToken = process.env.RESEND_TOKEN;
  const fromAddress = process.env.EMAIL_FROM || process.env.OPERATOR_EMAIL || null;
  const emailLive = process.env.EMAIL_LIVE === "true";
  const testRecipient = process.env.EMAIL_TEST_RECIPIENT || null;
  const provider = postmarkToken ? "postmark" : resendToken ? "resend" : null;
  // Slice 80: partial-config diagnostics, same pattern as SMS below.
  function emailFixHint(): string {
    if (!provider && !fromAddress) {
      return "Set POSTMARK_TOKEN (or RESEND_TOKEN) AND either EMAIL_FROM or OPERATOR_EMAIL. Without a provider every send is a no-op.";
    }
    if (!provider) {
      return "Provider missing -- EMAIL_FROM/OPERATOR_EMAIL is set but no POSTMARK_TOKEN or RESEND_TOKEN. Sends will no-op until a token lands.";
    }
    return `Provider ${provider} configured but no from-address. Set EMAIL_FROM or OPERATOR_EMAIL.`;
  }

  const email = {
    ok: !!provider && !!fromAddress,
    severity: "blocking" as const,
    affects: [
      "All outbound mail â€” AI replies, followups, operator notifications, outreach drafts",
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
              ? "Live mode is ON â€” every recipient gets the real email."
              : "Live mode is OFF â€” every send is routed to the test recipient (or skipped). Flip EMAIL_LIVE=true to ship.",
            // Slice 80: catch the test-mode-without-recipient case
            // (test-send button will silently skip).
            testRecipientHint:
              !testRecipient && !emailLive
                ? "EMAIL_LIVE=false and EMAIL_TEST_RECIPIENT is empty -- test sends will route to nothing. Set EMAIL_TEST_RECIPIENT or flip EMAIL_LIVE=true."
                : undefined,
          }
        : { fixHint: emailFixHint() },
  };

  // â”€â”€ Twilio / outbound SMS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  // Slice 80: honor TWILIO_FROM_NUMBER (canonical, matches Twilio
  // docs + lib/sms.ts) AND TWILIO_FROM (legacy alias). Previously
  // only TWILIO_FROM was checked, so a deploy using the canonical
  // name was wrongly reported as broken.
  const twilioFrom = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_FROM;
  const smsLive = process.env.SMS_LIVE === "true";
  const smsTestRecipient = process.env.SMS_TEST_RECIPIENT || null;

  // Slice 80: partial-config diagnostics. When SID is set but FROM is
  // missing, the operator wants to know exactly which var to add,
  // not be told "set all three" (the case I hit live testing today).
  function smsFixHint(): string {
    const missing: string[] = [];
    if (!twilioSid) missing.push("TWILIO_ACCOUNT_SID");
    if (!twilioToken) missing.push("TWILIO_AUTH_TOKEN");
    if (!twilioFrom) missing.push("TWILIO_FROM_NUMBER (or legacy TWILIO_FROM)");
    if (missing.length === 0) return "All set.";
    if (missing.length === 3) {
      return "Set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER. Without these, SMS is silently skipped and only email goes out.";
    }
    return `Missing: ${missing.join(", ")}. The other Twilio vars are set, so this is a partial config that will fail at send time.`;
  }

  const sms = {
    ok: !!(twilioSid && twilioToken && twilioFrom),
    severity: "warning" as const,
    affects: ["SMS first-touch reply to leads who provide a phone number (email path still works without SMS)"],
    detail:
      twilioSid && twilioToken && twilioFrom
        ? {
            sidPrefix: twilioSid.slice(0, 6) + "â€¦",
            fromNumber: twilioFrom,
            liveMode: smsLive,
            testRecipient: smsTestRecipient,
            // Slice 80: surface trial-account constraint when relevant.
            // Trial Twilio accounts can only send to verified Caller IDs,
            // and without SMS_TEST_RECIPIENT set, the test-send button
            // (SMS_LIVE=false path) has nowhere to route.
            testRecipientHint:
              !smsTestRecipient && !smsLive
                ? "SMS_LIVE=false and SMS_TEST_RECIPIENT is empty -- the test-send button will have no recipient. Set SMS_TEST_RECIPIENT to a verified number."
                : undefined,
          }
        : { fixHint: smsFixHint() },
  };

  // â”€â”€ CAN-SPAM compliance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      "CAN-SPAM Â§ 7704 footers on every outbound email",
      "RFC 8058 List-Unsubscribe one-click",
      "Penalties up to $50,120/violation if you scale sending without these",
    ],
    detail: {
      operatorEmail: operatorEmail ?? "MISSING",
      operatorCompany: operatorCompany ?? "MISSING",
      operatorName: operatorName ?? "(optional)",
      operatorTitle: operatorTitle ?? "(optional)",
      operatorPostalAddress: operatorPostal ?? "MISSING â€” physical address required",
      unsubscribeSecretConfigured: !!unsubscribeSecret,
      fixHint:
        !operatorEmail || !operatorCompany || !operatorPostal || !unsubscribeSecret
          ? "Set OPERATOR_EMAIL, OPERATOR_COMPANY, OPERATOR_POSTAL_ADDRESS (full mailing address), and UNSUBSCRIBE_SECRET (random hex). The footer auto-renders into every send."
          : "All set â€” every outbound email now ships with the compliant footer and the List-Unsubscribe header.",
    },
  };

  // â”€â”€ Postmark webhook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Cron / scheduled work â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
            ? "CRON_ENABLED=false â€” set to true (or remove) to re-enable scheduled work."
            : !deployed
              ? "Local environment detected â€” cron only fires when deployed to Netlify or Vercel. The schedules are live in production."
              : "All set â€” schedules are firing on platform.",
    },
  };

  // â”€â”€ Auth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const adminToken = process.env.ADMIN_TOKEN;
  const authConfig = {
    ok: !!adminToken && adminToken !== "change-me",
    severity: "blocking" as const,
    affects: ["Admin pages (/leads, /admin/*, /agent-runs) and admin API endpoints"],
    detail: adminToken
      ? {
          configured: true,
          isDefault: adminToken === "change-me",
          tokenPrefix: adminToken.slice(0, 4) + "â€¦",
          fixHint:
            adminToken === "change-me"
              ? "ADMIN_TOKEN is still the default placeholder. Rotate it before exposing the deploy."
              : undefined,
        }
      : { fixHint: "Set ADMIN_TOKEN (random hex). Every admin route requires this." },
  };

  // â”€â”€ Voice / phone calls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Surfaces which provider is configured (if any) so the operator sees
  // whether /tasks is using tel:-fallback or a real browser dialer + AI
  // outbound capability.
  const voiceInfo = getVoiceProvider();
  const voice = {
    ok: voiceInfo.configured,
    severity: "warning" as const,
    affects: [
      "Operator browser calling from /tasks call session (tel: fallback works without)",
      "AI agent placing outbound calls (Vapi / Bland only â€” Twilio needs ConversationRelay wiring)",
    ],
    detail: voiceInfo.configured
      ? {
          provider: voiceInfo.provider,
          supportsAiOutbound: voiceInfo.supportsAiOutbound,
          supportsBrowserCalls: voiceInfo.supportsBrowserCalls,
          ...voiceInfo.detail,
          // Twilio-specific: confirm the TwiML webhooks are reachable.
          // Operator needs to set both in Twilio Console (one on the
          // TwiML App for outbound, one on the phone number for inbound).
          ...(voiceInfo.provider === "twilio"
            ? {
                outboundTwimlUrl: `${process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://YOUR-DOMAIN"}/api/voice/twiml`,
                inboundTwimlUrl: `${process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://YOUR-DOMAIN"}/api/voice/inbound`,
                recordingStatusUrl: `${process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://YOUR-DOMAIN"}/api/voice/recording-status`,
                inboundSmsUrl: `${process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://YOUR-DOMAIN"}/api/webhooks/twilio/sms`,
                tokenEndpoint: "/api/voice/token (admin-only GET)",
                recordingEnabled: process.env.TWILIO_RECORD_CALLS === "true",
                setupHint:
                  "OUTBOUND CALLS: Voice > TwiML > Apps > <your-app> > Voice Configuration > Request URL = outboundTwimlUrl (POST). Put App SID in TWILIO_TWIML_APP_SID. INBOUND CALLS: Phone Numbers > <your-number> > Voice Configuration > Webhook = inboundTwimlUrl (POST). INBOUND SMS: same number > Messaging Configuration > Webhook = inboundSmsUrl (POST). RECORDING: set TWILIO_RECORD_CALLS=true.",
              }
            : {}),
        }
      : voiceInfo.provider === "fallback"
        ? {
            currentMode: "tel: fallback (device dialer)",
            fixHint:
              "Set VOICE_PROVIDER=twilio + TWILIO_API_KEY + TWILIO_API_SECRET + TWILIO_TWIML_APP_SID for operator browser dialer (~$0.0085/min, recommended for AVYN). Or VOICE_PROVIDER=vapi for AI-driven outbound calls (~$0.05/min).",
          }
        : {
            provider: voiceInfo.provider,
            ...voiceInfo.detail,
            // Slice 83: partial-config diagnostics, same pattern as
            // slice 80 SMS/email. Distinguishes "fully unconfigured"
            // from "VOICE_PROVIDER set but some required vars missing"
            // -- the latter is the case that bites operators who get
            // half-way through setup and assume it's wired.
            fixHint: voiceFixHint(voiceInfo),
          },
  };

  // â”€â”€ Booking link for AI reply CTA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // ── Freight provider (slice 62) ────────────────────────────────────
  // Surface whether buyer-facing freight estimates use live Shippo
  // quotes or the deterministic rate-card fallback. Info-level: the
  // rate card always works, but Shippo is the supplier-of-truth for
  // real bookings. The /quote/[id] preview + /cadences merge tags
  // both read through estimateLane() which honors this provider.
  const freightProvider = getFreightProvider();
  const freightShippoConfigured = freightProvider === "shippo";
  const freightShippoKeyPrefix = process.env.SHIPPO_API_KEY?.slice(0, 8);
  const freight = {
    ok: freightShippoConfigured,
    severity: "info" as const,
    affects: [
      "Buyer-facing freight preview on /quote/[id] (pre-accept)",
      "Cadence composer freight_* merge tags ({{freight_cheapest}}, {{freight_mode}}, {{freight_transit}})",
      "Quote freight auto-attach on destination capture (slice 56-ish)",
      "/admin/lanes economic-viability table",
    ],
    detail: freightShippoConfigured
      ? {
          provider: "shippo",
          mode: "live",
          shippoKeyPrefix: freightShippoKeyPrefix ? `${freightShippoKeyPrefix}…` : "(set)",
          note: "Estimates hit Shippo /v2/freight/rates. Any error falls back to the rate card so buyers always get a number.",
        }
      : {
          provider: "fallback",
          mode: "rate-card",
          note: "Using the deterministic rate card (industry-standard order-of-magnitude USD/kg). Good enough for plausibility checks; not real carrier quotes.",
          fixHint:
            "Optional. Set SHIPPO_API_KEY to swap in live carrier rates. Sign up at goshippo.com — they offer a free tier for testing.",
        },
  };

  // â”€â”€ Kill switch â€” surfaces the global pause so the operator sees it
  // at the top of every health snapshot, not buried in /admin.
  const killSwitchState = await getKillSwitch();
  const killSwitch = {
    // "ok" here means NOT killed â€” green icon when agents are running normally,
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

  // â”€â”€ Roll-up â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const checks = {
    anthropic,
    email,
    sms,
    voice,
    compliance,
    postmarkWebhook,
    cron,
    killSwitch,
    auth: authConfig,
    booking,
    freight,
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
