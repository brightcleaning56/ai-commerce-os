/**
 * Supplier Discovery — replace the LLM-hallucination supplier-finder
 * agent with real data from external sources. First source: USAspending.gov,
 * the free public API for US federal contract award records.
 *
 * Why USAspending first:
 *   - Free, no API key, well-documented REST endpoints
 *   - Rich payloads: vendor name + UEI + address + NAICS + dollar value
 *   - Real businesses that actually delivered to a counterparty (the
 *     federal government), so they exist and operate at scale
 *   - Lets us seed the registry with verifiable entities instead of
 *     LLM-invented "Shenzhen Bright Co." mock-ups
 *
 * Limitations:
 *   - Bias toward US gov contractors. Doesn't surface DTC consumer
 *     suppliers, overseas manufacturers, etc. Future adapters
 *     (OpenCorporates, GLEIF, ThomasNet API) layer on the same
 *     DiscoveryAdapter interface without touching call sites.
 *   - Returns CANDIDATES, not registry records. The operator picks
 *     which to import via the existing /api/admin/suppliers POST.
 *     No silent auto-import — discovery is a research tool, not a
 *     write-through pipeline.
 */

export type DiscoverySource = "usaspending" | "manual" | "csv";

export type DiscoveryQuery = {
  /** ISO 4-6 digit NAICS code, e.g. "236220" for Commercial Construction. */
  naicsCode?: string;
  /** Two-letter US state code; constrains place of performance. */
  state?: string;
  /** ISO date range; defaults to the last 24 months. */
  startDate?: string;
  endDate?: string;
  /** How many results to fetch. USAspending caps at 100 per page. */
  limit?: number;
};

export type DiscoveryCandidate = {
  /** Source-side stable id (UEI for USAspending, DUNS / regNo elsewhere) */
  externalId: string | null;
  source: DiscoverySource;
  /** Best display name from the source. */
  legalName: string;
  /** When known: 2-letter ISO country, default "US" for USAspending. */
  country: string;
  state?: string;
  city?: string;
  zip?: string;
  /** NAICS classification when present in the source. */
  naicsCode?: string;
  naicsDescription?: string;
  /** Inferred or source-provided supplier kind. */
  kind: "Manufacturer" | "Wholesaler" | "Distributor" | "Dropship";
  /** Free-text categories — used to seed the registry's `categories` array. */
  categories: string[];
  /** Source-side evidence the operator can audit. */
  evidence: string;
  /** Largest single recent transaction we can see (in source currency). */
  largestAwardUsd?: number;
  /** Total recent activity total (sum of awards in window). */
  totalAwardUsd?: number;
  /** Best-effort website / homepage when source returns it (USAspending doesn't). */
  website?: string;
};

export type DiscoveryResult = {
  source: DiscoverySource;
  query: DiscoveryQuery;
  candidates: DiscoveryCandidate[];
  fetchedAt: string;
  /** Total upstream matches (may exceed candidates.length when limited). */
  totalMatches?: number;
  /** Source-side error if the discovery call failed gracefully. */
  error?: string;
};

// ─── USAspending adapter ───────────────────────────────────────────────

const USASPENDING_BASE = "https://api.usaspending.gov/api/v2";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * Discover suppliers from USAspending federal contract awards.
 *
 * Uses the spending_by_award search endpoint, which is the most
 * normalized way to get vendor + award + place-of-performance in
 * one shot. We filter to contracts (award_type_codes A/B/C/D —
 * definitive contract / purchase order / delivery order / IDIQ),
 * skip grants/loans, and aggregate per recipient name so a vendor
 * with 50 small awards shows up once with totals.
 */
