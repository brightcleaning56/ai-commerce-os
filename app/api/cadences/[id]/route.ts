import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { cadencesStore, cadenceQueueItemsStore, enrollmentsStore } from "@/lib/cadences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET     /api/cadences/[id] — fetch one cadence + its enrollment count
 * PATCH   /api/cadences/[id] — toggle active flag / rename / update steps
 * DELETE  /api/cadences/[id] — remove cadence (does NOT auto-stop active enrollments)
 *
 * Note on DELETE: existing active enrollments will continue running on
 * their current step indices but the runner will mark them "stopped"
 * the next time it can't find the cadence (lib/cadences.ts runCadenceTick).
 * That's a deliberately graceful failure mode — we don't want a delete
 * to silently lose buyer-facing state.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "outreach:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  const cadence = await cadencesStore.get(id);
  if (!cadence) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const enrollments = await enrollmentsStore.list({ cadenceId: id });
  return NextResponse.json({
    cadence,
    enrollmentCounts: {
      total: enrollments.length,
      active: enrollments.filter((e) => e.status === "active").length,
      paused: enrollments.filter((e) => e.status === "paused").length,
      completed: enrollments.filter((e) => e.status === "completed").length,
      stopped: enrollments.filter((e) => e.status === "stopped").length,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "outreach:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Parameters<typeof cadencesStore.patch>[1] = {};
  if (typeof body.name === "string") patch.name = body.name.trim().slice(0, 120);
  if (typeof body.description === "string") patch.description = body.description.trim().slice(0, 500);
  if (typeof body.active === "boolean") patch.active = body.active;
  if (Array.isArray(body.steps)) {
    patch.steps = body.steps as Parameters<typeof cadencesStore.patch>[1]["steps"];
  }

  const updated = await cadencesStore.patch(id, patch);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, cadence: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "outreach:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;

  // Best-effort cleanup of pending queue items so they don't dangle on
  // /queue after the cadence is gone. Active enrollments aren't auto-
  // stopped (see GET docstring) -- they get marked stopped when the
  // runner discovers the missing cadence on its next tick.
  const enrollments = await enrollmentsStore.list({ cadenceId: id });
  for (const e of enrollments) {
    await cadenceQueueItemsStore.removeByEnrollment(e.id).catch(() => 0);
  }

  const removed = await cadencesStore.remove(id);
  if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, removed: true, cleanedEnrollments: enrollments.length });
}
