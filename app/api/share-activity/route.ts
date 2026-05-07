import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Activity = {
  ts: string;
  pipelineId: string;
  pipelineStartedAt: string;
  linkLabel: string;
  linkToken?: string;
  scope: "full" | "recipient";
  ip?: string;
  userAgent?: string;
  referer?: string;
  // Best-effort: which-numbered view this was for the same link
  // (1 = first open, 2 = re-open, etc.) — useful for "Sarah re-opened the deck"
  viewIndex: number;
};

/**
 * Sales activity feed — every share-link view across every pipeline run,
 * sorted newest-first. Powers /share-activity.
 *
 * Query params:
 *  - limit: max entries to return (default 100, max 500)
 *  - sinceMs: only include views with ts > sinceMs (Unix milliseconds), for live polling
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? "100")));
  const sinceMs = Number(url.searchParams.get("sinceMs") ?? "0");

  const runs = await store.getPipelineRuns();
  const activities: Activity[] = [];

  for (const run of runs) {
    const log = run.accessLog ?? [];
    if (log.length === 0) continue;

    // Pre-compute view-index per linkToken (oldest = 1). The accessLog is stored
    // newest-first, so the LAST entry for a given token is its 1st view.
    const indexByLink = new Map<string, number>();
    const counters = new Map<string, number>();
    for (const e of [...log].reverse()) {
      const key = e.linkToken ?? "__default__";
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      // Use a synthetic key including ts so we can recover the index later
      indexByLink.set(`${key}:${e.ts}`, next);
    }

    for (const e of log) {
      if (sinceMs > 0 && new Date(e.ts).getTime() <= sinceMs) continue;
      const key = (e.linkToken ?? "__default__") + ":" + e.ts;
      const viewIndex = indexByLink.get(key) ?? 1;
      // Recover the link's scope from shareLinks[]; default link is always "full"
      let scope: "full" | "recipient" = "full";
      if (e.linkToken) {
        const link = run.shareLinks?.find((l) => l.token === e.linkToken);
        scope = link?.scope ?? "recipient";
      }
      activities.push({
        ts: e.ts,
        pipelineId: run.id,
        pipelineStartedAt: run.startedAt,
        linkLabel: e.linkLabel ?? "Default link",
        linkToken: e.linkToken,
        scope,
        ip: e.ip,
        userAgent: e.userAgent,
        referer: e.referer,
        viewIndex,
      });
    }
  }

  activities.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  const trimmed = activities.slice(0, limit);

  // Top-line stats
  const totalViews = activities.length;
  const uniqueRecipients = new Set(activities.map((a) => a.linkLabel)).size;
  const last24h = activities.filter(
    (a) => Date.now() - new Date(a.ts).getTime() < 24 * 3600 * 1000,
  ).length;
  const reEngagements = activities.filter((a) => a.viewIndex >= 2).length;

  return NextResponse.json({
    activities: trimmed,
    totals: {
      totalViews,
      uniqueRecipients,
      last24h,
      reEngagements,
      pipelineRuns: runs.length,
    },
  });
}
