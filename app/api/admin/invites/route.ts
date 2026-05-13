import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireCapability } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { sendEmail } from "@/lib/email";
import { store, type Invite, type InviteRole } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ROLES: InviteRole[] = [
  "Admin",
  "Sales",
  "Operator",
  "Finance",
  "Marketing",
  "Support",
  "Analyst",
  "Developer",
  "Viewer",
];
const INVITE_EXPIRY_DAYS = 14;

/**
 * POST /api/admin/invites â€” create a pending workspace invite.
 *
 * Persists the invite to the store, sends a notification email to the
 * invitee (best-effort, doesn't block on send failure), and returns the
 * invite. Re-inviting the same email replaces an existing pending invite
 * for that address (no duplicates).
 *
 * SECURITY NOTE: this slice does NOT yet enforce roles in middleware.
 * Today every authenticated caller has owner privileges. The invite is
 * stored so the operator can see who's been asked; the per-user
 * acceptance + role enforcement ships in a follow-up.
 */
export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "users:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body.role === "string" ? body.role : "";

  if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role as InviteRole)) {
    return NextResponse.json(
      { error: `role must be one of ${VALID_ROLES.join(", ")}` },
      { status: 400 },
    );
  }

  // Don't invite the owner's own email â€” that's never valid.
  const op = getOperator();
  if (rawEmail === op.email.trim().toLowerCase()) {
    return NextResponse.json(
      { error: "That's the owner email â€” they're already a member." },
      { status: 400 },
    );
  }

  // Cancel any existing pending invite for this address so we don't
  // accumulate duplicates. The operator gets a fresh token + expiry.
  const existing = await store.getInviteByEmail(rawEmail);
  if (existing) {
    await store.updateInvite(existing.id, {
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
    });
  }

  const now = new Date();
  const expires = new Date(now.getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const invite: Invite = {
    id: `inv_${crypto.randomBytes(8).toString("hex")}`,
    email: rawEmail,
    role: role as InviteRole,
    status: "pending",
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    invitedBy: op.email,
    token: crypto.randomBytes(24).toString("base64url"),
  };

  await store.addInvite(invite);

  // Send the invite email AND capture the result so the UI can show the
  // operator whether delivery actually happened. Previously this was
  // fire-and-forget which made silent "Postmark not approved yet" or
  // "EMAIL_LIVE=false" failures invisible -- operator saw "Sent 9h ago"
  // but the invitee never got anything.
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || "https://avyncommerce.com";
  const acceptUrl = `${origin}/invite/${invite.token}`;
  const emailResult = await sendEmail({
    to: rawEmail,
    subject: `${op.name} invited you to ${op.company} on AVYN Commerce`,
    textBody: [
      `Hi,`,
      ``,
      `${op.name} (${op.email}) invited you to join the ${op.company} workspace`,
      `on AVYN Commerce as a ${invite.role}.`,
      ``,
      `Accept your invite:`,
      `${acceptUrl}`,
      ``,
      `This link expires ${expires.toDateString()}.`,
      ``,
      `(Heads up: per-user sign-in is still being finalized, so accepting`,
      `today confirms you're joining and tells ${op.name.split(" ")[0]} to expect you.`,
      `You'll get a follow-up with the actual sign-in link when it ships â€”`,
      `nothing for you to set up in the meantime.)`,
      ``,
      `Questions? Reply to this email and ${op.name} will get it directly.`,
      ``,
      `â€” The AVYN Commerce team`,
      `${origin}`,
    ].join("\n"),
    replyTo: op.email,
    metadata: { invite_id: invite.id, role: invite.role },
  }).catch((err) => {
    console.error("[invites] notification email failed", err);
    return {
      ok: false,
      provider: "fallback" as const,
      sentTo: rawEmail,
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
    acceptUrl, // returned so the operator can copy-paste manually if email failed
  });
}

/**
 * GET /api/admin/invites â€” list all invites. Mostly redundant with
 * /api/admin/users which already includes invites; provided for direct
 * access from scripts / future per-invite drill-down pages.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "users:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const invites = await store.getInvites();
  return NextResponse.json({ invites });
}
