import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { getQueueSummary } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/queue/summary — counts only.
 *
 * Used by the sidebar badge + dashboard tile so they don't have to
 * fetch the full item list just to render "12 unread inbound."
 *
 * Same capability gate as /api/queue (leads:read) — if you can see the
 * full queue, you can see its counts.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "leads:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  try {
    const summary = await getQueueSummary();
    return NextResponse.json({ summary, generatedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Queue summary failed" },
      { status: 500 },
    );
  }
}
