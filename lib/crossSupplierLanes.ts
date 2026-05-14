/**
 * Cross-supplier lane aggregator — Layer 6 view that goes one
 * level above per-supplier lanes (lib/supplierLanes.ts) and rolls
 * EVERY supplier's transactions into a single shipping-lane map.
 *
 * Use case: the operator-level view of "Bloomberg for supply
 * chains" Eric's spec calls for. Answers questions like:
 *   - Where does most of our volume actually move?
 *   - How many suppliers ship from CA to TX?
 *   - Which lanes are shrinking month-over-month?
 *
 * Implementation:
 *   - Pull every supplier from the registry + every linked
 *     transaction in one pass
 *   - Build a Map keyed on "originState-originCountry → destState-destCountry"
 *   - For each lane: supplierCount, transactionCount, totalUnits,
 *     totalRevenueCents, recency, and a topSuppliers leaderboard
 *     (top 5 by lane revenue) so operators can drill in
 *
 * Optional regional rollup is layered on top (Asia → US, EU → US,
 * etc.) for the spec's "show me everything moving Asia → US East
 * Coast" use case. Region mapping is intentionally coarse — covers
 * the buckets that matter for freight planning, not full UN/M.49.
 *
 * Pure function — takes loaded suppliers + transactions, returns
 * the rollup. The HTTP route handler does the I/O.
 *
 * Node-only (consumes lib/store types).
 */
import type { SupplierRecord } from "./supplierRegistry";
import type { Transaction } from "./store";

export type CrossLane = {
  /** Display key: "CA-US → TX-US" */
  key: string;
  origin: { country: string; state?: string };
  destination: { country: string; state?: string };
  // Volume rollups
  supplierCount: number;
  transactionCount: number;
  totalUnits: number;
  totalRevenueCents: number;
  // Recency
  lastShipmentAt: string | null;
  firstShipmentAt: string | null;
  /** Top 5 suppliers by revenue on THIS lane. */
  topSuppliers: Array<{
    supplierId: string;
    legalName: string;
    transactionCount: number;
    totalRevenueCents: number;
  }>;
};

export type RegionLane = {
  key: string;                      // "asia → us-east"
  originRegion: string;
  destinationRegion: string;
  laneCount: number;                // distinct state-level lanes inside this region pair
  supplierCount: number;            // distinct suppliers
  transactionCount: number;
  totalUnits: number;
  totalRevenueCents: number;
};

export type CrossLanesRollup = {
  computedAt: string;
  /** Total transactions considered (only those with both supplierRegistryId
   *  AND buyerCountry set). */
  totalLinkedTransactions: number;
  /** Transactions linked to a supplier but missing a buyer destination. */
  missingDestinationCount: number;
  lanes: CrossLane[];
  /** Coarser rollup grouping origin/destination into world regions. */
  regions: RegionLane[];
  /** Distinct origin + destination countries seen, for filter populating. */
  originCountries: string[];
  destinationCountries: string[];
};

export function computeCrossSupplierLanes(
  suppliers: SupplierRecord[],
  transactions: Transaction[],
): CrossLanesRollup {
  const supplierById = new Map<string, SupplierRecord>();
  for (const s of suppliers) supplierById.set(s.id, s);

  const map = new Map<string, CrossLane>();
  // Per-lane per-supplier rollup keyed by `${laneKey}|${supplierId}`
  // so we can build the topSuppliers leaderboard at the end without
  // a second pass over transactions.
  const perSupplier = new Map<string, {
    laneKey: string;
    supplierId: string;
    legalName: string;
    transactionCount: number;
    totalRevenueCents: number;
  }>();
  let totalLinked = 0;
  let missingDest = 0;
  const originCountries = new Set<string>();
  const destinationCountries = new Set<string>();

  for (const t of transactions) {
    if (!t.supplierRegistryId) continue;
    const supplier = supplierById.get(t.supplierRegistryId);
    if (!supplier) continue;
    totalLinked += 1;

    const dCountry = t.buyerCountry?.toUpperCase().slice(0, 2);
    if (!dCountry) {
      missingDest += 1;
      continue;
    }
    const oCountry = (supplier.country || "??").toUpperCase().slice(0, 2);
    const oState = supplier.state?.toUpperCase();
    const dState = t.buyerState?.toUpperCase();
    originCountries.add(oCountry);
    destinationCountries.add(dCountry);

    const key = `${oState ?? ""}-${oCountry} → ${dState ?? ""}-${dCountry}`;
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
        origin: { country: oCountry, state: oState },
        destination: { country: dCountry, state: dState },
        supplierCount: 0,         // computed at the end from perSupplier keys
        transactionCount: 1,
        totalUnits: t.quantity ?? 0,
        totalRevenueCents: t.supplierPayoutCents ?? 0,
        lastShipmentAt: t.createdAt,
        firstShipmentAt: t.createdAt,
        topSuppliers: [],
      });
    }

    // Per-supplier rollup for the topSuppliers leaderboard.
    const psKey = `${key}|${supplier.id}`;
    const ps = perSupplier.get(psKey);
    if (ps) {
      ps.transactionCount += 1;
      ps.totalRevenueCents += t.supplierPayoutCents ?? 0;
    } else {
      perSupplier.set(psKey, {
        laneKey: key,
        supplierId: supplier.id,
        legalName: supplier.legalName,
        transactionCount: 1,
        totalRevenueCents: t.supplierPayoutCents ?? 0,
      });
    }
  }

  // Fill supplierCount + topSuppliers per lane.
  for (const ps of perSupplier.values()) {
    const lane = map.get(ps.laneKey);
    if (!lane) continue;
    lane.supplierCount += 1;
    lane.topSuppliers.push({
      supplierId: ps.supplierId,
      legalName: ps.legalName,
      transactionCount: ps.transactionCount,
      totalRevenueCents: ps.totalRevenueCents,
    });
  }
  for (const lane of map.values()) {
    lane.topSuppliers.sort((a, b) => b.totalRevenueCents - a.totalRevenueCents);
    lane.topSuppliers = lane.topSuppliers.slice(0, 5);
  }

  // Sort lanes by total revenue desc — the operator's most valuable
  // lanes float to the top.
  const lanes = Array.from(map.values()).sort(
    (a, b) => b.totalRevenueCents - a.totalRevenueCents,
  );

  // Regional rollup. Group lanes whose origin + destination fall
  // into the coarse regions defined below, so the operator gets an
  // "Asia → US East Coast" / "EU → US" view at a glance.
  const regions = aggregateByRegion(lanes);

  return {
    computedAt: new Date().toISOString(),
    totalLinkedTransactions: totalLinked,
    missingDestinationCount: missingDest,
    lanes,
    regions,
    originCountries: Array.from(originCountries).sort(),
    destinationCountries: Array.from(destinationCountries).sort(),
  };
}

