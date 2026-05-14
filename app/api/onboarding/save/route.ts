import { NextRequest, NextResponse } from "next/server";
import {
  FLOWS,
  isPersona,
  shouldShowStep,
  validateStep,
  type Persona,
} from "@/lib/onboarding";
import { onboardingSessions } from "@/lib/onboardingState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/onboarding/save — read the current session (resume-later).
 * POST /api/onboarding/save — auto-save partial answers per step.
 *
 * Cookie-driven. The session id comes from `avyn_onboarding`. Anonymous
 * callers (no cookie) get 404 from GET; POST without a cookie creates
 * a fresh session before writing.
 *
 * POST body: { persona?: Persona, stepId: string, answers: object,
 *              validate?: boolean }
 *   - stepId+answers required
 *   - persona optional (sets if currently null on the session)
 *   - validate=true runs the engine validators server-side; returns
 *     { errors } when any required field fails (does not save)
 */

function readSessionId(req: NextRequest): string | null {
  return req.cookies.get("avyn_onboarding")?.value ?? null;
}

export async function GET(req: NextRequest) {
  const id = readSessionId(req);
  if (!id) return NextResponse.json({ error: "No onboarding session" }, { status: 404 });
  const session = await onboardingSessions.get(id);
  if (!session) return NextResponse.json({ error: "Session expired or not found" }, { status: 404 });
  return NextResponse.json({ session });
}

export async function POST(req: NextRequest) {
  let body: {
    persona?: string;
    stepId?: string;
    answers?: Record<string, unknown>;
    validate?: boolean;
    email?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.stepId || typeof body.stepId !== "string") {
    return NextResponse.json({ error: "stepId required" }, { status: 400 });
  }
  if (!body.answers || typeof body.answers !== "object") {
    return NextResponse.json({ error: "answers required" }, { status: 400 });
  }

  const id = readSessionId(req);
  let session = id ? await onboardingSessions.get(id) : null;

  // Auto-mint a session if none exists yet (chooser POST may not have
  // hit /start first, e.g. if the cookie was cleared).
  if (!session) {
    session = await onboardingSessions.create({
      persona: isPersona(body.persona) ? body.persona : null,
    });
  } else if (isPersona(body.persona) && !session.persona) {
    // Lock in persona on first save if not already set.
    session = (await onboardingSessions.patch(session.id, { persona: body.persona as Persona })) ?? session;
  }

  // Optional validation pass -- returns errors WITHOUT saving so the
  // client can render inline messages without polluting state.
  if (body.validate && session.persona) {
    const flow = FLOWS[session.persona];
    const step = flow.steps.find((s) => s.id === body.stepId);
    if (step) {
      // Build merged answers as if this save had landed
      const merged = { ...session.answers, [body.stepId]: { ...(session.answers[body.stepId] ?? {}), ...body.answers } };
      if (!shouldShowStep(step, merged)) {
        return NextResponse.json({ ok: true, skipped: true, reason: "step gated by showIf" });
      }
      const stepAnswers = merged[body.stepId];
      const errors = validateStep(step, stepAnswers);
      if (errors) {
        return NextResponse.json({ ok: false, errors }, { status: 422 });
      }
    }
  }

  // Capture email at the session top-level if it was in this save (so
  // slice 7 magic-link doesn't have to dig through the answers map).
  let topPatch: Record<string, unknown> | null = null;
  if (typeof body.email === "string" && body.email.includes("@")) {
    topPatch = { email: body.email.toLowerCase().trim().slice(0, 200) };
  }
  for (const v of Object.values(body.answers)) {
    if (typeof v === "string" && v.includes("@") && v.length < 200) {
      // Heuristic: if any answer looks like an email and we don't have
      // one captured yet, save it for verification.
      if (!session.email && !topPatch?.email) {
        topPatch = { ...(topPatch ?? {}), email: v.toLowerCase().trim() };
        break;
      }
    }
  }
  if (topPatch) {
    session = (await onboardingSessions.patch(session.id, topPatch)) ?? session;
  }

  const updated = await onboardingSessions.saveAnswers(session.id, body.stepId, body.answers);

  const res = NextResponse.json({ ok: true, session: updated });
  // Refresh cookie TTL on every save -- keeps the resume window rolling
  // while the user is actively in the flow.
  res.cookies.set({
    name: "avyn_onboarding",
    value: session.id,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
