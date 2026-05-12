import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/apiAuth";
import { deriveInsights } from "@/lib/outreachInsights";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/insights — outreach insights via API key.
 *
 * Mirrors the data returned by /api/outreach/insights (which is admin-
 * cookie-gated for the in-app dashboard) but authenticates by Bearer
 * API key with the read:insights scope. Lets partners pull the same
 * "what's working" leaderboards into their own dashboards.
 *
 * Required scope: read:insights
 */
export async function GET(req: Request) {
  const auth = await requireApiKey(req, "read:insights");
  if (!auth.ok) return auth.response;

  const drafts = await store.getDrafts();
  const insights = deriveInsights(drafts);
  return NextResponse.json({
    ok: true,
    environment: auth.key.environment,
    insights,
  });
}