// ─── Region mapping ────────────────────────────────────────────────────
//
// Coarse buckets that match the way operators actually plan freight.
// Any unmapped country falls into "other" so it still aggregates somewhere.
// US is split by state coast (East / West / Central) because freight
// pricing inside the US varies enormously by region pair.

const ASIA = new Set(["CN", "JP", "KR", "TW", "HK", "VN", "TH", "ID", "MY", "PH", "SG", "IN", "PK", "BD", "LK"]);
const EU = new Set(["DE", "FR", "IT", "ES", "NL", "BE", "PL", "PT", "AT", "DK", "SE", "FI", "NO", "IE", "CZ", "RO", "GR", "HU", "BG"]);
const UK_REGION = new Set(["GB", "UK"]);
const NORTH_AMERICA_NON_US = new Set(["CA", "MX"]);
const SOUTH_AMERICA = new Set(["BR", "AR", "CL", "CO", "PE", "UY"]);
const MIDDLE_EAST = new Set(["AE", "SA", "IL", "TR", "QA"]);
const AFRICA = new Set(["ZA", "NG", "KE", "EG", "MA"]);
const OCEANIA = new Set(["AU", "NZ"]);

const US_EAST = new Set(["NY", "NJ", "PA", "CT", "MA", "RI", "NH", "VT", "ME", "DE", "MD", "DC", "VA", "WV", "NC", "SC", "GA", "FL"]);
const US_WEST = new Set(["CA", "OR", "WA", "NV", "AZ", "UT", "ID", "MT", "WY", "AK", "HI"]);

function regionOf(country: string, state?: string): string {
  const c = country.toUpperCase();
  if (c === "US") {
    if (state) {
      const s = state.toUpperCase();
      if (US_EAST.has(s)) return "us-east";
      if (US_WEST.has(s)) return "us-west";
      return "us-central";
    }
    return "us";
  }
  if (ASIA.has(c)) return "asia";
  if (EU.has(c)) return "eu";
  if (UK_REGION.has(c)) return "uk";
  if (NORTH_AMERICA_NON_US.has(c)) return "north-america-other";
  if (SOUTH_AMERICA.has(c)) return "south-america";
  if (MIDDLE_EAST.has(c)) return "middle-east";
  if (AFRICA.has(c)) return "africa";
  if (OCEANIA.has(c)) return "oceania";
  return "other";
}

function aggregateByRegion(lanes: CrossLane[]): RegionLane[] {
  const map = new Map<string, RegionLane & {
    _suppliers: Set<string>;
  }>();
  for (const lane of lanes) {
    const oRegion = regionOf(lane.origin.country, lane.origin.state);
    const dRegion = regionOf(lane.destination.country, lane.destination.state);
    const key = `${oRegion} → ${dRegion}`;
    const existing = map.get(key);
    if (existing) {
      existing.laneCount += 1;
      existing.transactionCount += lane.transactionCount;
      existing.totalUnits += lane.totalUnits;
      existing.totalRevenueCents += lane.totalRevenueCents;
      for (const s of lane.topSuppliers) existing._suppliers.add(s.supplierId);
    } else {
      const sup = new Set<string>();
      for (const s of lane.topSuppliers) sup.add(s.supplierId);
      map.set(key, {
        key,
        originRegion: oRegion,
        destinationRegion: dRegion,
        laneCount: 1,
        supplierCount: 0, // filled below
        transactionCount: lane.transactionCount,
        totalUnits: lane.totalUnits,
        totalRevenueCents: lane.totalRevenueCents,
        _suppliers: sup,
      });
    }
  }
  const out: RegionLane[] = [];
  for (const r of map.values()) {
    out.push({
      key: r.key,
      originRegion: r.originRegion,
      destinationRegion: r.destinationRegion,
      laneCount: r.laneCount,
      supplierCount: r._suppliers.size,
      transactionCount: r.transactionCount,
      totalUnits: r.totalUnits,
      totalRevenueCents: r.totalRevenueCents,
    });
  }
  out.sort((a, b) => b.totalRevenueCents - a.totalRevenueCents);
  return out;
}
