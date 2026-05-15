import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { estimateLane, type FreightMode } from "@/lib/freight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/freight/estimate — return freight quotes for a lane.
 *
 * Body:
 *   { originCountry: string (ISO-2), originState?: string,
 *     destCountry: string,           destState?: string,
 *     weightKg: number,              volumeCbm?: number,
 *     mode?: "ocean-fcl"|"ocean-lcl"|"air-cargo"|"ftl"|"ltl"|"rail"|"parcel" }
 *
 * Returns: { provider, laneKey, rates: [...], computedAt }
 *
 * Capability: leads:read -- this is research-grade data, not a
 * commitment. Operator can show buyers an estimate before booking.
 */
export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "leads:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const originCountry = typeof body.originCountry === "string" ? body.originCountry.toUpperCase().slice(0, 2) : "";
  const destCountry = typeof body.destCountry === "string" ? body.destCountry.toUpperCase().slice(0, 2) : "";
  if (!originCountry || !destCountry) {
    return NextResponse.json(
      { error: "originCountry and destCountry required (2-letter ISO)" },
      { status: 400 },
    );
  }

  const weightKg = typeof body.weightKg === "number" && body.weightKg > 0 ? body.weightKg : 1;
  const volumeCbm = typeof body.volumeCbm === "number" && body.volumeCbm > 0 ? body.volumeCbm : undefined;
  const originState = typeof body.originState === "string" ? body.originState.toUpperCase().slice(0, 3) : undefined;
  const destState = typeof body.destState === "string" ? body.destState.toUpperCase().slice(0, 3) : undefined;

  const validModes: FreightMode[] = [
    "ocean-fcl", "ocean-lcl", "air-cargo", "ftl", "ltl", "rail", "parcel",
  ];
  const mode = typeof body.mode === "string" && validModes.includes(body.mode as FreightMode)
    ? (body.mode as FreightMode)
    : undefined;

  try {
    const quote = await estimateLane({
      originCountry,
      originState,
      destCountry,
      destState,
      weightKg,
      volumeCbm,
      mode,
    });
    return NextResponse.json(quote);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Freight estimate failed" },
      { status: 500 },
    );
  }
}
