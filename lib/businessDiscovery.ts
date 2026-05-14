/**
 * Business Discovery — populate /admin/businesses from real data
 * sources instead of LLM hallucination or operator typing.
 *
 * Two adapters today:
 *   1. USAspending.gov — federal contract recipients. Free, no auth.
 *      Returns name + state/city + UEI + NAICS + revenue. NO emails,
 *      NO phones (USAspending never returns contact info). Bias toward
 *      US gov contractors.
 *   2. Google Places (New) — local businesses by category + location.
 *      Free 1k queries/day, then $17/1k. Requires GOOGLE_PLACES_API_KEY.
 *      Returns name + address + phone + website + Google rating. Still
 *      NO emails (Places never returns them — operator has to enrich
 *      via website scraping or a separate paid tool).
 *
 * Same DiscoveryAdapter shape as supplierDiscovery.ts so paid sources
 * (Data Axle, Apollo, Lusha) can layer in without touching the
 * /admin/businesses UI.
 *
 * Returns CANDIDATES (unsaved). Operator picks which to import via
 * the existing POST /api/admin/businesses (now accepts source +
 * externalId for dedupe).
 *
 * Node-only (uses fetch with timeouts).
 */

export type BusinessDiscoverySource =
  | "usaspending"
  | "google_places";

export type BusinessDiscoveryQuery = {
  // For USAspending
  naicsCode?: string;
  state?: string;             // 2-letter US state
  startDate?: string;
  endDate?: string;
  // For Google Places
  textQuery?: string;         // "roofing contractors in Dallas"
  locationBias?: {            // optional radius bias
    lat: number;
    lng: number;
    radiusMeters?: number;
  };
  // Common
  limit?: number;             // default 25, max 100
};

export type BusinessDiscoveryCandidate = {
  externalId: string | null;          // place_id (Places) or UEI (USAspending)
  source: BusinessDiscoverySource;
  name: string;
  country: string;                    // ISO-2
  state?: string;
  city?: string;
  zip?: string;
  address1?: string;
  phone?: string;
  website?: string;
  email?: string;                     // basically never present from these sources
  naicsCode?: string;
  industryHint?: string;              // free-text label from the source
  ratingHint?: number;                // Google rating when available
  evidence: string;                   // "12 federal contracts $4.2M total" / "4.6★ 213 reviews"
  // USAspending-specific
  largestAwardUsd?: number;
  totalAwardUsd?: number;
};

export type BusinessDiscoveryResult = {
  source: BusinessDiscoverySource;
  query: BusinessDiscoveryQuery;
  candidates: BusinessDiscoveryCandidate[];
  fetchedAt: string;
  totalMatches?: number;
  error?: string;
};

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

// ─── USAspending adapter ───────────────────────────────────────────────

const USASPENDING_BASE = "https://api.usaspending.gov/api/v2";

