import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { cadenceTemplatesStore } from "@/lib/cadenceTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET    /api/cadences/templates/[id] — fetch one template
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
