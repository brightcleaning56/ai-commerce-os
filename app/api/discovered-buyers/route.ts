import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/discovered-buyers — list all discovered buyers.
 *
 * Read-time enrichment: backfills `phone` from the matching Lead when the
 * buyer record was created BEFORE leadToDiscoveredBuyer started carrying
 * phone through. Without this, every buyer promoted before that fix
 * silently has no phone, breaking click-to-call on /tasks and /buyers
 * even though the lead has the phone on file.
 *
 * The backfill is read-only -- the underlying DiscoveredBuyer record on
 * disk stays unchanged. A separate migration could persist this if we
 * wanted, but at the volume of buyers this site sees, on-the-fly is
 * fine and avoids needing to re-write the store.
 */
export async function GET() {
  const [buyers, leads] = await Promise.all([
    store.getDiscoveredBuyers(),
    store.getLeads(),
  ]);

  // Build a buyerId → lead.phone map by walking promotedToBuyerId
  const phoneByBuyerId = new Map<string, string>();
  for (const l of leads) {
    if (l.promotedToBuyerId && l.phone) {
      phoneByBuyerId.set(l.promotedToBuyerId, l.phone);
    }
  }

  const enriched = buyers.map((b) => {
    if (b.phone) return b; // already has phone — don't override
    const fromLead = phoneByBuyerId.get(b.id);
    return fromLead ? { ...b, phone: fromLead } : b;
  });

  return NextResponse.json({ buyers: enriched });
}
