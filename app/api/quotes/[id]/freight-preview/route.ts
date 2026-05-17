import { NextRequest, NextResponse } from "next/server";
import { estimateLane, type FreightMode } from "@/lib/freight";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
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

  // Slice 73: rate limit before we hit the store. 20 calls/min per
  // quote -- generous for a buyer flipping through destinations,
  // tight enough to stop a scraper. Keyed by quote id so one quote's
  // traffic can't starve another. In-memory; not durable across
  // redeploys or edge replicas (that's another slice).
  const rl = checkRateLimit(`freight-preview:${id}`, { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Too many freight previews for this quote. Try again in ${rl.retryAfterSec}s.`,
      },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

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

    // Slice 66: stamp the snapshot onto the quote so the operator-side
    // /quotes detail surfaces "buyer last previewed CN -> US-CA, cheapest
    // ocean-fcl $4,200". Overwrites any prior preview -- we only care
    // about the most recent. Best-effort: a write failure must NOT block
    // the buyer from seeing their estimate, so wrap in try/catch.
    if (quoteResult.rates.length > 0) {
      const cheapest = quoteResult.rates[0]; // estimateLane sorts ascending
      try {
        await store.patchQuote(id, {
          freightPreview: {
            previewedAt: quoteResult.computedAt,
            destCountry,
            destState,
            provider: quoteResult.provider,
            cheapestMode: cheapest.mode,
            cheapestUsd: cheapest.estimateUsd,
            transitDaysMin: cheapest.transitDaysMin,
            transitDaysMax: cheapest.transitDaysMax,
            rateCount: quoteResult.rates.length,
          },
        });
      } catch (e) {
        console.warn(
          `[quotes/freight-preview] snapshot persist failed for ${id}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    return NextResponse.json(quoteResult);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Freight preview failed" },
      { status: 500 },
    );
  }
}
