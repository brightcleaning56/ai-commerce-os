import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { cadenceTemplatesStore } from "@/lib/cadenceTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET    /api/cadences/templates/[id] — fetch one template
 * PATCH  /api/cadences/templates/[id] — rename / edit description of a
 *                                       CUSTOM template (slice 71).
 *                                       Seeds reject as immutable.
 * DELETE /api/cadences/templates/[id] — remove a custom template
 *                                       (seed templates can't be removed)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "outreach:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  const template = await cadenceTemplatesStore.get(id);
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ template });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "outreach:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;

  let body: {
    name?: string;
    description?: string;
    cadenceName?: string;
    cadenceDescription?: string;
    pinned?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Reject empty patches early -- saves a disk write and gives the
  // operator a clear "you didn't change anything" message instead of
  // a silent no-op.
  if (
    body.name === undefined &&
    body.description === undefined &&
    body.cadenceName === undefined &&
    body.cadenceDescription === undefined &&
    body.pinned === undefined
  ) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    // Slice 85: pin state lives in a separate store so it can apply
    // to seeds + customs alike. The metadata fields (name/description/
    // etc.) only apply to customs. Handle pin first; the metadata
    // update below is only relevant for customs and silently rejected
    // for seeds via cadenceTemplatesStore.update().
    if (typeof body.pinned === "boolean") {
      await cadenceTemplatesStore.setPinned(id, body.pinned);
    }
    const hasMetaUpdates =
      body.name !== undefined ||
      body.description !== undefined ||
      body.cadenceName !== undefined ||
      body.cadenceDescription !== undefined;
    if (hasMetaUpdates) {
      const updated = await cadenceTemplatesStore.update(id, body);
      if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true, template: updated });
    }
    // Pin-only update -- re-fetch so the response reflects the new
    // pinned flag.
    const refreshed = await cadenceTemplatesStore.get(id);
    if (!refreshed) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, template: refreshed });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "outreach:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  try {
    const removed = await cadenceTemplatesStore.remove(id);
    if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Remove failed" },
      { status: 400 },
    );
  }
}
