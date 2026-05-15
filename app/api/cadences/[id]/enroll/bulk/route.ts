import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { enrollmentsStore } from "@/lib/cadences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cadences/[id]/enroll/bulk — enroll N buyers in one round-trip.
 *
 * Body:
 *   { buyers: [{ buyerId, buyerName, buyerCompany, buyerEmail?, buyerPhone? }] }
 *   - max 500 buyers per call (60s lambda budget)
 *   - duplicates (already-active enrollment in this cadence) are
 *     skipped with reason="already enrolled" rather than failing the
 *     whole batch
 *
 * Returns:
 *   { ok, summary: { total, enrolled, skipped, failed }, results: [...] }
 *
 * Slice 24 ships this endpoint + a CSV-paste UI on /cadences.
 *
 * Capability: outreach:write -- same as single-buyer enroll.
 */

const MAX_BATCH = 500;

type Buyer = {
  buyerId: string;
  buyerName: string;
  buyerCompany: string;
  buyerEmail?: string;
  buyerPhone?: string;
};

type ItemResult =
  | { row: number; ok: true; enrollmentId: string }
  | { row: number; ok: false; skipped?: boolean; reason: string };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "outreach:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;

  let body: { buyers?: Buyer[] } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.buyers) || body.buyers.length === 0) {
    return NextResponse.json({ error: "buyers[] required" }, { status: 400 });
  }
  if (body.buyers.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Too many buyers (${body.buyers.length}); max ${MAX_BATCH} per call` },
      { status: 413 },
    );
  }

  const enrolledBy =
    "user" in auth && auth.user?.email ? auth.user.email : undefined;

  const results: ItemResult[] = [];
  for (let i = 0; i < body.buyers.length; i++) {
    const b = body.buyers[i];
    if (!b.buyerId || !b.buyerName || !b.buyerCompany) {
      results.push({
        row: i,
        ok: false,
        reason: "buyerId, buyerName, and buyerCompany required",
      });
      continue;
    }
    try {
      const enrollment = await enrollmentsStore.create({
        cadenceId: id,
        buyerId: b.buyerId,
        buyerName: b.buyerName,
        buyerCompany: b.buyerCompany,
        buyerEmail: b.buyerEmail,
        buyerPhone: b.buyerPhone,
        enrolledBy,
      });
      results.push({ row: i, ok: true, enrollmentId: enrollment.id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "enroll failed";
      results.push({
        row: i,
        ok: false,
        skipped: msg.includes("already enrolled"),
        reason: msg,
      });
    }
  }

  const summary = {
    total: results.length,
    enrolled: results.filter((r) => r.ok).length,
    skipped: results.filter((r) => !r.ok && r.skipped).length,
    failed: results.filter((r) => !r.ok && !r.skipped).length,
  };

  return NextResponse.json({ ok: summary.failed === 0, summary, results });
}
