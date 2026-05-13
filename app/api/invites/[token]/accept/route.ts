import { NextRequest, NextResponse } from "next/server";
import { getOperator } from "@/lib/operator";
import { sendEmail } from "@/lib/email";
import { store } from "@/lib/store";
import { mintUserToken } from "@/lib/userToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public POST /api/invites/[token]/accept — token-gated invite acceptance.
 *
 * The invitee provides a display name (used to address them in operator
 * notifications + future per-user UI). We flip status to "accepted",
 * stamp acceptedAt + acceptedName, mint a per-user HMAC-signed bearer
 * token (lib/userToken.ts) so they can sign in to /signin, and
 * best-effort email the operator so they know to expect a new teammate.
 *
 * Idempotent: re-accepting an already-accepted invite returns the
 * existing state but does NOT re-mint the token — the user already got
 * one on first accept. Expired/cancelled invites are rejected.
 *
 * The minted user token is included in the JSON response so the
 * /invite/[token] page can display it once. We never store the raw
 * token server-side — it's stateless (HMAC-verified on every request).
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

  // Mint the per-user sign-in token. If ADMIN_TOKEN isn't set we're in
  // dev mode and the rest of the app is wide open anyway — emit an empty
  // string so the UI knows there's nothing to sign in with.
  let userToken = "";
  let tokenError: string | null = null;
  try {
    userToken = await mintUserToken({
      inviteId: invite.id,
      email: invite.email,
      role: invite.role,
    });
  } catch (err) {
    tokenError = err instanceof Error ? err.message : String(err);
    console.warn("[invites/accept] mintUserToken failed:", tokenError);
  }

  // Best-effort operator notification — don't block the invitee on email.
  const op = getOperator();
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || "https://avyncommerce.com";
  await sendEmail({
    to: op.email,
    subject: `${rawName} accepted your AVYN Commerce invite`,
    textBody: [
      `${rawName} (${invite.email}) accepted the ${invite.role} invite to`,
      `${op.company} on AVYN Commerce.`,
      ``,
      `They were issued a personal sign-in token (HMAC-signed against`,
      `ADMIN_TOKEN, 90-day expiry). They can sign in at ${origin}/signin`,
      `with that token. Until per-role permissions ship, the token`,
      `grants full admin access — keep that in mind for non-Owner roles.`,
      ``,
      `Manage at: ${origin}/admin/users`,
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
    userToken,
    tokenError,
    signinUrl: `${origin}/signin`,
  });
}
