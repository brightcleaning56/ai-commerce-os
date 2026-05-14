/**
 * Supplier Matching Engine — Layer 7 in the spec.
 *
 * Given a sourcing query (category + optional location, kind, MOQ),
 * rank verified suppliers in the registry by a composite score:
 *
 *   Trust         40 pts   (cached AI Trust Score, scaled to 40)
 *   Category fit  30 pts   (substring match across supplier.categories)
 *   Location fit  20 pts   (country / state / city proximity)
 *   Kind match    10 pts   (exact match on requested supplier kind)
 *   Status gate   reject   (only "active" suppliers in results)
 *   Tier gate     soft     ("unverified" tier capped at score 50)
 *
 * Returns ranked candidates with per-bucket score breakdown so the
 * caller (and the UI) can show WHY a supplier ranked where they did.
 *
 * Pure function — takes an already-loaded supplier list. The HTTP
 * route handler does the I/O. Lets unit tests pass mock arrays.
 */
import type { SupplierRecord } from "./supplierRegistry";

export type MatchCriteria = {
  /** Free-text categories the buyer needs (e.g. "roofing", "shingles"). */
  categories: string[];
  /** Optional 2-letter ISO country code; empty = global. */
  country?: string;
  /** Optional state code; only used when country matches. */
  state?: string;
  /** Optional city; secondary signal under state. */
  city?: string;
  /** Restrict to a kind (Manufacturer / Wholesaler / etc.). */
  kind?: SupplierRecord["kind"];
  /** Minimum monthly capacity the buyer needs (units/month). */
  minCapacityUnitsPerMo?: number;
  /** Maximum lead time the buyer accepts (days). */
  maxLeadTimeDays?: number;
  /** Maximum MOQ the buyer can absorb. */
  maxMoq?: number;
  /** Cap results returned. Default 25. */
  limit?: number;
};

export type MatchScoreBreakdown = {
  total: number;        // 0-100
  trust: number;        // 0-40
  category: number;     // 0-30
  location: number;     // 0-20
  kind: number;         // 0-10
  unverifiedCap: number; // 0 or negative penalty applied to total
  reasons: string[];    // human-readable explanation lines
};

export type MatchResult = {
  supplier: SupplierRecord;
  breakdown: MatchScoreBreakdown;
};

const TRUST_MAX = 40;
const CATEGORY_MAX = 30;
const LOCATION_MAX = 20;
const KIND_MAX = 10;
const UNVERIFIED_CAP = 50; // hard cap for unverified-tier suppliers

export function matchSuppliers(suppliers: SupplierRecord[], criteria: MatchCriteria): MatchResult[] {
  const limit = Math.max(1, Math.min(200, criteria.limit ?? 25));

  // Hard filters first — rejects don't show up at all.
  const candidates = suppliers.filter((s) => {
    if (s.status !== "active" && s.status !== "pending") return false;
    if (s.status === "pending" && s.tier === "unverified") return false; // never surface unvetted pending
    if (criteria.kind && s.kind !== criteria.kind) return false;
    if (criteria.minCapacityUnitsPerMo && (s.capacityUnitsPerMo ?? 0) < criteria.minCapacityUnitsPerMo) {
      return false;
    }
    if (criteria.maxLeadTimeDays && (s.leadTimeDays ?? Infinity) > criteria.maxLeadTimeDays) {
      return false;
    }
    if (criteria.maxMoq && (s.moq ?? Infinity) > criteria.maxMoq) {
      return false;
    }
    return true;
  });

  // Score each survivor.
  const scored: MatchResult[] = candidates.map((s) => {
    const reasons: string[] = [];

    // Trust bucket: score divided by 100 then scaled to 40.
    const trust = Math.round(((s.trustScore ?? 0) / 100) * TRUST_MAX);
    if (s.trustScore != null) {
      reasons.push(`Trust ${s.trustScore}/100 = ${trust}/${TRUST_MAX}`);
    } else {
      reasons.push(`Trust unscored = 0/${TRUST_MAX}`);
    }

    // Category fit: best matching score across the requested categories.
    // Each requested category contributes pro-rata; perfect overlap = 30.
    const supplierCats = s.categories.map((c) => c.toLowerCase());
    const requested = (criteria.categories ?? []).map((c) => c.toLowerCase()).filter(Boolean);
    let categoryScore = 0;
    if (requested.length === 0) {
      categoryScore = 0; // nothing to match against
    } else {
      let matched = 0;
      for (const r of requested) {
        const hit = supplierCats.some((sc) => sc.includes(r) || r.includes(sc));
        if (hit) matched += 1;
      }
      categoryScore = Math.round((matched / requested.length) * CATEGORY_MAX);
      reasons.push(`Category match ${matched}/${requested.length} = ${categoryScore}/${CATEGORY_MAX}`);
    }

    // Location fit: country = 8, state = +8, city = +4 = up to 20.
    let locationScore = 0;
    if (criteria.country && s.country.toUpperCase() === criteria.country.toUpperCase()) {
      locationScore += 8;
      if (criteria.state && s.state && s.state.toUpperCase() === criteria.state.toUpperCase()) {
        locationScore += 8;
        if (criteria.city && s.city && s.city.toLowerCase() === criteria.city.toLowerCase()) {
          locationScore += 4;
        }
      }
    } else if (!criteria.country) {
      // No location constraint — give half-credit so suppliers with
      // location data don't dominate over equally-good candidates
      // we can't compare on location.
      locationScore = Math.round(LOCATION_MAX / 2);
    }
    if (locationScore > 0) {
      reasons.push(`Location fit = ${locationScore}/${LOCATION_MAX}`);
    }

    // Kind match (binary): full points if matched OR no kind requested.
    const kindScore = !criteria.kind || s.kind === criteria.kind ? KIND_MAX : 0;
    if (criteria.kind) {
      reasons.push(`Kind ${s.kind === criteria.kind ? "match" : "miss"} = ${kindScore}/${KIND_MAX}`);
    }

    let total = trust + categoryScore + locationScore + kindScore;

    // Unverified-tier cap. Even with perfect category + location, an
    // unverified supplier can't out-rank a basic-tier one.
    let unverifiedCap = 0;
    if (s.tier === "unverified" && total > UNVERIFIED_CAP) {
      unverifiedCap = UNVERIFIED_CAP - total; // negative adjustment
      total = UNVERIFIED_CAP;
      reasons.push(`Unverified tier capped to ${UNVERIFIED_CAP}`);
    }

    return {
      supplier: s,
      breakdown: {
        total: Math.max(0, Math.min(100, Math.round(total))),
        trust,
        category: categoryScore,
        location: locationScore,
        kind: kindScore,
        unverifiedCap,
        reasons,
      },
    };
  });

  scored.sort((a, b) => b.breakdown.total - a.breakdown.total);
  return scored.slice(0, limit);
}
