import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Real /admin/users data — owner identity from OPERATOR_* env vars,
 * invites from the persistent store. No SAMPLE rows.
 *
 * Today the workspace is single-operator: there's exactly one row in
 * `members` (the owner). When invitee acceptance ships, accepted invites
 * will appear here as additional members.
 */
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const op = getOperator();
  const invites = await store.getInvites();

  const owner = {
    id: "owner",
    name: op.name,
    email: op.email,
    role: "Owner" as const,
    title: op.title,
    company: op.company,
    initials: op.initials,
    // 2FA state isn't tracked yet (single ADMIN_TOKEN auth model). Return
    // null so the UI can render "—" honestly instead of a fake checkmark.
    twoFactor: null as boolean | null,
    // No per-user activity tracking yet — operator is "currently logged in"
    // since they made this request.
    lastActive: new Date().toISOString(),
  };

  const pendingInvites = invites.filter((i) => i.status === "pending");
  const totalSeats = 1 + pendingInvites.length;

  return NextResponse.json({
    owner,
    invites,
    counts: {
      total: totalSeats,
      active: 1,                       // just the owner today
      pending: pendingInvites.length,
      twoFactorOn: 0,                  // not tracked yet
    },
    // Tell the UI what's wired vs what's not so it can render honestly
    // instead of pretending SSO/SCIM/2FA exist.
    capabilities: {
      perUserAuth: false,              // single ADMIN_TOKEN/cookie today
      ssoConfigured: !!process.env.SSO_PROVIDER,
      scimConfigured: !!process.env.SCIM_TOKEN,
      twoFactorTracked: false,
      // Public /invite/[token] page + accept endpoint are live. Invitee can
      // confirm + the operator gets notified. Per-user sign-in is still
      // pending so it's "soft accept" not "logged-in accept".
      acceptanceFlow: true,
    },
  });
}
