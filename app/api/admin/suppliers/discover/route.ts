import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import {
  discoverFromUsaSpending,
  type DiscoveryQuery,
  type DiscoverySource,
} from "@/lib/supplierDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/suppliers/discover
 *
 * Body: { source: "usaspending", query: { naicsCode?, state?, startDate?, endDate?, limit? } }
 *
 * Queries the named external source for supplier candidates matching
 * the filters. Returns CANDIDATES (not registry records) so the
 * operator can review before importing. To import a candidate, POST
 * its fields to /api/admin/suppliers (existing endpoint).
 *
 * Capability: leads:write — discovery is a research action that can
 * incur outbound API cost; gating it the same as creating a supplier.
 */
const VALID_SOURCES: DiscoverySource[] = ["usaspending", "manual", "csv"];

export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "leads:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const source = typeof body.source === "string" && VALID_SOURCES.includes(body.source as DiscoverySource)
    ? (body.source as DiscoverySource)
    : null;
  if (!source) {
    return NextResponse.json(
      { error: `source must be one of ${VALID_SOURCES.join(", ")}` },
      { status: 400 },
    );
  }
  if (source === "manual" || source === "csv") {
    return NextResponse.json(
      { error: `${source} discovery isn't implemented as an endpoint — use POST /api/admin/suppliers directly.` },
      { status: 400 },
    );
  }

  const rawQuery = (body.query ?? {}) as Record<string, unknown>;
  const query: DiscoveryQuery = {
    naicsCode: typeof rawQuery.naicsCode === "string" ? rawQuery.naicsCode.trim().slice(0, 6) : undefined,
    state: typeof rawQuery.state === "string" ? rawQuery.state.trim().toUpperCase().slice(0, 2) : undefined,
    startDate: typeof rawQuery.startDate === "string" ? rawQuery.startDate : undefined,
    endDate: typeof rawQuery.endDate === "string" ? rawQuery.endDate : undefined,
    limit: typeof rawQuery.limit === "number" ? Math.round(rawQuery.limit) : undefined,
  };

  if (source === "usaspending") {
    const result = await discoverFromUsaSpending(query);
    return NextResponse.json(result);
  }

  // Unreachable; switch above is exhaustive over implemented sources.
  return NextResponse.json({ error: "Unknown source" }, { status: 400 });
}
