import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { cadenceTemplatesStore } from "@/lib/cadenceTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cadences/templates/[id]/mark-used — slice 87.
 *
 * Stamps lastUsedAt = now for the template. Called fire-and-forget
 * from the /cadences gallery applyTemplate flow so frequently-used
 * templates surface their recency in the UI.
 *
 * Capability: outreach:write (creating a cadence requires it; the
 * mark-used action is downstream of applyTemplate which only fires
 * inside the new-cadence form).
 *
 * Returns 404 only when the template id doesn't exist -- otherwise
 * always ok (even rapid re-applies just overwrite the timestamp).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "outreach:write");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const { id } = await params;
  // Validate existence before write so we don't pollute the last-used
  // map with bogus ids. get() goes through list() which is cheap.
  const exists = await cadenceTemplatesStore.get(id);
  if (!exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await cadenceTemplatesStore.markUsed(id);
  return NextResponse.json({ ok: true, id, lastUsedAt: new Date().toISOString() });
}
