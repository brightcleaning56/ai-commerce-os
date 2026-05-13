import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/invites/[id] â€” cancel a pending invite.
 *
 * We don't hard-delete; we flip status to "cancelled" so the audit trail
 * survives. Already-cancelled / expired / accepted invites return 200
 * with a no-op flag so the UI doesn't error on stale state.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const existing = await store.getInvite(id);
  if (!existing) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (existing.status !== "pending") {
    return NextResponse.json({ ok: true, noop: true, invite: existing });
  }

  const updated = await store.updateInvite(id, {
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, invite: updated });
}

/**
 * GET /api/admin/invites/[id] â€” single invite lookup. Useful for the
 * future acceptance page that hits this with a token-derived id.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  const invite = await store.getInvite(id);
  if (!invite) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ invite });
}
