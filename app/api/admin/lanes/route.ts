import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { store } from "@/lib/store";
import { supplierRegistry } from "@/lib/supplierRegistry";
import { computeCrossSupplierLanes } from "@/lib/crossSupplierLanes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/lanes — cross-supplier Layer 6 rollup.
 *
 * Returns the aggregated shipping-lane view across every supplier in
 * the registry: origin (state, country) → destination (state, country)
 * with supplierCount, transactionCount, totalUnits, totalRevenueCents,
 * recency, and a topSuppliers leaderboard per lane. Plus a coarser
 * region-level rollup ("asia → us-east", etc.).
 *
 * Optional query params:
 *   ?originCountry=US&destCountry=CN  filter both sides
 *
 * Capability: leads:read — same as the supplier registry.
 *
 * Pulls full registry + transactions per call. Bounded (~5k suppliers,
 * ~2k transactions) so this is trivially in-memory; if either grows
 * into the tens of thousands, swap to a pre-aggregated nightly rollup.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "leads:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const url = new URL(req.url);
  const originCountry = url.searchParams.get("originCountry")?.toUpperCase().slice(0, 2);
  const destCountry = url.searchParams.get("destCountry")?.toUpperCase().slice(0, 2);

  const [suppliers, transactions] = await Promise.all([
    supplierRegistry.list(),
    store.getTransactions(),
  ]);

  let rollup = computeCrossSupplierLanes(suppliers, transactions);

  // Apply optional country filters server-side so the client doesn't
  // have to load the full graph for narrow queries.
  if (originCountry || destCountry) {
    const lanes = rollup.lanes.filter((l) => {
      if (originCountry && l.origin.country !== originCountry) return false;
      if (destCountry && l.destination.country !== destCountry) return false;
      return true;
    });
    rollup = {
      ...rollup,
      lanes,
      // Region rollup stays as-is — operators usually want the full
      // regional picture even when they're drilling into one country.
    };
  }

  return NextResponse.json(rollup);
}
