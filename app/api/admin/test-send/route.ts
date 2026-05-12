import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/test-send — admin-only.
 *
 * Lets the operator verify that the email + SMS transport is actually
 * working BEFORE any real lead lands. Critical when:
 *  - Postmark approval is pending (we want to see exactly what comes back)
 *  - Twilio just got provisioned and we don't know if the From-number is live
 *  - You switched providers and want a smoke test
 *
 * Body:
 *  { channel: "email" | "sms", to: string, subject?: string, body?: string }
 *
 * Always returns the SendResult shape so the page can render exact provider
 * feedback (errorMessage from Postmark, status code, suppressed flag, etc).
 *
 * skipFooter is true because a test send is transactional, not marketing —
 * we don't want to imply the operator has unsubscribed when they were
 * just smoke-testing.
 */
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const body = await req.json().catch(() => ({}));
  const channel = body.channel === "sms" ? "sms" : "email";
  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!to) {
    return NextResponse.json({ error: "`to` is required" }, { status: 400 });
  }

  if (channel === "email") {
    const subject =
      (typeof body.subject === "string" && body.subject.trim()) ||
      `AVYN test email · ${new Date().toLocaleString()}`;
    const text =
      (typeof body.body === "string" && body.body.trim()) ||
      "This is a smoke-test email from /admin/system-health. " +
        "If you got this, your outbound email transport is wired. " +
        "Sent at " +
        new Date().toISOString();

    const res = await sendEmail({
      to,
      subject,
      textBody: text,
      // Mark as transactional so the CAN-SPAM footer doesn't get auto-appended.
      // The receiver is the operator themselves -- they don't need to "unsubscribe"
      // from their own smoke test.
      skipFooter: true,
      metadata: { kind: "admin-test-send" },
    });

    return NextResponse.json({
      channel,
      ok: res.ok,
      sentTo: res.sentTo,
      suppressed: res.suppressed,
      errorMessage: res.errorMessage,
      provider: res.provider,
    });
  }

  // SMS branch
  const smsBody =
    (typeof body.body === "string" && body.body.trim()) ||
    "AVYN test SMS — outbound SMS works. " +
      new Date().toLocaleTimeString();

  const res = await sendSms({ to, body: smsBody });
  return NextResponse.json({
    channel,
    ok: res.ok,
    sentTo: res.sentTo,
    errorMessage: res.errorMessage,
  });
}
