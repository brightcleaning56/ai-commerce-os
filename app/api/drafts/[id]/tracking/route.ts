import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-draft share-link tracking.
 *
 * Joins draft → parent pipeline run → access log entries attributed to the
 * draft's shareLinkToken. Used by the /outreach review UI to show inline
 * "3 views, last 2 minutes ago" hints next to each sent draft.
 *
 * Auth model: open in the demo (consistent with /api/drafts being open).
 * Production would gate by workspace.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const draft = await store.getDraft(params.id);
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  // No tracking yet: draft hasn't been sent OR was created pre-slice-28.
  if (!draft.shareLinkToken || !draft.pipelineId) {
    return NextResponse.json({
      tracked: false,
      reason: !draft.pipelineId
        ? "Draft pre-dates tracked-link feature (no pipelineId)"
        : "Draft has not been sent yet",
    });
  }

  const run = await store.getPipelineRun(draft.pipelineId);
  if (!run) {
    return NextResponse.json({
      tracked: false,
      reason: "Parent pipeline run no longer exists (snapshot may have rotated)",
    });
  }

  const link = run.shareLinks?.find((l) => l.token === draft.shareLinkToken);
  if (!link) {
    return NextResponse.json({
      tracked: false,
      reason: "Share link not found on parent run",
    });
  }

  const views = (run.accessLog ?? []).filter((e) => e.linkToken === draft.shareLinkToken);
  return NextResponse.json({
    tracked: true,
    pipelineId: run.id,
    token: link.token,
    label: link.label,
    scope: link.scope ?? "recipient",
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    revoked: link.revoked === true,
    revokedAt: link.revokedAt ?? null,
    accessCount: views.length,
    lastViewedAt: views[0]?.ts ?? null,
    // First 5 views for inline display; full list available via /api/share/[id]/access-log
    recentViews: views.slice(0, 5).map((v) => ({
      ts: v.ts,
      ip: v.ip,
      userAgent: v.userAgent,
      referer: v.referer,
    })),
    shareUrl: draft.shareLinkUrl ?? null,
  });
}
