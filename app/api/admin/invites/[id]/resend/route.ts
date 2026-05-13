import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { sendEmail } from "@/lib/email";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/invites/[id]/resend
 *
 * Re-send the invite email for a pending invite. Useful when the first
 * send went out before email was wired (Postmark not approved yet,
 * EMAIL_LIVE=false, wrong domain, etc) -- operator fixes config,
 * comes back here, clicks Resend, gets the actual delivery status
 * inline.
 *
 * Token + expiry stay the same -- this is just "send the same email
 * again with the existing accept URL". If the invite is expired or
 * cancelled, returns 400 so the operator creates a new one instead.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const invite = await store.getInvite(id);
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.status !== "pending") {
    return NextResponse.json(
      {
        error: `Can't resend a ${invite.status} invite. Cancel + recreate to invite again.`,
      },
      { status: 400 },
    );
  }

  const op = getOperator();
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || "https://avyncommerce.com";
  const acceptUrl = `${origin}/invite/${invite.token}`;
  const expires = new Date(invite.expiresAt);

  const emailResult = await sendEmail({
    to: invite.email,
    subject: `Reminder: ${op.name} invited you to ${op.company} on AVYN Commerce`,
    textBody: [
      `Hi,`,
      ``,
      `Just a reminder -- ${op.name} (${op.email}) invited you to join`,
      `the ${op.company} workspace on AVYN Commerce as a ${invite.role}.`,
      ``,
      `Accept your invite:`,
      `${acceptUrl}`,
      ``,
      `This link expires ${expires.toDateString()}.`,
      ``,
      `Questions? Reply to this email and ${op.name} will get it directly.`,
      ``,
      `— The AVYN Commerce team`,
      `${origin}`,
    ].join("\n"),
    replyTo: op.email,
    metadata: { invite_id: invite.id, role: invite.role, resend: "true" },
  }).catch((err) => {
    console.error("[invites resend] email failed", err);
    return {
      ok: false,
      provider: "fallback" as const,
      sentTo: invite.email,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  });

  return NextResponse.json({
    ok: true,
    invite,
    email: {
      ok: emailResult.ok,
      provider: emailResult.provider,
      sentTo: emailResult.sentTo,
      simulated: ("simulated" in emailResult ? emailResult.simulated : false) ?? false,
      suppressed: ("suppressed" in emailResult ? emailResult.suppressed : false) ?? false,
      redirectedFrom: ("redirectedFrom" in emailResult ? emailResult.redirectedFrom : undefined),
      errorMessage: emailResult.errorMessage,
    },
    acceptUrl,
  });
}
