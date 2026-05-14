import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import {
  discoverBusinessesFromGooglePlaces,
  discoverBusinessesFromUsaSpending,
  type BusinessDiscoveryQuery,
  type BusinessDiscoverySource,
} from "@/lib/businessDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/businesses/discover
 *
 * Body: { source: "usaspending" | "google_places", query: BusinessDiscoveryQuery }
 *
 * Returns CANDIDATES (unsaved). Operator picks which to import via
 * the existing POST /api/admin/businesses (now supports externalId
 * dedupe + source pass-through).
 *
 * Capability: leads:write — discovery costs API quota; gating it
 * the same as creating a record.
 */
const VALID_SOURCES: BusinessDiscoverySource[] = ["usaspending", "google_places"];

export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "leads:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const source = typeof body.source === "string" && VALID_SOURCES.includes(body.source as BusinessDiscoverySource)
    ? (body.source as BusinessDiscoverySource)
    : null;
  if (!source) {
    return NextResponse.json(
      { error: `source must be one of ${VALID_SOURCES.join(", ")}` },
      { status: 400 },
    );
  }

  const rawQuery = (body.query ?? {}) as Record<string, unknown>;
  const query: BusinessDiscoveryQuery = {
    naicsCode: typeof rawQuery.naicsCode === "string" ? rawQuery.naicsCode.trim().slice(0, 6) : undefined,
    state: typeof rawQuery.state === "string" ? rawQuery.state.trim().toUpperCase().slice(0, 2) : undefined,
    startDate: typeof rawQuery.startDate === "string" ? rawQuery.startDate : undefined,
    endDate: typeof rawQuery.endDate === "string" ? rawQuery.endDate : undefined,
    textQuery: typeof rawQuery.textQuery === "string" ? rawQuery.textQuery.trim().slice(0, 200) : undefined,
    limit: typeof rawQuery.limit === "number" ? Math.round(rawQuery.limit) : undefined,
  };

  if (source === "usaspending") {
    const result = await discoverBusinessesFromUsaSpending(query);
    return NextResponse.json(result);
  }
  if (source === "google_places") {
    const result = await discoverBusinessesFromGooglePlaces(query);
    return NextResponse.json(result);
  }
  return NextResponse.json({ error: "Unknown source" }, { status: 400 });
}
