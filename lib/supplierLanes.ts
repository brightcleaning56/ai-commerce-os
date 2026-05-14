/**
 * Layer 6 — Distribution Intelligence.
 *
 * Given a supplier (with origin city/state/country in the registry)
 * and their linked transactions (with buyer destination on each
 * transaction), compute aggregated shipping lanes:
 *
 *   origin (CA, US) → destination (TX, US)
 *     - 7 transactions
 *     - 12,400 units total
 *     - $98,200 supplier payout
 *     - last shipment: 12 days ago
 *
 * Lanes are grouped by origin (state, country) → destination (state,
 * country). City rolls up to state because:
 *   - state-level granularity matches how distribution is actually
 *     planned (regional warehouses, freight rates)
 *   - sparser city-level data wouldn't aggregate meaningfully
 *
 * Transactions without buyer destination (older records) get
 * surfaced as a "missing destination" count so the operator knows
 * how much of the picture is hidden.
 *
 * Pure function — takes a supplier + transactions, returns a
 * structured rollup. The HTTP route handler does the I/O.
 *
 * Node-only (imports lib/store types).
 */
import type { SupplierRecord } from "./supplierRegistry";
import type { Transaction } from "./store";

export type DistributionLane = {
  /** Display key: "CA-US → TX-US" */
  key: string;
  origin: {
    country: string;       // ISO-3166 alpha-2
    state?: string;
    city?: string;         // when supplier has one
  };
  destination: {
    country: string;
    state?: string;
  };
  // Volume rollups across this lane
  transactionCount: number;
  totalUnits: number;
  totalRevenueCents: number;
  // Recency
  lastShipmentAt: string | null;
  firstShipmentAt: string | null;
};

export type LanesRollup = {
  supplierId: string;
  origin: {
    country: string;
    state?: string;
    city?: string;
  };
  lanes: DistributionLane[];
  // Transactions linked to this supplier that lack buyer destination
  // — we can't lane them, but operators should know how much of the
  // picture is missing.
  missingDestinationCount: number;
  totalLinkedTransactions: number;
  computedAt: string;
};

/**
 * Aggregate transactions into lanes for a single supplier.
 *
 * Origin = supplier's address in the registry. Destination = each
 * transaction's buyer destination. Transactions without destination
 * are counted in `missingDestinationCount` and excluded from lanes.
 */
export function computeSupplierLanes(
  supplier: SupplierRecord,
  transactions: Transaction[],
): LanesRollup {
  const origin = {
    country: supplier.country || "??",
    state: supplier.state,
    city: supplier.city,
  };

  const map = new Map<string, DistributionLane>();
  let missing = 0;

  for (const t of transactions) {
    const dCountry = t.buyerCountry?.toUpperCase().slice(0, 2);
    if (!dCountry) {
      missing += 1;
      continue;
    }
    const dState = t.buyerState?.toUpperCase();
    const key = `${origin.state ?? ""}-${origin.country} → ${dState ?? ""}-${dCountry}`;

    const existing = map.get(key);
    if (existing) {
      existing.transactionCount += 1;
      existing.totalUnits += t.quantity ?? 0;
      existing.totalRevenueCents += t.supplierPayoutCents ?? 0;
      if (t.createdAt > (existing.lastShipmentAt ?? "")) {
        existing.lastShipmentAt = t.createdAt;
      }
      if (!existing.firstShipmentAt || t.createdAt < existing.firstShipmentAt) {
        existing.firstShipmentAt = t.createdAt;
      }
    } else {
      map.set(key, {
        key,
        origin,
        destination: { country: dCountry, state: dState },
        transactionCount: 1,
        totalUnits: t.quantity ?? 0,
        totalRevenueCents: t.supplierPayoutCents ?? 0,
        lastShipmentAt: t.createdAt,
        firstShipmentAt: t.createdAt,
      });
    }
  }

  // Sort by total revenue desc — the operator's most valuable lanes first.
  const lanes = Array.from(map.values()).sort(
    (a, b) => b.totalRevenueCents - a.totalRevenueCents,
  );

  return {
    supplierId: supplier.id,
    origin,
    lanes,
    missingDestinationCount: missing,
    totalLinkedTransactions: transactions.length,
    computedAt: new Date().toISOString(),
  };
}
