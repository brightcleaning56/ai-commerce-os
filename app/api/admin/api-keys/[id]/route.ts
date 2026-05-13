import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/api-keys/[id] â€” revoke a key.
 *
 * Soft-revoke (status flips to "Revoked", revokedAt stamped). The hash
 * stays in the file so subsequent auth attempts can be distinguished
 * from "unknown key" â€” useful for incident response if a leaked key
 * is being abused. Hard-purge after a grace period is a future cron.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const existing = await store.getApiKey(id);
  if (!existing) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }
  if (existing.status === "Revoked") {
    const { hashedSecret: _h, ...rest } = existing;
    return NextResponse.json({ ok: true, noop: true, key: { ...rest, used24h: (rest.usageWindow ?? []).length } });
  }

  const updated = await store.updateApiKey(id, {
    status: "Revoked",
    revokedAt: new Date().toISOString(),
  });
  const { hashedSecret: _h, ...rest } = updated ?? existing;
  return NextResponse.json({
    ok: true,
    key: { ...rest, used24h: (rest.usageWindow ?? []).length },
  });
}
