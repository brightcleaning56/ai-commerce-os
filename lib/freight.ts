/**
 * Freight estimation layer (slice 34).
 *
 * Provides a typed estimateLane() that returns a rate quote per lane
 * + freight method. Today the implementation is a simulated rate card
 * (region-pair tables + per-mode multipliers) so /admin/lanes can
 * show "estimated cost to move 1 ton on this lane" without an
 * external dependency. Slice 34.5+ swaps in a real provider
 * (Shippo / EasyPost / Freightos) when SHIPPO_API_KEY is set.
 *
 * The shape is intentionally provider-agnostic so the swap is:
 *   getProvider() === "shippo" -> hit Shippo API
 *   getProvider() === "fallback" -> use the rate card below
 *
 * Node-only.
 */

export type FreightMode =
  | "ocean-fcl"
  | "ocean-lcl"
  | "air-cargo"
  | "ftl"
  | "ltl"
  | "rail"
  | "parcel";

export type FreightEstimateInput = {
  originCountry: string;        // 2-letter ISO
  originState?: string;         // state/province for domestic
  destCountry: string;
  destState?: string;
  weightKg: number;             // total shipment weight
  /** Volume in cubic meters. For ocean FCL we ignore this and price
   *  per container; for air + LCL it drives the dimensional cost. */
  volumeCbm?: number;
  /** Operator-preferred mode. When omitted we return a quote per
   *  mode that's plausible for the lane (e.g. ocean for trans-Pacific,
   *  truck for North-America domestic). */
  mode?: FreightMode;
};

export type FreightRate = {
  mode: FreightMode;
  estimateUsd: number;            // single dollar amount; rate-card produces a midpoint
  transitDaysMin: number;
  transitDaysMax: number;
  /** Why this estimate (rate-card row + multipliers). Keeps the
   *  estimate auditable when an operator asks "where does $4,200
   *  come from?" */
  notes?: string;
};

export type FreightQuote = {
  provider: "shippo" | "fallback";
  laneKey: string;                // e.g. "CN-CA -> US-CA"
  rates: FreightRate[];
  computedAt: string;
};

export function getFreightProvider(): "shippo" | "fallback" {
  return process.env.SHIPPO_API_KEY ? "shippo" : "fallback";
}

// ─── Rate card (slice 34 fallback implementation) ────────────────────
//
// Source: industry-standard order-of-magnitude rates as of 2024 Q4.
// These are NOT carrier quotes -- they're plausibility numbers good
// enough for "is this lane economically viable" gut-check. Real
// quotes need a Shippo/EasyPost integration.

type Region =
  | "asia-china" | "asia-india" | "asia-vietnam" | "asia-other"
  | "eu" | "uk" | "us" | "canada" | "mexico"
  | "south-america" | "africa" | "middle-east" | "oceania";

function classifyRegion(country: string, _state?: string): Region {
  const c = (country ?? "").toUpperCase().trim();
  if (c === "CN") return "asia-china";
  if (c === "IN") return "asia-india";
  if (c === "VN") return "asia-vietnam";
  if (["JP", "KR", "TW", "TH", "ID", "MY", "PH", "SG"].includes(c)) return "asia-other";
  if (c === "US") return "us";
  if (c === "CA") return "canada";
  if (c === "MX") return "mexico";
  if (c === "GB") return "uk";
  if (
    [
      "DE", "FR", "IT", "ES", "NL", "BE", "PT", "PL", "SE", "DK",
      "FI", "AT", "IE", "GR", "CZ", "RO", "HU", "BG",
    ].includes(c)
  )
    return "eu";
  if (["BR", "AR", "CL", "CO", "PE", "VE"].includes(c)) return "south-america";
  if (
    ["EG", "ZA", "NG", "KE", "MA", "DZ", "ET"].includes(c)
  )
    return "africa";
  if (
    ["AE", "SA", "IL", "TR", "QA", "KW", "OM", "JO"].includes(c)
  )
    return "middle-east";
  if (["AU", "NZ", "FJ"].includes(c)) return "oceania";
  return "asia-other";
}

/** USD per kg via the cheapest reasonable mode for the region pair.
 *  Ocean = ocean-FCL when available (cheapest), otherwise air. */
