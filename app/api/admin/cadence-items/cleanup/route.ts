import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { cadenceQueueItemsStore } from "@/lib/cadences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/cadence-items/cleanup — drop done / skipped /
 * failed items older than N days. Pending items are NEVER touched.
 *
 * Body:
 *   { statuses: Array<"done"|"skipped"|"failed">,
 *     olderThanDays: number (>=0, default 30) }
 *
 * Capability: outreach:write -- this is a destructive admin op.
 *
 * Use case: a workspace running 50 cadences accumulates thousands of
 * done/skipped items in cadence-queue-items.json over a quarter.
 * Operator hits this once a quarter to reclaim store size + UI speed.
 */
export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "outreach:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: { statuses?: unknown; olderThanDays?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validStatuses: Array<"done" | "skipped" | "failed"> = ["done", "skipped", "failed"];
  const statuses = Array.isArray(body.statuses)
    ? (body.statuses as unknown[]).filter((s): s is "done" | "skipped" | "failed" =>
        typeof s === "string" && validStatuses.includes(s as "done" | "skipped" | "failed"),
      )
    : [];
  if (statuses.length === 0) {
    return NextResponse.json(
      { error: "statuses[] required (subset of done|skipped|failed)" },
      { status: 400 },
    );
  }

  const days = typeof body.olderThanDays === "number" && body.olderThanDays >= 0
    ? Math.min(3650, body.olderThanDays)
    : 30;

  const removed = await cadenceQueueItemsStore.cleanup({
    statuses,
    olderThanDays: days,
  });

  return NextResponse.json({
    ok: true,
    removed,
    statuses,
    olderThanDays: days,
  });
}
