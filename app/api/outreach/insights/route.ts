import { NextResponse } from "next/server";
import { deriveInsights } from "@/lib/outreachInsights";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Real outreach insights derived from sent drafts. Pairs with
 * /api/outreach/campaigns and /api/outreach/stats — together they replace
 * every SAMPLE-shaped surface on /outreach with numbers grounded in the
 * pipeline's actual activity.
 */
export async function GET() {
  const drafts = await store.getDrafts();
  const insights = deriveInsights(drafts);
  return NextResponse.json({ insights });
}
