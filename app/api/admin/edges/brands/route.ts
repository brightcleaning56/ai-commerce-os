import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  store,
  type SupplyEdge,
  type SupplyEdgeKind,
  type SupplyEdgeSource,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_KINDS: SupplyEdgeKind[] = ["sources_from", "distributes_through", "competes_with", "partners_with"];

type BrandBusiness = {
  businessId: string;
  businessName: string;
  city?: string;
  state?: string;
  confidence: number;
  source: SupplyEdgeSource;
  lastSeenAt: string;
  evidence?: string;
};

type BrandAggregate = {
  brand: string;
  kind: SupplyEdgeKind;
  businessCount: number;
  avgConfidence: number;
  // Best-signal subset of businesses for the drawer view. Cap keeps the
  // response size predictable; client can request a per-brand detail
  // endpoint when we add one for >50 results.
  topBusinesses: BrandBusiness[];
  topBusinessIds: string[];        // ALL ids â€” used for "Draft outreach for all" bulk action
  sources: Partial<Record<SupplyEdgeSource, number>>;
  transactionObservedCount: number;
  // Map of co-occurring brands (other brands the same businesses also
  // source from). Helps the operator spot cross-sell + replacement
  // opportunities ("of the 47 GAF users, 31 also use CertainTeed").
  coBrands: { brand: string; sharedCount: number }[];
  // For sorting + display
  lastSeenAt: string;
};

/**
 * GET /api/admin/edges/brands â€” aggregate the SupplyEdge graph by
 * `toName` (the brand/supplier/distributor side). One row per
 * (brand, kind) pair.
 *
 * Query params:
 *   kind     filter to one of VALID_KINDS (default: all)
 *   q        case-insensitive substring match on brand name
 *   limit    cap on results (default 200, max 1000)
 *   minBusinesses  only return brands used by N+ businesses (default 1)
 *
 * Returns:
 *   { brands: BrandAggregate[], totalEdges, totalBrands, totalBusinesses }
 *
 * This is the engine for the cross-reference UI: "find every business
 * that source_from Brand X". From there the operator can bulk-draft
 * outreach pitching an AVYN alternative.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const sp = req.nextUrl.searchParams;
  const kindFilter = sp.get("kind") as SupplyEdgeKind | null;
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const limitRaw = parseInt(sp.get("limit") ?? "200", 10);
  const minBusinessesRaw = parseInt(sp.get("minBusinesses") ?? "1", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 200;
  const minBusinesses = Number.isFinite(minBusinessesRaw) && minBusinessesRaw > 0 ? minBusinessesRaw : 1;

  const [edges, businesses] = await Promise.all([
    store.getSupplyEdges(),
    store.getBusinesses(),
  ]);

  // Index businesses by id for cheap denorm in the response
  const bizById = new Map(businesses.map((b) => [b.id, b]));

  // Filter edges
  const filtered = edges.filter((e) => {
    if (kindFilter && VALID_KINDS.includes(kindFilter) && e.kind !== kindFilter) return false;
    if (q && !e.toName.toLowerCase().includes(q)) return false;
    return true;
  });

  // Group by (toName lowercased, kind) â€” case-insensitive but preserve
  // the first-seen capitalization for display.
  type Bucket = {
    brand: string;
    kind: SupplyEdgeKind;
    edges: SupplyEdge[];
    fromBusinessIds: Set<string>;
  };
  const buckets = new Map<string, Bucket>();
  for (const e of filtered) {
    const key = `${e.toName.trim().toLowerCase()}|${e.kind}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        brand: e.toName.trim(),
        kind: e.kind,
        edges: [],
        fromBusinessIds: new Set(),
      };
      buckets.set(key, b);
    }
    b.edges.push(e);
    b.fromBusinessIds.add(e.fromBusinessId);
  }

  // For each business, what brands do they source from? â€” used for
  // co-occurrence (coBrands) calc below. Only computed for
  // sources_from edges since "businesses that distribute through" is
  // a different semantic.
  const businessToBrands = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.kind !== "sources_from") continue;
    const k = e.toName.trim().toLowerCase();
    let set = businessToBrands.get(e.fromBusinessId);
    if (!set) {
      set = new Set();
      businessToBrands.set(e.fromBusinessId, set);
    }
    set.add(k);
  }

  // Build aggregates
  const aggregates: BrandAggregate[] = [];
  for (const b of buckets.values()) {
    if (b.fromBusinessIds.size < minBusinesses) continue;

    // Sort edges by confidence desc, then lastSeenAt desc
    const sortedEdges = b.edges
      .slice()
      .sort(
        (a, c) =>
          c.confidence - a.confidence ||
          new Date(c.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
      );

    const topBusinesses: BrandBusiness[] = sortedEdges.slice(0, 50).map((e) => {
      const biz = bizById.get(e.fromBusinessId);
      return {
        businessId: e.fromBusinessId,
        businessName: e.fromBusinessName,
        city: biz?.city,
        state: biz?.state,
        confidence: e.confidence,
        source: e.source,
        lastSeenAt: e.lastSeenAt,
        evidence: e.evidence,
      };
    });
    const topBusinessIds = Array.from(b.fromBusinessIds);

    const sources: Partial<Record<SupplyEdgeSource, number>> = {};
    let transactionObservedCount = 0;
    let confidenceSum = 0;
    for (const e of b.edges) {
      sources[e.source] = (sources[e.source] ?? 0) + 1;
      confidenceSum += e.confidence;
      if (e.source === "transaction") transactionObservedCount += 1;
    }

    // Co-brand calculation: only meaningful for sources_from
    let coBrands: BrandAggregate["coBrands"] = [];
    if (b.kind === "sources_from") {
      const brandLower = b.brand.toLowerCase();
      const sharedCounts = new Map<string, number>();
      for (const bizId of b.fromBusinessIds) {
        const brands = businessToBrands.get(bizId);
        if (!brands) continue;
        for (const otherBrand of brands) {
          if (otherBrand === brandLower) continue;
          sharedCounts.set(otherBrand, (sharedCounts.get(otherBrand) ?? 0) + 1);
        }
      }
      coBrands = Array.from(sharedCounts.entries())
        .map(([brand, sharedCount]) => ({ brand, sharedCount }))
        .sort((x, y) => y.sharedCount - x.sharedCount)
        .slice(0, 5);
    }

    const lastSeenAt = sortedEdges[0]?.lastSeenAt ?? new Date(0).toISOString();

    aggregates.push({
      brand: b.brand,
      kind: b.kind,
      businessCount: b.fromBusinessIds.size,
      avgConfidence: Math.round(confidenceSum / b.edges.length),
      topBusinesses,
      topBusinessIds,
      sources,
      transactionObservedCount,
      coBrands,
      lastSeenAt,
    });
  }

  // Sort: businessCount desc, then transactionObservedCount desc, then lastSeenAt desc
  aggregates.sort(
    (a, b) =>
      b.businessCount - a.businessCount ||
      b.transactionObservedCount - a.transactionObservedCount ||
      new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
  );

  const totalBusinesses = new Set(edges.map((e) => e.fromBusinessId)).size;

  return NextResponse.json({
    brands: aggregates.slice(0, limit),
    totalEdges: edges.length,
    totalBrands: buckets.size,
    totalBusinesses,
    appliedFilter: { kind: kindFilter, q, limit, minBusinesses },
  });
}
