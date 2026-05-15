import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { cadenceQueueItemsStore } from "@/lib/cadences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/cadence-items — full audit listing of every cadence-
 * scheduled queue item, regardless of status. Used by the
 * /admin/cadence-items viewer.
 *
 * Query:
 *   ?status=pending|done|skipped|failed   filter
 *   ?cadenceId=<id>                       filter by source cadence
 *   ?requiresApproval=true|false          approval-only / non-approval
 *   ?withApprovalAudit=true               only items with approvedBy stamp
 *   ?limit=N                              cap (default 500, max 5000)
 *
 * Capability: outreach:read.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "outreach:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const cadenceId = sp.get("cadenceId");
  const requiresApproval = sp.get("requiresApproval");
  const withApprovalAudit = sp.get("withApprovalAudit");
  const limitRaw = parseInt(sp.get("limit") ?? "500", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5000) : 500;

  const all = await cadenceQueueItemsStore.list();
  let filtered = all;
  if (status) filtered = filtered.filter((i) => i.status === status);
  if (cadenceId) filtered = filtered.filter((i) => i.cadenceId === cadenceId);
  if (requiresApproval === "true") filtered = filtered.filter((i) => i.requiresApproval);
  if (requiresApproval === "false") filtered = filtered.filter((i) => !i.requiresApproval);
  if (withApprovalAudit === "true") filtered = filtered.filter((i) => i.approvedBy);

  filtered = filtered
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);

  // Aggregate counts BEFORE filtering for the headline tiles
  const summary = {
    total: all.length,
    byStatus: {
      pending: all.filter((i) => i.status === "pending").length,
      done: all.filter((i) => i.status === "done").length,
      skipped: all.filter((i) => i.status === "skipped").length,
      failed: all.filter((i) => i.status === "failed").length,
    },
    requiresApproval: all.filter((i) => i.requiresApproval).length,
    withApprovalAudit: all.filter((i) => i.approvedBy).length,
    retried: all.filter((i) => (i.retryCount ?? 0) > 0).length,
  };

  return NextResponse.json({ items: filtered, summary });
}
