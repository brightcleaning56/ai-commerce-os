import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Revoke a share link immediately. Idempotent.
 *
 * Two modes:
 *  - No `?token=` (or `?token=` matches the default shareToken):
 *      revokes the default link (legacy behavior)
 *  - `?token=<namedLinkToken>`:
 *      revokes only that named per-recipient link
 *
 * Auth: open in the demo (single-tenant). Production would gate on a workspace role.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  const targetToken = req.nextUrl.searchParams.get("token") || "";
  const run = await store.getPipelineRun(id);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // No targetToken or matches the default → revoke the default link
  if (!targetToken || targetToken === run.shareToken) {
    const updated = await store.revokeShareToken(id);
    if (!updated) {
      return NextResponse.json({ error: "Revoke failed" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      id,
      scope: "default",
      revoked: updated.revoked === true,
      revokedAt: updated.revokedAt ?? null,
    });
  }

  // Per-named-link revoke
  const updated = await store.revokeShareLink(id, targetToken);
  if (!updated) {
    return NextResponse.json(
      { error: "Named link not found on this run" },
      { status: 404 },
    );
  }
  const link = updated.shareLinks?.find((l) => l.token === targetToken);
  return NextResponse.json({
    ok: true,
    id,
    scope: "named",
    token: targetToken,
    label: link?.label,
    revoked: link?.revoked === true,
    revokedAt: link?.revokedAt ?? null,
  });
}
