import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/outreach-jobs/[id] â€” fetch full job detail.
 * Returns the complete businessIds + outcomes arrays (the list
 * endpoint strips these for performance).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "outreach:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const job = await store.getOutreachJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ job });
}

/**
 * DELETE /api/admin/outreach-jobs/[id] â€” cancel a pending or running
 * job. Already-drafted outcomes stay (operator can't un-draft); the
 * cron stops touching this job after the next tick.
 *
 * Completed/cancelled/failed jobs return 200 noop:true.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "outreach:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const existing = await store.getOutreachJob(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "pending" && existing.status !== "running") {
    return NextResponse.json({ ok: true, noop: true, job: existing });
  }

  const updated = await store.updateOutreachJob(id, {
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, job: updated });
}
