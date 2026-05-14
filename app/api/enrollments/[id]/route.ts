import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import {
  cadenceQueueItemsStore,
  enrollmentsStore,
  type EnrollmentStatus,
} from "@/lib/cadences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET    /api/enrollments/[id] — fetch one enrollment.
 * PATCH  /api/enrollments/[id] — pause / resume / stop a running cadence.
 *   Body: { status: "active" | "paused" | "stopped" }
 *   - paused -> "stopped" cancels the schedule and clears pending queue items
 *   - stopped -> "active"  refuses (can't restart a stopped enrollment)
 *   - active <-> paused toggles
 * DELETE /api/enrollments/[id] — hard-remove + cleanup queue items.
 *
 * Capability: outreach:write for changes, outreach:read for GET.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "outreach:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  const enrollment = await enrollmentsStore.get(id);
  if (!enrollment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ enrollment });
}

const VALID_TRANSITIONS: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  active: ["paused", "stopped"],
  paused: ["active", "stopped"],
  // Terminal states — no transitions allowed. Re-enroll via POST instead.
  completed: [],
  stopped: [],
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "outreach:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;

  let body: { status?: EnrollmentStatus } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.status) {
    return NextResponse.json({ error: "status is required" }, { status: 400 });
  }
  const allowed: EnrollmentStatus[] = ["active", "paused", "stopped"];
  if (!allowed.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of ${allowed.join(", ")}` }, { status: 400 });
  }

  const current = await enrollmentsStore.get(id);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowedNext = VALID_TRANSITIONS[current.status];
  if (!allowedNext.includes(body.status)) {
    return NextResponse.json(
      { error: `Cannot transition from ${current.status} to ${body.status}` },
      { status: 409 },
    );
  }

  const patch: Parameters<typeof enrollmentsStore.patch>[1] = { status: body.status };
  if (body.status === "paused") patch.pausedAt = new Date().toISOString();
  if (body.status === "stopped") patch.stoppedAt = new Date().toISOString();

  // Stop also clears pending queue items so they don't sit on /queue
  // after the operator pulled the plug. Done items stay (audit trail).
  if (body.status === "stopped") {
    await cadenceQueueItemsStore.removeByEnrollment(id).catch(() => 0);
  }

  const updated = await enrollmentsStore.patch(id, patch);
  return NextResponse.json({ ok: true, enrollment: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "outreach:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  const removedItems = await cadenceQueueItemsStore.removeByEnrollment(id).catch(() => 0);
  const removed = await enrollmentsStore.remove(id);
  if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, removedItems });
}
