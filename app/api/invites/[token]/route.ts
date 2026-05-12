import { NextRequest, NextResponse } from "next/server";
import { getOperator } from "@/lib/operator";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public GET /api/invites/[token] — token-gated invite lookup.
 *
 * The token IS the auth: anyone with the link can view the invite. We
 * return ONLY the fields the invitee needs to make an accept/decline
 * decision: who invited them, what role, when it expires, current
 * status. Operator's name + company come from the workspace identity
 * (OPERATOR_*) so the invitee sees who they're joining.
 *
 * We deliberately do NOT return:
 *   - the invitee's stored email — they already know it (it's their own
 *     inbox), and not echoing it back closes a small enumeration vector
 *   - the inviter's full email beyond the domain — slight privacy
 *   - any other workspace data — token only authorizes accept/decline
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid invite link" }, { status: 400 });
  }

  const invite = await store.getInviteByToken(token);
  if (!invite) {
    return NextResponse.json(
      { error: "Invite not found", reason: "not-found" },
      { status: 404 },
    );
  }

  const op = getOperator();

  return NextResponse.json({
    role: invite.role,
    status: invite.status,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
    acceptedAt: invite.acceptedAt ?? null,
    invitedBy: {
      name: op.name,
      company: op.company,
    },
    // Workspace info for the landing page header
    workspace: op.company,
  });
}
