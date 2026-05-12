import { generateLeadFollowup } from "@/lib/agents/lead-followup";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { store, type Lead } from "@/lib/store";

/**
 * First-touch AI reply for an inbound lead.
 *
 * Generates a personalized intro via Claude (or a deterministic fallback if
 * no API key) and ships it via Postmark (always) + Twilio (if the lead has
 * a phone AND Twilio is configured). Result is stored on `lead.aiReply` so
 * the operator can see exactly what we sent from the /leads page.
 *
 * This function is the single source of truth for the first-touch AI reply
 * — both `/api/leads` (auto-trigger on submit) AND `/api/leads/[id]/ai-reply`
 * (operator manual retry) call it. Never duplicate this logic inline.
 *
 * Failure modes:
 *  - Anthropic missing/errors → generateLeadFollowup returns usedFallback=true
 *    (deterministic template, still email-able)
 *  - generateLeadFollowup throws → aiReply.status = "error" + errorMessage
 *  - Email rejected (Postmark suppression / domain not approved) →
 *    aiReply.status = "skipped" + errorMessage. Caller can retry later.
 *
 * Never throws — returns a result object the caller can use for telemetry.
 */
export async function runLeadFirstReply(lead: Lead): Promise<{
  ok: boolean;
  status: "sent" | "skipped" | "error";
  channels: ("email" | "sms")[];
  subject?: string;
  body?: string;
  errorMessage?: string;
}> {
  const startedAt = new Date().toISOString();
  // Mark pending immediately so the operator UI shows "AI follow-up in flight"
  // even if the generation/send takes a few seconds.
  await store.updateLead(lead.id, {
    aiReply: { status: "pending", at: startedAt, channel: [] },
  });

  let subject = "";
  let body = "";
  let smsBody: string | undefined;
  let model = "fallback (no API key)";
  let estCostUsd: number | undefined;
  let usedFallback = true;

  try {
    const result = await generateLeadFollowup(lead);
    subject = result.subject;
    body = result.body;
    smsBody = result.smsBody;
    model = result.model;
    estCostUsd = result.estCostUsd;
    usedFallback = result.usedFallback;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await store.updateLead(lead.id, {
      aiReply: {
        status: "error",
        at: new Date().toISOString(),
        errorMessage,
      },
    });
    return { ok: false, status: "error", channels: [], errorMessage };
  }

  const channels: ("email" | "sms")[] = [];

  // Email path — always fires if we have a subject + body.
  const emailRes = await sendEmail({
    to: lead.email,
    subject,
    textBody: body,
    // Replies route to the operator's inbox so the founder stays in the loop.
    replyTo: process.env.OPERATOR_EMAIL || undefined,
    metadata: { lead_id: lead.id, kind: "lead-followup" },
  });
  if (emailRes.ok) channels.push("email");

  // SMS path — only if Twilio is configured AND lead provided a phone.
  let smsSentTo: string | undefined;
  if (smsBody && lead.phone) {
    const smsRes = await sendSms({ to: lead.phone, body: smsBody });
    if (smsRes.ok) {
      channels.push("sms");
      smsSentTo = smsRes.sentTo;
    }
  }

  const status: "sent" | "skipped" | "error" = channels.length > 0 ? "sent" : "skipped";
  const errorMessage = channels.length === 0 ? emailRes.errorMessage : undefined;

  await store.updateLead(lead.id, {
    aiReply: {
      status,
      at: new Date().toISOString(),
      subject,
      body,
      smsBody,
      smsSentTo,
      channel: channels,
      model,
      estCostUsd: usedFallback ? undefined : estCostUsd,
      errorMessage,
    },
  });

  return {
    ok: channels.length > 0,
    status,
    channels,
    subject,
    body,
    errorMessage,
  };
}
