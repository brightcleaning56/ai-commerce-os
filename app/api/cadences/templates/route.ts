import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { cadenceTemplatesStore, type TemplateStep } from "@/lib/cadenceTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/cadences/templates — list seed + custom templates merged.
 * POST /api/cadences/templates — operator creates a custom template.
 *
 * Capability:
 *   GET  -> outreach:read
 *   POST -> outreach:write
 *
 * POST body:
 *   { name, description, cadenceName, cadenceDescription, steps: [...] }
 *
 * Steps shape mirrors CadenceStep (channel/delayHours/subject/etc.)
 * but uses numeric (not string) values since this is the API layer.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "outreach:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const templates = await cadenceTemplatesStore.list();
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "outreach:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: {
    name?: string;
    description?: string;
    cadenceName?: string;
    cadenceDescription?: string;
    steps?: TemplateStep[];
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (!Array.isArray(body.steps) || body.steps.length === 0) {
    return NextResponse.json({ error: "steps required (non-empty array)" }, { status: 400 });
  }

  try {
    const created = await cadenceTemplatesStore.create({
      name: body.name,
      description: body.description ?? "",
      cadenceName: body.cadenceName ?? body.name,
      cadenceDescription: body.cadenceDescription ?? "",
      steps: body.steps,
      createdBy:
        "user" in auth && auth.user?.email ? auth.user.email : undefined,
    });
    return NextResponse.json({ ok: true, template: created }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Create failed" },
      { status: 400 },
    );
  }
}