const RATE_PER_KG_BASE: Record<string, number> = {
  // Trans-Pacific
  "asia-china->us": 4.5,
  "asia-other->us": 4.5,
  "asia-vietnam->us": 4.7,
  "asia-india->us": 5.0,
  // Trans-Atlantic
  "eu->us": 3.8,
  "uk->us": 3.8,
  "us->eu": 3.8,
  "us->uk": 3.8,
  // Intra-region
  "us->us": 1.2,
  "us->canada": 1.5,
  "us->mexico": 1.8,
  "canada->us": 1.5,
  "eu->eu": 1.4,
  // Default fallback (long-haul)
  "default": 5.5,
};

/** Mode multipliers + transit-day estimates (vs cheapest baseline). */
const MODE_MULTIPLIERS: Record<FreightMode, { multiplier: number; min: number; max: number }> = {
  "ocean-fcl": { multiplier: 0.6, min: 21, max: 45 },
  "ocean-lcl": { multiplier: 0.85, min: 28, max: 55 },
  "air-cargo": { multiplier: 4.5, min: 3, max: 8 },
  ftl: { multiplier: 1.0, min: 2, max: 7 },
  ltl: { multiplier: 1.4, min: 4, max: 10 },
  rail: { multiplier: 0.7, min: 7, max: 18 },
  parcel: { multiplier: 6.0, min: 1, max: 5 },
};

/** Modes that make sense for a given region pair. Avoids quoting
 *  "rail" trans-Pacific (no rail across oceans). */
function plausibleModesFor(originRegion: Region, destRegion: Region): FreightMode[] {
  const sameContinent = originRegion === destRegion ||
    (originRegion === "us" && (destRegion === "canada" || destRegion === "mexico")) ||
    (destRegion === "us" && (originRegion === "canada" || originRegion === "mexico"));
  if (sameContinent) {
    return ["ftl", "ltl", "rail", "parcel"];
  }
  return ["ocean-fcl", "ocean-lcl", "air-cargo"];
}

function rateKey(originRegion: Region, destRegion: Region): string {
  return `${originRegion}->${destRegion}`;
}

function basePerKg(originRegion: Region, destRegion: Region): number {
  const exact = RATE_PER_KG_BASE[rateKey(originRegion, destRegion)];
  if (exact != null) return exact;
  // Try the asia-other generic
  if (originRegion.startsWith("asia") && destRegion === "us") {
    return RATE_PER_KG_BASE["asia-other->us"];
  }
  return RATE_PER_KG_BASE.default;
}

export async function estimateLane(input: FreightEstimateInput): Promise<FreightQuote> {
  const provider = getFreightProvider();
  const originRegion = classifyRegion(input.originCountry, input.originState);
  const destRegion = classifyRegion(input.destCountry, input.destState);
  const baseRate = basePerKg(originRegion, destRegion);
  const weightKg = Math.max(1, input.weightKg);

  // When SHIPPO_API_KEY is set, future code would hit the real
  // provider here. For now we always use the rate card.
  const modes = input.mode ? [input.mode] : plausibleModesFor(originRegion, destRegion);
  const rates: FreightRate[] = modes.map((mode) => {
    const cfg = MODE_MULTIPLIERS[mode];
    // FCL has a fixed-container minimum that flat-rates regardless of
    // weight up to ~25 metric tons. Approximate with a flat $3500 floor
    // for short hauls + per-kg above 5000kg.
    let estimateUsd: number;
    if (mode === "ocean-fcl") {
      estimateUsd = Math.max(3500, baseRate * weightKg * 0.6);
    } else {
      estimateUsd = baseRate * weightKg * cfg.multiplier;
    }
    estimateUsd = Math.round(estimateUsd);
    return {
      mode,
      estimateUsd,
      transitDaysMin: cfg.min,
      transitDaysMax: cfg.max,
      notes: `Rate card · ${rateKey(originRegion, destRegion)} · ${baseRate.toFixed(2)} USD/kg base`,
    };
  });
  rates.sort((a, b) => a.estimateUsd - b.estimateUsd);

  return {
    provider,
    laneKey: `${input.originCountry}${input.originState ? `-${input.originState}` : ""} -> ${input.destCountry}${input.destState ? `-${input.destState}` : ""}`,
    rates,
    computedAt: new Date().toISOString(),
  };
}
