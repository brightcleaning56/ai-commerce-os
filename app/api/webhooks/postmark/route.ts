import { NextRequest, NextResponse } from "next/server";
import { store, type EmailSuppressionSource } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Postmark webhook handler — auto-suppresses bad recipients without
 * operator intervention.
 *
 * Three Postmark event types matter for the suppression list:
 *   - HardBounce          → invalid recipient (never deliverable)
 *   - SpamComplaint       → recipient clicked "Mark as Spam"
 *   - SubscriptionChange  → RFC 8058 one-click unsubscribe from Gmail/iCloud
 *                            (these can also bypass our /api/unsubscribe path)
 *
 * All three result in the email being added to the suppression list +
 * propagated to any matching BusinessRecord.doNotContact.
 *
 * Auth model: Postmark webhooks support basic auth. We use a shared
 * secret POSTMARK_WEBHOOK_SECRET checked via:
 *   - Bearer header (preferred)
 *   - ?token query param (fallback for Postmark's basic-auth UI)
 *
 * If POSTMARK_WEBHOOK_SECRET is unset, the endpoint REFUSES all
 * requests with 503 — fail-closed because unverified webhook
 * payloads could be used to poison the suppression list.
 *
 * Configure in Postmark:
 *   Server → Webhooks → Add Webhook
 *   URL:   https://avyncommerce.com/api/webhooks/postmark?token=<secret>
 *   Subs:  Bounce, SpamComplaint, SubscriptionChange
 *
 * Reference: https://postmarkapp.com/developer/webhooks/
 */

type PostmarkBounceWebhook = {
  RecordType: "Bounce";
  Type: string;                    // "HardBounce", "SoftBounce", "Transient", etc.
  TypeCode: number;
  Email: string;
  MessageID?: string;
  Description?: string;
  Details?: string;
  BouncedAt?: string;
};

type PostmarkSpamComplaintWebhook = {
  RecordType: "SpamComplaint";
  Email: string;
  MessageID?: string;
  BouncedAt?: string;
};

type PostmarkSubscriptionChangeWebhook = {
  RecordType: "SubscriptionChange";
  Recipient: string;
  SuppressSending: boolean;        // true = unsubscribe, false = resubscribe
  SuppressionReason?: string;
  Origin?: string;                 // "Recipient" | "Customer" | "Admin"
  ChangedAt?: string;
};

type PostmarkWebhookPayload =
  | PostmarkBounceWebhook
  | PostmarkSpamComplaintWebhook
  | PostmarkSubscriptionChangeWebhook;

function verifyAuth(req: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.POSTMARK_WEBHOOK_SECRET;
  if (!expected || expected.length < 16) {
    // Fail-closed: unverified payloads could spam the suppression list
    return {
      ok: false,
      status: 503,
      error: "POSTMARK_WEBHOOK_SECRET not configured — endpoint disabled until set",
    };
  }
  // Check Bearer first, then ?token
  const auth = req.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(\S+)$/i.exec(auth)?.[1] ?? "";
  const queryToken = req.nextUrl.searchParams.get("token") ?? "";
  if (bearer === expected || queryToken === expected) return { ok: true };
  return { ok: false, status: 401, error: "Invalid webhook token" };
}

export async function POST(req: NextRequest) {
  const auth = verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: PostmarkWebhookPayload;
  try {
    body = (await req.json()) as PostmarkWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Per-event-type handling
  let email = "";
  let source: EmailSuppressionSource = "complaint";
  let reason = "";

  switch (body.RecordType) {
    case "Bounce": {
      // Only HardBounce + similar permanent failures go to suppression.
      // Transient / SoftBounce / DnsError / etc. don't — Postmark
      // already retries those.
      const t = body.Type ?? "";
      const permanent = /HardBounce|BadEmailAddress|ManuallyDeactivated|Unknown/i.test(t);
      if (!permanent) {
        return NextResponse.json({ ok: true, ignored: true, reason: `Transient bounce type: ${t}` });
      }
      email = body.Email ?? "";
      source = "hard_bounce";
      reason = `Postmark ${t}${body.Description ? ` · ${body.Description}` : ""}`.slice(0, 200);
      break;
    }
    case "SpamComplaint": {
      email = body.Email ?? "";
      source = "complaint";
      reason = "Postmark SpamComplaint — recipient marked as spam";
      break;
    }
    case "SubscriptionChange": {
      if (!body.SuppressSending) {
        // Resubscribe — Postmark already removes from THEIR suppression list.
        // We don't remove from ours; that would bypass the operator-consent
        // requirement (CAN-SPAM violation otherwise).
        return NextResponse.json({
          ok: true,
          ignored: true,
          reason: "Resubscribe — operator must explicitly remove from suppression list via /admin/suppressions",
        });
      }
      email = body.Recipient ?? "";
      source = "unsubscribe";
      reason = `Postmark SubscriptionChange${body.SuppressionReason ? ` · ${body.SuppressionReason}` : ""}${body.Origin ? ` (${body.Origin})` : ""}`.slice(0, 200);
      break;
    }
    default: {
      // Unknown event — Postmark sends Open, Click, Delivery, etc.
      // We ignore them silently (200 OK so Postmark doesn't retry).
      return NextResponse.json({ ok: true, ignored: true, reason: "Unhandled event type" });
    }
  }

  email = email.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Missing recipient email in payload" }, { status: 400 });
  }

  // Add to suppression list (idempotent — addEmailSuppression returns
  // the existing entry if already present)
  const sup = await store.addEmailSuppression({ email, source, reason });

  // Propagate DNC to BusinessRecord — same pattern as the public
  // unsubscribe endpoint.
  try {
    const biz = await store.getBusinessByEmail(email);
    if (biz && !biz.doNotContact) {
      await store.updateBusiness(biz.id, {
        doNotContact: true,
        optedOutAt: new Date().toISOString(),
        optedOutReason: reason,
        status: "do_not_contact",
      });
    }
  } catch (e) {
    console.warn("[webhooks/postmark] business propagation failed:", e instanceof Error ? e.message : e);
  }

  // Propagate to Lead status
  try {
    const lead = await store.getLeadByEmail(email);
    if (lead && lead.status !== "lost") {
      await store.updateLead(lead.id, {
        status: "lost",
        notes: [
          lead.notes,
          `Auto-suppressed via Postmark webhook ${new Date().toISOString().slice(0, 10)}: ${reason}`,
        ].filter(Boolean).join("\n"),
      });
    }
  } catch (e) {
    console.warn("[webhooks/postmark] lead propagation failed:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({
    ok: true,
    suppressed: true,
    suppressionId: sup.id,
    source,
  });
}