export async function discoverFromUsaSpending(query: DiscoveryQuery): Promise<DiscoveryResult> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));
  const endDate = query.endDate ?? new Date().toISOString().slice(0, 10);
  const startDate =
    query.startDate ??
    new Date(Date.now() - 24 * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // ~24 months
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
      "Award Type",
    ],
    page: 1,
    limit: Math.min(limit * 4, 100), // over-fetch so dedupe still leaves us close to `limit`
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
  // Aggregate per recipient (UEI when available, else uppercased name).
  type Row = {
    "Recipient Name"?: string;
    "Recipient UEI"?: string;
    "Award Amount"?: number;
    naics_code?: string;
    naics_description?: string;
    place_of_performance_state_code?: string;
    place_of_performance_zip5?: string;
    place_of_performance_city_name?: string;
    "Award Type"?: string;
  };
  const byRecipient = new Map<string, {
    row: Row;
    totalAwardUsd: number;
    largestAwardUsd: number;
    awardCount: number;
  }>();
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const row = r as Row;
    const name = (row["Recipient Name"] || "").trim();
    const uei = (row["Recipient UEI"] || "").trim();
    const key = (uei || name).toUpperCase();
    if (!key) continue;
    const amount = typeof row["Award Amount"] === "number" ? row["Award Amount"] : 0;
    const existing = byRecipient.get(key);
    if (existing) {
      existing.totalAwardUsd += amount;
      existing.awardCount += 1;
      if (amount > existing.largestAwardUsd) {
        existing.largestAwardUsd = amount;
        existing.row = row; // prefer the row of the largest award for display
      }
    } else {
      byRecipient.set(key, {
        row,
        totalAwardUsd: amount,
        largestAwardUsd: amount,
        awardCount: 1,
      });
    }
  }

  const candidates: DiscoveryCandidate[] = [];
  for (const [, agg] of byRecipient) {
    const row = agg.row;
    const name = (row["Recipient Name"] || "").trim();
    if (!name) continue;
    const uei = (row["Recipient UEI"] || "").trim() || null;
    candidates.push({
      externalId: uei,
      source: "usaspending",
      legalName: name,
      country: "US",
      state: row.place_of_performance_state_code?.toUpperCase().slice(0, 2),
      city: row.place_of_performance_city_name,
      zip: row.place_of_performance_zip5,
      naicsCode: row.naics_code,
      naicsDescription: row.naics_description,
      kind: kindFromNaics(row.naics_code, row.naics_description),
      categories: row.naics_description ? [row.naics_description] : [],
      evidence: `${agg.awardCount} federal contract${agg.awardCount === 1 ? "" : "s"} ${startDate} → ${endDate}, total $${formatUsd(agg.totalAwardUsd)}`,
      largestAwardUsd: agg.largestAwardUsd,
      totalAwardUsd: agg.totalAwardUsd,
    });
  }

  // Trim to the requested limit, ranked by total award size.
  candidates.sort((a, b) => (b.totalAwardUsd ?? 0) - (a.totalAwardUsd ?? 0));
  const trimmed = candidates.slice(0, limit);

  return {
    source: "usaspending",
    query,
    candidates: trimmed,
    fetchedAt,
    totalMatches: typeof upstream?.page_metadata?.total === "number" ? upstream.page_metadata.total : candidates.length,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────

function kindFromNaics(code?: string, description?: string): DiscoveryCandidate["kind"] {
  // Coarse mapping. NAICS sectors:
  //   31-33 = Manufacturing
  //   42 = Wholesale Trade (we treat as Wholesaler)
  //   44-45 = Retail (treat as Distributor — they distribute to consumers)
  //   48-49 = Transportation/Warehousing (Distributor)
  //   23 = Construction (Manufacturer-ish — they "build" things)
  // Anything else falls back to "Distributor" as a generic neutral.
  const sector = code?.slice(0, 2);
  if (sector === "31" || sector === "32" || sector === "33" || sector === "23") return "Manufacturer";
  if (sector === "42") return "Wholesaler";
  if (sector === "44" || sector === "45" || sector === "48" || sector === "49") return "Distributor";
  // Description heuristic for catch-alls.
  const d = (description || "").toLowerCase();
  if (d.includes("manufactur") || d.includes("production")) return "Manufacturer";
  if (d.includes("wholesale")) return "Wholesaler";
  return "Distributor";
}

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
