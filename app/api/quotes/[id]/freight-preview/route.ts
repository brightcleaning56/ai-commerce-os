import { NextRequest, NextResponse } from "next/server";
import { estimateLane, type FreightMode } from "@/lib/freight";
import { store } from "@/lib/store";
import { supplierRegistry } from "@/lib/supplierRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/quotes/[id]/freight-preview — public, share-token-gated
 * freight estimate for the buyer-facing /quote/[id] page (slice 58).
 *
 * Why a separate endpoint from /api/freight/estimate:
 *   - The operator-facing endpoint is gated by leads:read capability;
 *     buyers don't have that.
 *   - This route validates the share token (same one that gates the
 *     quote view itself) so only the buyer with the link can preview.
 *   - Origin is resolved server-side from the quote's supplier
 *     registry id (slice 51), so buyers can't spoof origin.
 *   - Weight is approximated server-side from the quote's quantity;
 *     buyer can't inflate the estimate by passing a fake weight.
 *
 * Body: { destCountry: string (ISO-2), destState?: string, mode? }
 * Returns: { provider, laneKey, rates: [...], computedAt }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get("t") || "";

  const quote = await store.getQuote(id);
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  if (!token || token !== quote.shareToken) {
    return NextResponse.json(
      { error: "Invalid or missing share token" },
      { status: 403 },
    );
  }
  // Match the public GET behavior: refuse expired quotes
  if (Date.now() > new Date(quote.shareExpiresAt).getTime()) {
    return NextResponse.json({ error: "Quote link expired" }, { status: 410 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const destCountry =
    typeof body.destCountry === "string"
      ? body.destCountry.toUpperCase().slice(0, 2)
      : "";
  if (destCountry.length !== 2) {
    return NextResponse.json(
      { error: "destCountry required (2-letter ISO)" },
      { status: 400 },
    );
  }
  const destState =
    typeof body.destState === "string"
      ? body.destState.toUpperCase().slice(0, 3)
      : undefined;

  const validModes: FreightMode[] = [
    "ocean-fcl", "ocean-lcl", "air-cargo", "ftl", "ltl", "rail", "parcel",
  ];
  const mode =
    typeof body.mode === "string" && validModes.includes(body.mode as FreightMode)
      ? (body.mode as FreightMode)
      : undefined;

  // Origin: resolve from supplier registry when set (slice 51), else US
  let originCountry = "US";
  let originState: string | undefined;
  if (quote.supplierRegistryId) {
    const supplier = await supplierRegistry.get(quote.supplierRegistryId).catch(() => null);
    if (supplier) {
      originCountry = supplier.country || "US";
      originState = supplier.state;
    }
  }

  // Weight from quote quantity (server-controlled so buyer can't inflate)
  const weightKg = Math.max(1, (quote.quantity ?? 1) * 0.5);

  try {
    const quoteResult = await estimateLane({
      originCountry,
      originState,
      destCountry,
      destState,
      weightKg,
      mode,
    });
    return NextResponse.json(quoteResult);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Freight preview failed" },
      { status: 500 },
    );
  }
}
