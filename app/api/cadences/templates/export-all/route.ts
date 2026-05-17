import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { cadenceTemplatesStore } from "@/lib/cadenceTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cadences/templates/export-all — slice 70.
 *
 * Returns a portable bundle of every CUSTOM template in the store
 * (seeds are excluded -- they're identical on every fresh install,
 * so restoring them would duplicate). Same envelope semantics as
 * the single-template export from slice 61, just plural:
 *
 *   { format: "avyn-cadence-templates-bundle/v1",
 *     exportedAt: ISO,
 *     templates: [ <slice61-style template>, ... ] }
 *
 * Use case: operator built up a curated set of customs and wants
 * a single-file backup to keep offline or migrate to another
 * workspace. The matching import path lives in /import (extended
 * to recognize this bundle format alongside the slice 61 single).
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "outreach:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const all = await cadenceTemplatesStore.list();
  const customs = all.filter((t) => t.source === "custom");

  const envelope = {
    format: "avyn-cadence-templates-bundle/v1",
    exportedAt: new Date().toISOString(),
    count: customs.length,
    templates: customs.map((t) => ({
      // Strip ids + timestamps -- each template gets a fresh id at
      // import time so re-importing your own backup doesn't try to
      // overwrite anything.
      name: t.name,
      description: t.description,
      cadenceName: t.cadenceName,
      cadenceDescription: t.cadenceDescription,
      steps: t.steps,
    })),
  };

  const date = new Date().toISOString().slice(0, 10);
  const filename = `avyn-cadence-templates-${date}.json`;
  return new NextResponse(JSON.stringify(envelope, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
