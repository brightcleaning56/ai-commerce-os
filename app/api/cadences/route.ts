import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { cadencesStore, type CadenceStep } from "@/lib/cadences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cadences  — list all cadence definitions.
 * POST /api/cadences — create a new cadence.
 *
 * Capability: outreach:write to create, outreach:read to list. Same gate
 * as the existing outreach automations surface.
 *
 * Step shape (POST body):
 *   {
 *     name: string,
 *     description?: string,
 *     active?: boolean,           // defaults true
 *     steps: [
 *       {
 *         channel: "call" | "email" | "sms",
 *         delayHours: number,     // hours from previous step (0 for immediate)
 *         label?: string,
 *         subject?: string,       // email
 *         bodyTemplate?: string,  // {{name}} {{company}} merge tags
 *         branches?: [{ ifOutcome: string, gotoIndex: number }]
 *       },
 *       ...
 *     ]
 *   }
 *
 * Slice 3 has no admin UI — operator creates cadences via curl/POST or
 * via the buyer-detail enroll button (slice 3.5). The API returns the
 * created cadence so the operator can copy the id for enroll calls.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "outreach:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const cadences = await cadencesStore.list();
  return NextResponse.json({ cadences });
}

export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "outreach:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: {
    name?: string;
    description?: string;
    active?: boolean;
    steps?: CadenceStep[];
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!Array.isArray(body.steps) || body.steps.length === 0) {
    return NextResponse.json({ error: "steps must be a non-empty array" }, { status: 400 });
  }

  try {
    const created = await cadencesStore.create({
      name: body.name,
      description: body.description,
      active: body.active,
      steps: body.steps,
      createdBy: "email" in auth ? (auth as { email?: string }).email : undefined,
    });
    return NextResponse.json({ ok: true, cadence: created }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create cadence" },
      { status: 400 },
    );
  }
}
