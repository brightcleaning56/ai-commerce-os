import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { supplierRegistry } from "@/lib/supplierRegistry";
import { matchSuppliers, type MatchCriteria } from "@/lib/supplierMatching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/suppliers/match
 *
 * Body: MatchCriteria (categories[], country?, state?, city?, kind?,
 * minCapacityUnitsPerMo?, maxLeadTimeDays?, maxMoq?, limit?)
 *
 * Returns ranked supplier matches with per-bucket score breakdown.
 * Capability: leads:read — matching is a research action that doesn't
 * mutate anything.
 *
 * Today this is admin-only. When buyer-facing portal lands later,
 * the same matching logic will power /api/portal/buyer/match scoped
 * by buyer kind/category.
 */
const VALID_KINDS = ["Manufacturer", "Wholesaler", "Distributor", "Dropship"] as const;

export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "leads:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const categories = Array.isArray(body.categories)
    ? body.categories
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 10)
    : [];

  const criteria: MatchCriteria = {
    categories,
    country: typeof body.country === "string" ? body.country.trim().toUpperCase().slice(0, 2) : undefined,
    state: typeof body.state === "string" ? body.state.trim().toUpperCase().slice(0, 80) : undefined,
    city: typeof body.city === "string" ? body.city.trim().slice(0, 80) : undefined,
    kind: typeof body.kind === "string" && (VALID_KINDS as readonly string[]).includes(body.kind)
      ? (body.kind as MatchCriteria["kind"])
      : undefined,
    minCapacityUnitsPerMo: typeof body.minCapacityUnitsPerMo === "number" && body.minCapacityUnitsPerMo > 0
      ? Math.round(body.minCapacityUnitsPerMo)
      : undefined,
    maxLeadTimeDays: typeof body.maxLeadTimeDays === "number" && body.maxLeadTimeDays > 0
      ? Math.round(body.maxLeadTimeDays)
      : undefined,
    maxMoq: typeof body.maxMoq === "number" && body.maxMoq > 0
      ? Math.round(body.maxMoq)
      : undefined,
    limit: typeof body.limit === "number" ? Math.min(200, Math.max(1, Math.round(body.limit))) : 25,
  };

  // Pull the full supplier list once per match. ~5000 record cap keeps
  // this trivially in-memory; if the registry gets huge, swap to a
  // pre-filtered store query.
  const all = await supplierRegistry.list();
  const matches = matchSuppliers(all, criteria);

  return NextResponse.json({
    criteria,
    matches,
    count: matches.length,
    totalSearched: all.length,
  });
}
