import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { cadenceTemplatesStore } from "@/lib/cadenceTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cadences/templates/[id]/export — slice 61.
 *
 * Returns the template as a portable JSON file with a download
 * filename header. Operators export to share a template across
 * workspaces / send to a teammate / version-control. The export
 * is the SAME shape the import endpoint accepts, plus a small
 * envelope { format, exportedAt, template } so future format
 * versions can evolve without breaking imports.
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

  const envelope = {
    format: "avyn-cadence-template/v1",
    exportedAt: new Date().toISOString(),
    template: {
      // Strip ids + timestamps -- these get regenerated at import time.
      // The ONLY content that travels is the recipe itself.
      name: template.name,
      description: template.description,
      cadenceName: template.cadenceName,
      cadenceDescription: template.cadenceDescription,
      steps: template.steps,
    },
  };

  const filename = `${template.id}.cadence-template.json`;
  return new NextResponse(JSON.stringify(envelope, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
