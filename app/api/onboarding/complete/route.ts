import { NextRequest, NextResponse } from "next/server";
import { FLOWS, PERSONA_LANDING, PERSONA_TO_ROLE } from "@/lib/onboarding";
import { onboardingSessions } from "@/lib/onboardingState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding/complete — finalize the session.
 *
 * Slice 1 ships the validation + status flip + landing-page hint. Slice
 * 8 wires the actual mint-token + persist-to-the-right-store side
 * (admin -> bootstrap workspace, team -> reuse invite acceptance,
 * buyer/supplier/distributor -> create the participant record).
 *
 * Returns: { ok, landingHref, session, missing? }
 *   - missing[] populated if any step's required questions still fail
 *     validation (gates client from "Complete" until they're filled in)
 */

function readSessionId(req: NextRequest): string | null {
  return req.cookies.get("avyn_onboarding")?.value ?? null;
}

export async function POST(req: NextRequest) {
  const id = readSessionId(req);
  if (!id) return NextResponse.json({ error: "No onboarding session" }, { status: 404 });
  const session = await onboardingSessions.get(id);
  if (!session) return NextResponse.json({ error: "Session expired or not found" }, { status: 404 });
  if (!session.persona) {
    return NextResponse.json({ error: "Persona not chosen yet" }, { status: 400 });
  }
  if (session.status === "completed") {
    return NextResponse.json({
      ok: true,
      alreadyCompleted: true,
      landingHref: PERSONA_LANDING[session.persona],
      session,
    });
  }

  // Validate every step's required answers are present. Skipped (showIf
  // false) steps are excluded.
  const flow = FLOWS[session.persona];
  const missing: string[] = [];
  for (const step of flow.steps) {
    const answers = session.answers[step.id] ?? {};
    for (const q of step.questions) {
      if (!q.required) continue;
      const v = answers[q.id];
      if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) {
        missing.push(`${step.id}.${q.id}`);
      }
    }
  }
  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "Required questions still empty",
        missing,
      },
      { status: 422 },
    );
  }

  // Slice 1: just flip status. Slice 8 wires:
  //   admin -> bootstrap workspace + mint owner token + cookie
  //   team -> reuse the invite-accept path (already mints user token)
  //   buyer/supplier/distributor -> create participant record + scoped portal token
  // For now we mark completed so the engine UX can land the user on
  // the right page and the operator can spot completed sessions.
  const role = PERSONA_TO_ROLE[session.persona];
  const updated = await onboardingSessions.complete(id, { role });

  return NextResponse.json({
    ok: true,
    landingHref: PERSONA_LANDING[session.persona],
    role,
    session: updated,
  });
}
