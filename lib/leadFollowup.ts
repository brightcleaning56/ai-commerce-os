import { generateLeadFollowup } from "@/lib/agents/lead-followup";
import { sendEmail } from "@/lib/email";
import { checkKillSwitch } from "@/lib/killSwitch";
import { store, type Lead } from "@/lib/store";

/**
 * Auto-followup for inbound leads.
 *
 * Trigger criteria — a lead is a follow-up candidate when ALL hold:
 *   - aiReply.status === "sent" (we successfully sent the first AI touch)
 *   - createdAt is at least N days old (default 3)
 *   - status is still "new" — operator has NOT manually marked contacted/etc.
 *     (suppresses second-touch when a real conversation is underway)
 *   - aiFollowups[] is empty OR the last one is also at least N days old
 *     (we don't spam — at most one followup per N-day window)
 *
 * The cron at /api/cron/lead-followups runs daily and processes everyone
 * who matches. Postmark approval state is NOT checked here — the email
 * adapter handles per-recipient rejection cleanly. We just record the
 * outcome on the lead so the operator sees what was attempted.
 */

const DEFAULT_DAYS_BETWEEN_TOUCHES = 3;

export type FollowupCandidate = {
  lead: Lead;
  daysSinceLastTouch: number;
};

export async function findLeadFollowupCandidates(
  daysBetweenTouches: number = DEFAULT_DAYS_BETWEEN_TOUCHES,
): Promise<FollowupCandidate[]> {
  const leads = await store.getLeads();
  const cutoffMs = Date.now() - daysBetweenTouches * 24 * 60 * 60 * 1000;
  const out: FollowupCandidate[] = [];
  for (const lead of leads) {
    if (lead.aiReply?.status !== "sent") continue;
    if (lead.status !== "new") continue;
    const lastTouchAt = lead.aiFollowups?.length
      ? lead.aiFollowups[lead.aiFollowups.length - 1].at
      : lead.aiReply.at;
    const lastTouchMs = new Date(lastTouchAt).getTime();
    if (lastTouchMs > cutoffMs) continue;
    const daysSinceLastTouch = Math.floor((Date.now() - lastTouchMs) / (24 * 60 * 60 * 1000));
    out.push({ lead, daysSinceLastTouch });
  }
  return out;
}

/**
 * Generate + send a second AI touch to a single lead. Records outcome on
 * the lead's aiFollowups[] array. Does not throw — returns a result the
 * cron handler aggregates for reporting.
 */
export async function runLeadFollowup(lead: Lead): Promise<{
  ok: boolean;
  status: "sent" | "skipped" | "error";
  subject?: string;
  body?: string;
  model?: string;
  estCostUsd?: number;
  errorMessage?: string;
}> {
  // Same kill-switch pattern as runLeadFirstReply -- gate every entry path
  // (daily cron + manual "Send AI followup now" button) uniformly.
  const ks = await checkKillSwitch();
  if (ks.killed) {
    return {
      ok: false,
      status: "skipped",
      errorMessage: `Kill switch active${ks.state.reason ? ` — ${ks.state.reason}` : ""}`,
    };
  }

  const followupNumber = (lead.aiFollowups?.length ?? 0) + 1;
  const daysSinceCreated = Math.floor(
    (Date.now() - new Date(lead.createdAt).getTime()) / (24 * 60 * 60 * 1000),
  );

  let subject: string | undefined;
  let body: string | undefined;
  let model: string | undefined;
  let estCostUsd: number | undefined;

  try {
    // Reuse the lead-followup agent — but synthesize a "this is a second touch"
    // message so the prompt produces a follow-up rather than an introduction.
    // We mutate a copy of the lead so the agent gets the right context.
    const followupContext: Lead = {
      ...lead,
      message:
        `[INTERNAL CONTEXT — this is follow-up #${followupNumber}, ` +
        `${daysSinceCreated} days after the original submission. ` +
        `Original message from the lead, if any: ${lead.message || "(none)"} ` +
        `Original AI reply was sent on ${lead.aiReply?.at}. ` +
        `Buyer has not replied. Compose a SHORTER nudge — 2 sentences max — ` +
        `acknowledging it's been a few days, restating the offer, and lowering ` +
        `the bar for engagement (a 10-min call instead of 15, or a written ` +
        `summary if they prefer). Do NOT apologize or grovel. Sound like a ` +
        `friendly nudge from a real founder, not a drip sequence.]`,
    };
    const result = await generateLeadFollowup(followupContext);
    subject = result.subject;
    body = result.body;
    model = result.model;
    estCostUsd = result.estCostUsd;

    const send = await sendEmail({
      to: lead.email,
      subject: subject ?? `Following up — ${lead.company}`,
      textBody: body ?? "",
      replyTo: process.env.OPERATOR_EMAIL,
      metadata: {
        lead_id: lead.id,
        kind: "lead-followup",
        followup_number: String(followupNumber),
      },
    });

    const status: "sent" | "skipped" | "error" = send.ok ? "sent" : "skipped";
    const entry = {
      at: new Date().toISOString(),
      daysSinceCreated,
      status,
      subject,
      body,
      model,
      estCostUsd,
      errorMessage: send.errorMessage,
    };
    await store.updateLead(lead.id, {
      aiFollowups: [...(lead.aiFollowups ?? []), entry],
    });
    return { ok: send.ok, status, subject, body, model, estCostUsd, errorMessage: send.errorMessage };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const entry = {
      at: new Date().toISOString(),
      daysSinceCreated,
      status: "error" as const,
      subject,
      body,
      model,
      estCostUsd,
      errorMessage,
    };
    await store.updateLead(lead.id, {
      aiFollowups: [...(lead.aiFollowups ?? []), entry],
    });
    return { ok: false, status: "error", errorMessage };
  }
}
