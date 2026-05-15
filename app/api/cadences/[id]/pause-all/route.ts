import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { cadenceQueueItemsStore, enrollmentsStore } from "@/lib/cadences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cadences/[id]/pause-all — pause every active enrollment
 * in this cadence in one action.
 *
 * Body: { mode: "pause" | "resume" | "stop" } (default "pause")
 *   pause  -> active enrollments -> paused; pending queue items
 *             stay scheduled (resume picks up where they left off)
 *   resume -> paused enrollments -> active
 *   stop   -> active + paused enrollments -> stopped; pending queue
 *             items cleaned up so they don't sit on /queue
 *
 * Returns: { ok, summary: { affected, ... } }
 *
 * Capability: outreach:write -- same gate as enrollment management.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "outreach:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;

  let body: { mode?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Body optional -- default to pause
  }
  const mode = body.mode === "resume" || body.mode === "stop" ? body.mode : "pause";

  const all = await enrollmentsStore.list({ cadenceId: id });
  const targetStatus = mode === "resume" ? "paused" : "active";
  // For "resume" we look for paused; for pause/stop we look for active
  // (and also paused, in the case of stop -- want to clean those too).
  const candidates =
    mode === "resume"
      ? all.filter((e) => e.status === "paused")
      : mode === "stop"
        ? all.filter((e) => e.status === "active" || e.status === "paused")
        : all.filter((e) => e.status === "active");

  let affected = 0;
  let cleanedItems = 0;
  const now = new Date().toISOString();

  for (const enr of candidates) {
    if (mode === "pause") {
      await enrollmentsStore.patch(enr.id, { status: "paused", pausedAt: now });
    } else if (mode === "resume") {
      await enrollmentsStore.patch(enr.id, { status: "active", pausedAt: undefined });
    } else if (mode === "stop") {
      await enrollmentsStore.patch(enr.id, { status: "stopped", stoppedAt: now });
      const removed = await cadenceQueueItemsStore.removeByEnrollment(enr.id).catch(() => 0);
      cleanedItems += removed;
    }
    affected += 1;
  }

  return NextResponse.json({
    ok: true,
    mode,
    summary: {
      affected,
      cleanedItems,
      candidatesScanned: candidates.length,
    },
  });
}
