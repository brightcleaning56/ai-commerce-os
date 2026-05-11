import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { leadToDiscoveredBuyer } from "@/lib/leadPromotion";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/leads/[id]/promote — admin-only.
 *
 * Mints a DiscoveredBuyer record from the Lead and prepends it to the
 * `discovered-buyers` store, then marks the Lead with `promotedToBuyerId`
 * + `promotedAt` so the UI can hide the Promote button afterwards. Status
 * also moves to "qualified" if it was still "new" / "contacted" — the
 * operator has explicitly said "yes, this is a real buyer worth working".
 *
 * Idempotent: re-promoting the same lead returns the existing buyer record
 * (the buyer id is derived from the lead id) and does NOT create a duplicate.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const { id } = await params;
  const lead = await store.getLead(id);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // If already promoted, return the existing record — don't create a duplicate.
  if (lead.promotedToBuyerId) {
    const buyers = await store.getDiscoveredBuyers();
    const existing = buyers.find((b) => b.id === lead.promotedToBuyerId);
    return NextResponse.json({
      lead,
      buyer: existing ?? null,
      alreadyPromoted: true,
    });
  }

  const buyer = leadToDiscoveredBuyer(lead);
  await store.saveDiscoveredBuyers([buyer]);

  // Bump status to "qualified" if it was still in an early state.
  const nextStatus =
    lead.status === "new" || lead.status === "contacted" ? "qualified" : lead.status;

  const updated = await store.updateLead(id, {
    promotedToBuyerId: buyer.id,
    promotedAt: new Date().toISOString(),
    promotedBy: "operator",
    status: nextStatus,
  });

  return NextResponse.json({
    lead: updated,
    buyer,
    alreadyPromoted: false,
  });
}
