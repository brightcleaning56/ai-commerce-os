import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { getOperator } from "@/lib/operator";
import { store } from "@/lib/store";
import { verifyTwilioSignature } from "@/lib/twilioVoice";
import { getWorkspaceConfig } from "@/lib/workspaceConfig";

// Twilio's standard opt-out keywords. Recognized by carriers + Twilio
// itself for compliance auto-handling, but we mirror the list locally
// so we can persist suppression on our side too (and not rely on
// Twilio's per-account STOP list for our outbound checks).
// https://www.twilio.com/docs/messaging/compliance/opt-out-keywords
const STOP_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/twilio/sms — inbound SMS from your Twilio number.
 *
 * Wire this URL on the Twilio phone number's Messaging configuration:
 *   Phone Numbers > Manage > <your-number> > Messaging Configuration
 *   "A message comes in" → Webhook → https://YOUR-DOMAIN/api/webhooks/twilio/sms (POST)
 *
 * When a lead texts your Twilio number back (responding to an AI auto-
 * reply / followup SMS), Twilio POSTs the message here. We:
 *   1. Verify X-Twilio-Signature against TWILIO_AUTH_TOKEN
 *   2. Find the matching Lead by phone (E.164 normalized)
 *   3. Append the message to lead.inboundSms[]
 *   4. Notify the operator via email (they're supposed to act on inbound)
 *   5. Respond with empty TwiML so Twilio doesn't auto-reply
 *
 * If no lead matches the From number, the message is logged to console
 * but not persisted (avoids creating stub leads from random texts to
 * the Twilio number). Operator should add the lead first via /leads
 * "+ Add lead" if they want to track an unknown sender.
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const formParams: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    formParams[k] = typeof v === "string" ? v : "";
  }

  const sig = req.headers.get("x-twilio-signature");
  const valid = verifyTwilioSignature({
    signatureHeader: sig,
    url: req.url,
    formParams,
  });
  if (!valid) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  const from = formParams.From?.trim();
  const body = formParams.Body?.trim();
  const messageSid = formParams.MessageSid?.trim();

  if (!from || !body) {
    return new NextResponse("Missing From or Body", { status: 400 });
  }

  // ── STOP-keyword detection ──────────────────────────────────────
  // Twilio's standard opt-out keywords trigger a suppression entry
  // BEFORE the lead-matching path, so we suppress unknown senders too.
  // Channel scope honors the workspace's compliance.unsubscribeMode:
  //   "auto"          -> suppress both email AND SMS to this contact
  //   "channel-only"  -> suppress only SMS (email path stays open if
  //                      the buyer separately opts back in)
  const trimmed = body.trim().toUpperCase();
  if (STOP_KEYWORDS.includes(trimmed)) {
    const wsConfig = await getWorkspaceConfig().catch(() => null);
    const channelScope = wsConfig?.unsubscribeMode === "channel-only" ? "sms" : undefined;
    try {
      // Suppression entry keyed by phone. email field is empty so the
      // dedupe + lookup paths key only on phone for this record.
      await store.addEmailSuppression({
        email: "",
        phone: from,
        channel: channelScope,
        source: "unsubscribe",
        reason: `Twilio inbound STOP keyword "${trimmed}" from ${from}`,
      });
    } catch (e) {
      console.warn(`[twilio sms inbound] STOP suppression write failed for ${from}:`, e);
    }
    // Twilio carriers handle the auto-confirmation reply themselves.
    // Returning empty TwiML keeps us out of the way.
    return emptyTwiml();
  }

  // Find matching lead. Twilio gives E.164 (+15551234567) -- match
  // against lead.phone with light normalization.
  const leads = await store.getLeads();
  const normalizedFrom = normalizePhone(from);
  const lead = leads.find((l) => normalizePhone(l.phone ?? "") === normalizedFrom);

  if (!lead) {
    console.info(
      `[twilio sms inbound] no matching lead for ${from} -- "${body.slice(0, 80)}". Operator can add via /leads.`,
    );
    // Empty TwiML so Twilio doesn't auto-reply with anything
    return emptyTwiml();
  }

  // Idempotency: if we already saved this MessageSid, don't double-write
  // (Twilio retries failed webhooks, so the same message can arrive twice).
  if (messageSid && (lead.inboundSms ?? []).some((m) => m.messageSid === messageSid)) {
    return emptyTwiml();
  }

  await store.updateLead(lead.id, {
    inboundSms: [
      ...(lead.inboundSms ?? []),
      {
        at: new Date().toISOString(),
        from,
        body,
        messageSid: messageSid || undefined,
      },
    ],
  });

  // Best-effort operator notification. SMS replies are interactive --
  // the operator should respond manually (or trigger the Reply Triage
  // agent in a follow-up slice). Email is the existing notification
  // channel -- won't block on Postmark hiccup.
  const op = getOperator();
  if (op.email) {
    sendEmail({
      to: op.email,
      subject: `${lead.company} replied via SMS · ${lead.name}`,
      textBody: [
        `${lead.name} (${lead.company}) just texted back:`,
        ``,
        `"${body}"`,
        ``,
        `From: ${from}`,
        `Lead: ${process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://avyncommerce.com"}/leads`,
      ].join("\n"),
      // Skip CAN-SPAM footer -- this is operator notification, not marketing
      skipFooter: true,
      metadata: { kind: "sms-inbound-notification", lead_id: lead.id },
    }).catch((err) => {
      console.warn(`[twilio sms inbound] operator notify failed:`, err);
    });
  }

  return emptyTwiml();
}

function emptyTwiml(): NextResponse {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Response></Response>`,
    {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    },
  );
}

/**
 * Normalize a phone for fuzzy matching. E.164 (+15551234567) wins;
 * stripped digits is the fallback so "555-123-4567" matches "+15551234567".
 */
function normalizePhone(p: string): string {
  if (!p) return "";
  const digits = p.replace(/\D/g, "");
  // If it's 10 digits (US local), prepend 1 to match the +1 in Twilio E.164
  if (digits.length === 10) return `1${digits}`;
  return digits;
}
