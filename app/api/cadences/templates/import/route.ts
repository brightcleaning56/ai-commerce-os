import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { cadenceTemplatesStore, type TemplateStep } from "@/lib/cadenceTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cadences/templates/import — slice 61 import path.
 *
 * Accepts the same envelope the export endpoint produces:
 *   { format: "avyn-cadence-template/v1",
 *     exportedAt: ISO,
 *     template: { name, description, cadenceName, cadenceDescription, steps } }
 *
 * Validates the format string + step shape. Creates a NEW custom
 * template (never overwrites). The operator gets a fresh id so
 * imports + originals can coexist.
 *
 * Capability: outreach:write -- same gate as POST /api/cadences/templates.
 */

const SUPPORTED_FORMATS = ["avyn-cadence-template/v1"];

export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "outreach:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: {
    format?: string;
    template?: {
      name?: string;
      description?: string;
      cadenceName?: string;
      cadenceDescription?: string;
      steps?: TemplateStep[];
    };
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.format || !SUPPORTED_FORMATS.includes(body.format)) {
    return NextResponse.json(
      {
        error: `Unsupported format "${body.format ?? "(missing)"}". Supported: ${SUPPORTED_FORMATS.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  const t = body.template;
  if (!t || !t.name?.trim()) {
    return NextResponse.json({ error: "template.name required" }, { status: 400 });
  }
  if (!Array.isArray(t.steps) || t.steps.length === 0) {
    return NextResponse.json({ error: "template.steps required (non-empty array)" }, { status: 400 });
  }

  // Validate step shape -- channel must be a known value, delayHours
  // must be non-negative number, branches gotoIndex must be in range.
  const validChannels = ["call", "email", "sms"];
  for (let i = 0; i < t.steps.length; i++) {
    const s = t.steps[i];
    if (!validChannels.includes(s.channel)) {
      return NextResponse.json(
        { error: `Step ${i}: invalid channel "${s.channel}"` },
        { status: 400 },
      );
    }
    if (typeof s.delayHours !== "number" || s.delayHours < 0) {
      return NextResponse.json(
        { error: `Step ${i}: delayHours must be a non-negative number` },
        { status: 400 },
      );
    }
    if (s.branches) {
      for (let bi = 0; bi < s.branches.length; bi++) {
        const b = s.branches[bi];
        if (typeof b.gotoIndex !== "number" || b.gotoIndex < -1 || b.gotoIndex >= t.steps.length) {
          return NextResponse.json(
            {
              error: `Step ${i} branch ${bi}: gotoIndex must be -1 or 0..${t.steps.length - 1}`,
            },
            { status: 400 },
          );
        }
      }
    }
  }

  try {
    const created = await cadenceTemplatesStore.create({
      name: t.name,
      description: t.description ?? "",
      cadenceName: t.cadenceName ?? t.name,
      cadenceDescription: t.cadenceDescription ?? "",
      steps: t.steps,
      createdBy: "user" in auth && auth.user?.email ? auth.user.email : undefined,
    });
    return NextResponse.json({ ok: true, template: created }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import failed" },
      { status: 400 },
    );
  }
}