export async function discoverBusinessesFromUsaSpending(
  query: BusinessDiscoveryQuery,
): Promise<BusinessDiscoveryResult> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));
  const endDate = query.endDate ?? new Date().toISOString().slice(0, 10);
  const startDate =
    query.startDate ??
    new Date(Date.now() - 24 * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const fetchedAt = new Date().toISOString();

  const filters: Record<string, unknown> = {
    award_type_codes: ["A", "B", "C", "D"],
    time_period: [{ start_date: startDate, end_date: endDate }],
  };
  if (query.naicsCode) filters.naics_codes = [query.naicsCode];
  if (query.state) {
    filters.place_of_performance_locations = [{ country: "USA", state: query.state.toUpperCase().slice(0, 2) }];
  }

  const body = {
    filters,
    fields: [
      "Award ID",
      "Recipient Name",
      "Recipient UEI",
      "Award Amount",
      "naics_code",
      "naics_description",
      "place_of_performance_state_code",
      "place_of_performance_zip5",
      "place_of_performance_city_name",
    ],
    page: 1,
    limit: Math.min(limit * 4, 100),
    sort: "Award Amount",
    order: "desc",
    subawards: false,
  };

  let upstream: { results?: unknown[]; page_metadata?: { total?: number } } | null = null;
  try {
    const resp = await fetchWithTimeout(
      `${USASPENDING_BASE}/search/spending_by_award/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      },
      15_000,
    );
    if (!resp.ok) {
      return {
        source: "usaspending",
        query,
        candidates: [],
        fetchedAt,
        error: `USAspending HTTP ${resp.status}`,
      };
    }
    upstream = await resp.json();
  } catch (e) {
    return {
      source: "usaspending",
      query,
      candidates: [],
      fetchedAt,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const rows = Array.isArray(upstream?.results) ? upstream!.results : [];
  type Row = {
    "Recipient Name"?: string;
    "Recipient UEI"?: string;
    "Award Amount"?: number;
    naics_code?: string;
    naics_description?: string;
    place_of_performance_state_code?: string;
    place_of_performance_zip5?: string;
    place_of_performance_city_name?: string;
  };
  const byRecipient = new Map<string, { row: Row; total: number; largest: number; count: number }>();
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const row = r as Row;
    const name = (row["Recipient Name"] || "").trim();
    const uei = (row["Recipient UEI"] || "").trim();
    const key = (uei || name).toUpperCase();
    if (!key) continue;
    const amount = typeof row["Award Amount"] === "number" ? row["Award Amount"] : 0;
    const ex = byRecipient.get(key);
    if (ex) {
      ex.total += amount;
      ex.count += 1;
      if (amount > ex.largest) {
        ex.largest = amount;
        ex.row = row;
      }
    } else {
      byRecipient.set(key, { row, total: amount, largest: amount, count: 1 });
    }
  }

  const candidates: BusinessDiscoveryCandidate[] = [];
  for (const [, agg] of byRecipient) {
    const row = agg.row;
    const name = (row["Recipient Name"] || "").trim();
    if (!name) continue;
    const uei = (row["Recipient UEI"] || "").trim() || null;
    candidates.push({
      externalId: uei ? `usaspending:${uei}` : null,
      source: "usaspending",
      name,
      country: "US",
      state: row.place_of_performance_state_code?.toUpperCase().slice(0, 2),
      city: row.place_of_performance_city_name,
      zip: row.place_of_performance_zip5,
      naicsCode: row.naics_code,
      industryHint: row.naics_description,
      evidence: `${agg.count} federal contract${agg.count === 1 ? "" : "s"} ${startDate} → ${endDate}, total $${formatUsd(agg.total)}`,
      largestAwardUsd: agg.largest,
      totalAwardUsd: agg.total,
    });
  }

  candidates.sort((a, b) => (b.totalAwardUsd ?? 0) - (a.totalAwardUsd ?? 0));
  return {
    source: "usaspending",
    query,
    candidates: candidates.slice(0, limit),
    fetchedAt,
    totalMatches: typeof upstream?.page_metadata?.total === "number" ? upstream.page_metadata.total : candidates.length,
  };
}

// ─── Google Places adapter ─────────────────────────────────────────────

const PLACES_BASE = "https://places.googleapis.com/v1";

export async function discoverBusinessesFromGooglePlaces(
  query: BusinessDiscoveryQuery,
): Promise<BusinessDiscoveryResult> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));
  const fetchedAt = new Date().toISOString();
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return {
      source: "google_places",
      query,
      candidates: [],
      fetchedAt,
      error:
        "GOOGLE_PLACES_API_KEY not set. Get one at console.cloud.google.com → enable Places API (New) → credentials.",
    };
  }
  const text = (query.textQuery || "").trim();
  if (!text) {
    return {
      source: "google_places",
      query,
      candidates: [],
      fetchedAt,
      error: "textQuery is required for Google Places search (e.g. 'roofing contractors in Dallas TX')",
    };
  }

  // Field mask determines which fields come back. We ask for the
  // minimum useful set; richer fields cost more per request.
  const fieldMask = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.addressComponents",
    "places.nationalPhoneNumber",
    "places.internationalPhoneNumber",
    "places.websiteUri",
    "places.types",
    "places.primaryTypeDisplayName",
    "places.rating",
    "places.userRatingCount",
    "places.businessStatus",
  ].join(",");

  const body: Record<string, unknown> = {
    textQuery: text,
    pageSize: Math.min(20, limit),  // Places caps pageSize at 20
  };
  if (query.locationBias) {
    body.locationBias = {
      circle: {
        center: { latitude: query.locationBias.lat, longitude: query.locationBias.lng },
        radius: query.locationBias.radiusMeters ?? 50000,
      },
    };
  }

  let upstream: { places?: unknown[] } | null = null;
  try {
    const resp = await fetchWithTimeout(
      `${PLACES_BASE}/places:searchText`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify(body),
      },
      10_000,
    );
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return {
        source: "google_places",
        query,
        candidates: [],
        fetchedAt,
        error: `Google Places HTTP ${resp.status}: ${errText.slice(0, 200)}`,
      };
    }
    upstream = await resp.json();
  } catch (e) {
    return {
      source: "google_places",
      query,
      candidates: [],
      fetchedAt,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  type AddressComponent = { longText?: string; shortText?: string; types?: string[] };
  type Place = {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    addressComponents?: AddressComponent[];
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    websiteUri?: string;
    types?: string[];
    primaryTypeDisplayName?: { text?: string };
    rating?: number;
    userRatingCount?: number;
    businessStatus?: string;
  };

  const places = Array.isArray(upstream?.places) ? upstream!.places : [];
  const candidates: BusinessDiscoveryCandidate[] = [];
  for (const p of places) {
    if (!p || typeof p !== "object") continue;
    const place = p as Place;
    const name = place.displayName?.text?.trim() ?? "";
    if (!name) continue;
    if (place.businessStatus && place.businessStatus !== "OPERATIONAL") continue;

    // Parse address components for state / city / zip / address1.
    let state: string | undefined;
    let city: string | undefined;
    let zip: string | undefined;
    let country = "US";
    let streetNumber: string | undefined;
    let route: string | undefined;
    for (const c of place.addressComponents ?? []) {
      const types = c.types ?? [];
      if (types.includes("administrative_area_level_1")) state = c.shortText?.toUpperCase();
      else if (types.includes("locality")) city = c.longText;
      else if (types.includes("postal_code")) zip = c.longText;
      else if (types.includes("country")) country = c.shortText?.toUpperCase() ?? "US";
      else if (types.includes("street_number")) streetNumber = c.longText;
      else if (types.includes("route")) route = c.longText;
    }
    const address1 = [streetNumber, route].filter(Boolean).join(" ") || undefined;

    candidates.push({
      externalId: place.id ? `google_places:${place.id}` : null,
      source: "google_places",
      name,
      country,
      state,
      city,
      zip,
      address1,
      phone: place.internationalPhoneNumber || place.nationalPhoneNumber,
      website: place.websiteUri,
      industryHint: place.primaryTypeDisplayName?.text || place.types?.[0],
      ratingHint: place.rating,
      evidence: place.rating != null
        ? `${place.rating}★ (${place.userRatingCount ?? 0} reviews)${place.primaryTypeDisplayName?.text ? ` · ${place.primaryTypeDisplayName.text}` : ""}`
        : place.primaryTypeDisplayName?.text || "Active business",
    });
  }

  // Places sometimes returns more than pageSize; trim to limit.
  return {
    source: "google_places",
    query,
    candidates: candidates.slice(0, limit),
    fetchedAt,
    totalMatches: candidates.length,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────

function formatUsd(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}
