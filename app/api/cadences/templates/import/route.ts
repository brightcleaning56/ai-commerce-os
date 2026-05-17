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

const SINGLE_FORMAT = "avyn-cadence-template/v1";
const BUNDLE_FORMAT = "avyn-cadence-templates-bundle/v1";
const SUPPORTED_FORMATS = [SINGLE_FORMAT, BUNDLE_FORMAT];

type TemplatePayload = {
  name?: string;
  description?: string;
  cadenceName?: string;
  cadenceDescription?: string;
  steps?: TemplateStep[];
};

/**
 * Validates a single template payload + returns a normalized error
 * string for the operator. The `prefix` is used in error messages to
 * disambiguate which template in a bundle failed (e.g. "Template 3:
 * Step 2: invalid channel").
 */
function validateTemplate(t: TemplatePayload | undefined, prefix = ""): string | null {
  if (!t || !t.name?.trim()) return `${prefix}template.name required`;
  if (!Array.isArray(t.steps) || t.steps.length === 0) {
    return `${prefix}template.steps required (non-empty array)`;
  }
  const validChannels = ["call", "email", "sms"];
  for (let i = 0; i < t.steps.length; i++) {
    const s = t.steps[i];
    if (!validChannels.includes(s.channel)) {
      return `${prefix}Step ${i}: invalid channel "${s.channel}"`;
    }
    if (typeof s.delayHours !== "number" || s.delayHours < 0) {
      return `${prefix}Step ${i}: delayHours must be a non-negative number`;
    }
    if (s.branches) {
      for (let bi = 0; bi < s.branches.length; bi++) {
        const b = s.branches[bi];
        if (typeof b.gotoIndex !== "number" || b.gotoIndex < -1 || b.gotoIndex >= t.steps.length) {
          return `${prefix}Step ${i} branch ${bi}: gotoIndex must be -1 or 0..${t.steps.length - 1}`;
        }
      }
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "outreach:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const createdBy =
    "user" in auth && auth.user?.email ? auth.user.email : undefined;

  let body: {
    format?: string;
    template?: TemplatePayload;
    templates?: TemplatePayload[];
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

  // ── Bundle path (slice 70) ────────────────────────────────────────
  // Validate ALL templates upfront so a typo in template #7 doesn't
  // silently land #1..#6 with no way to retry cleanly. The store
  // create() is not transactional; partial failure mid-bundle is
  // possible but rare (only on store-write error). The response shape
  // ({ ok, created: [...] }) makes the success count obvious.
  if (body.format === BUNDLE_FORMAT) {
    const templates = body.templates;
    if (!Array.isArray(templates) || templates.length === 0) {
      return NextResponse.json(
        { error: "templates required (non-empty array)" },
        { status: 400 },
      );
    }
    for (let i = 0; i < templates.length; i++) {
      const err = validateTemplate(templates[i], `Template ${i}: `);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }
    const created = [];
    for (const t of templates) {
      try {
        created.push(
          await cadenceTemplatesStore.create({
            name: t.name!,
            description: t.description ?? "",
            cadenceName: t.cadenceName ?? t.name!,
            cadenceDescription: t.cadenceDescription ?? "",
            steps: t.steps!,
            createdBy,
          }),
        );
      } catch (e) {
        return NextResponse.json(
          {
            error: `Partial import: created ${created.length}/${templates.length} before "${t.name}" failed -- ${e instanceof Error ? e.message : "create error"}`,
            partial: true,
            created,
          },
          { status: 500 },
        );
      }
    }
    return NextResponse.json(
      { ok: true, count: created.length, templates: created },
      { status: 201 },
    );
  }

  // ── Single-template path (slice 61) ───────────────────────────────
  const t = body.template;
  const err = validateTemplate(t);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  try {
    const created = await cadenceTemplatesStore.create({
      name: t!.name!,
      description: t!.description ?? "",
      cadenceName: t!.cadenceName ?? t!.name!,
      cadenceDescription: t!.cadenceDescription ?? "",
      steps: t!.steps!,
      createdBy,
    });
    return NextResponse.json({ ok: true, template: created }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import failed" },
      { status: 400 },
    );
  }
}
