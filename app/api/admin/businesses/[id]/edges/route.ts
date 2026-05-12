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

const VALID_KINDS: SupplyEdgeKind[] = [
  "sources_from",
  "distributes_through",
  "competes_with",
  "partners_with",
];
const VALID_SOURCES: SupplyEdgeSource[] = ["ai_profile", "transaction", "operator", "partner"];

/**
 * GET /api/admin/businesses/[id]/edges
 * Returns every SupplyEdge originating from this business.
 *
 * Edges are grouped by kind in the response (sources_from, distributes_through,
 * etc.) for cheap UI rendering. Sorted within each group by confidence desc,
 * then lastSeenAt desc.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const biz = await store.getBusiness(id);
  if (!biz) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const edges = await store.getSupplyEdgesFromBusiness(id);
  const sorted = edges
    .slice()
    .sort(
      (a, b) =>
        b.confidence - a.confidence ||
        new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
    );

  const byKind: Record<SupplyEdgeKind, SupplyEdge[]> = {
    sources_from: [],
    distributes_through: [],
    competes_with: [],
    partners_with: [],
  };
  for (const e of sorted) byKind[e.kind].push(e);

  return NextResponse.json({
    businessId: id,
    businessName: biz.name,
    totalEdges: edges.length,
    byKind,
  });
}

/**
 * POST /api/admin/businesses/[id]/edges
 * Operator manually adds an edge. Source is forced to "operator" so it's
 * tracked separately from AI / transaction observations.
 *
 * Body: { toName, kind, evidence?, confidence?, toBusinessId? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const biz = await store.getBusiness(id);
  if (!biz) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const toName = typeof body.toName === "string" ? body.toName.trim() : "";
  const kind = typeof body.kind === "string" ? (body.kind as SupplyEdgeKind) : "sources_from";

  if (!toName) {
    return NextResponse.json({ error: "toName required" }, { status: 400 });
  }
  if (!VALID_KINDS.includes(kind)) {
    return NextResponse.json(
      { error: `kind must be one of ${VALID_KINDS.join(", ")}` },
      { status: 400 },
    );
  }
  // We accept any source value but force "operator" for this endpoint —
  // AI-generated and transaction-observed edges go through their own paths.
  void VALID_SOURCES; // silence unused warning when only used at type level

  const edge = await store.upsertSupplyEdge({
    fromBusinessId: biz.id,
    fromBusinessName: biz.name,
    toName,
    toBusinessId: typeof body.toBusinessId === "string" ? body.toBusinessId : undefined,
    kind,
    source: "operator",
    confidence: typeof body.confidence === "number" ? body.confidence : 90,
    evidence: typeof body.evidence === "string" ? body.evidence.slice(0, 280) : "operator-added",
  });
  return NextResponse.json({ ok: true, edge });
}
