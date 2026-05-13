import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { store } from "@/lib/store";
import { mintUserToken } from "@/lib/userToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/invites/[id]/issue-token
 *
 * Owner-only action to mint a per-user sign-in token for an existing
 * invite, bypassing the accept flow. Two reasons this exists:
 *
 *   1. Invites accepted BEFORE the per-user-token slice shipped never
 *      got a token at acceptance time. This endpoint lets the owner
 *      issue one retroactively without making the teammate re-accept.
 *   2. If a teammate loses their token, the owner can re-issue without
 *      cancel+recreate (which would change the accept URL and email).
 *
 * Caller MUST be the global admin (cookie/header == ADMIN_TOKEN). We
 * do NOT let a per-user-token holder mint more tokens for someone
 * else — that would let any teammate escalate to "issue tokens for
 * arbitrary roles" without needing the global secret. Until role
 * enforcement ships, this owner-only gate is the only thing
 * preventing privilege escalation.
 *
 * Behavior:
 *   - Pending invite → 400 (use the accept flow; that auto-issues)
 *   - Cancelled / expired → 410
 *   - Accepted → mints a new token (does NOT invalidate the previous
 *     one — there's no denylist yet; both tokens remain valid until
 *     their respective exp times, or ADMIN_TOKEN rotates)
 *
 * The token is returned in the response body ONLY — never stored
 * server-side, never echoed elsewhere.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  // Reject per-user-token holders — only the global admin can mint
  // sign-in tokens for other people. (auth.user is set only when the
  // caller authenticated via a u_ token.)
  if (auth.mode === "production" && auth.user) {
    return NextResponse.json(
      {
        error:
          "Only the workspace owner (signed in with ADMIN_TOKEN) can issue sign-in tokens for other users.",
      },
      { status: 403 },
    );
  }

  const { id } = await params;
  const invite = await store.getInvite(id);
  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  if (invite.status === "cancelled") {
    return NextResponse.json(
      { error: "This invite was cancelled. Create a new one instead." },
      { status: 410 },
    );
  }
  if (invite.status === "expired") {
    return NextResponse.json(
      { error: "This invite has expired. Create a new one instead." },
      { status: 410 },
    );
  }
  if (invite.status === "pending") {
    return NextResponse.json(
      {
        error:
          "This invite hasn't been accepted yet. The invitee should accept via their email link — the token is issued at that point automatically.",
      },
      { status: 400 },
    );
  }

  let userToken = "";
  try {
    userToken = await mintUserToken({
      inviteId: invite.id,
      email: invite.email,
      role: invite.role,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Couldn't mint token: ${msg}` },
      { status: 500 },
    );
  }

  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || "https://avyncommerce.com";
  return NextResponse.json({
    ok: true,
    userToken,
    signinUrl: `${origin}/signin`,
    email: invite.email,
    role: invite.role,
    issuedAt: new Date().toISOString(),
  });
}
