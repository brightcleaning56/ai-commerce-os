import { NextResponse } from "next/server";
import { deriveCampaigns } from "@/lib/outreachCampaigns";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Real campaigns derived from outreach drafts + transactions. No SAMPLE
 * rows — operator sees only what their pipeline has actually generated.
 *
 * Replaces the static lib/outreach.ts CAMPAIGNS array on /outreach.
 */
export async function GET() {
  const [drafts, transactions] = await Promise.all([
    store.getDrafts(),
    store.getTransactions(),
  ]);
  const campaigns = deriveCampaigns(drafts, transactions);
  return NextResponse.json({ campaigns });
}
