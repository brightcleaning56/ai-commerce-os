import { NextRequest, NextResponse } from "next/server";
import { getOperator } from "@/lib/operator";
import { sendEmail } from "@/lib/email";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public POST /api/invites/[token]/accept — token-gated invite acceptance.
 *
 * The invitee provides a display name (used to address them in operator
 * notifications + future per-user UI). We flip status to "accepted",
 * stamp acceptedAt + acceptedName, and best-effort email the operator so
 * they know to expect a new teammate showing up.
 *
 * SECURITY NOTE: this slice does NOT yet wire per-user authentication.
 * Accepting an invite today does NOT log the invitee in or grant any
 * in-app access. The operator gets visibility ("Sarah accepted!"); the
 * actual sign-in + role enforcement requires the auth-overhaul slice.
 *
 * Idempotent: re-accepting an already-accepted invite is a no-op (returns
 * the current state). Expired/cancelled invites are rejected.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid invite link" }, { status: 400 });
  }

  const invite = await store.getInviteByToken(token);
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.status === "expired") {
    return NextResponse.json(
      { error: "This invite has expired. Ask the workspace owner to send a new one." },
      { status: 410 },
    );
  }
  if (invite.status === "cancelled") {
    return NextResponse.json(
      { error: "This invite was cancelled by the workspace owner." },
      { status: 410 },
    );
  }
  if (invite.status === "accepted") {
    return NextResponse.json({
      ok: true,
      alreadyAccepted: true,
      acceptedAt: invite.acceptedAt,
    });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawName = typeof body.name === "string" ? body.name.trim() : "";
  if (!rawName || rawName.length < 2 || rawName.length > 80) {
    return NextResponse.json(
      { error: "Please provide a display name (2-80 characters)" },
      { status: 400 },
    );
  }

  const acceptedAt = new Date().toISOString();
  const updated = await store.updateInvite(invite.id, {
    status: "accepted",
    acceptedAt,
    acceptedName: rawName,
  });

  // Best-effort operator notification — don't block the invitee on email.
  // They get a confirmation in the UI either way.
  const op = getOperator();
  await sendEmail({
    to: op.email,
    subject: `${rawName} accepted your AVYN Commerce invite`,
    textBody: [
      `${rawName} (${invite.email}) accepted the ${invite.role} invite to`,
      `${op.company} on AVYN Commerce.`,
      ``,
      `Note: per-user sign-in isn't wired yet, so they can't access the`,
      `dashboard until the auth-overhaul slice ships. They've been told`,
      `to expect a follow-up email when it does.`,
      ``,
      `Manage at: ${process.env.NEXT_PUBLIC_APP_ORIGIN || "https://avyncommerce.com"}/admin/users`,
    ].join("\n"),
    metadata: { invite_id: invite.id, kind: "invite-accepted" },
  }).catch((err) => {
    console.error("[invites/accept] operator notification failed", err);
  });

  return NextResponse.json({
    ok: true,
    alreadyAccepted: false,
    invite: {
      role: updated?.role ?? invite.role,
      status: updated?.status ?? "accepted",
      acceptedAt,
    },
  });
}
