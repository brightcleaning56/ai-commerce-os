import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { estimateLane, getFreightProvider } from "@/lib/freight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/freight-probe — slice 72.
 *
 * Live smoke test for the freight integration. Hits estimateLane()
 * with a deterministic tiny payload (CN -> US, 100kg) so the operator
 * can verify the provider actually responds before any real /quote
 * preview lands. Reports:
 *   - provider used (shippo | fallback)
 *   - whether rates came back (count + cheapest sample)
 *   - latency in ms
 *   - error message + .env fix hint when it blew up
 *
 * estimateLane already falls back to the rate card on Shippo error,
 * so the response includes a `liveProbe` flag indicating whether the
 * rates were genuinely live-from-Shippo or rate-card-after-error.
 *
 * Capability: system:read (same gate as /api/admin/system-health so
 * this lives in the same admin surface).
 */
export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "system:read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const provider = getFreightProvider();
  const start = Date.now();

  try {
    const quote = await estimateLane({
      originCountry: "CN",
      destCountry: "US",
      destState: "CA",
      weightKg: 100,
    });
    const elapsedMs = Date.now() - start;
    const cheapest = quote.rates[0];

    // estimateLane keeps the input provider's name in its return shape
    // when Shippo succeeded, otherwise switches to "fallback". So if
    // we configured shippo and got back provider=fallback, the API
    // call either errored (and was caught) or returned no rates.
    const expectedLive = provider === "shippo";
    const actuallyLive = quote.provider === "shippo";

    return NextResponse.json({
      ok: true,
      configuredProvider: provider,
      effectiveProvider: quote.provider,
      liveProbe: actuallyLive,
      degraded: expectedLive && !actuallyLive,
      latencyMs: elapsedMs,
      laneKey: quote.laneKey,
      rateCount: quote.rates.length,
      cheapest: cheapest
        ? {
            mode: cheapest.mode,
            estimateUsd: cheapest.estimateUsd,
            transitDaysMin: cheapest.transitDaysMin,
            transitDaysMax: cheapest.transitDaysMax,
            notes: cheapest.notes,
          }
        : null,
      checkedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        configuredProvider: provider,
        latencyMs: Date.now() - start,
        error: e instanceof Error ? e.message : "Probe failed",
        fixHint:
          provider === "shippo"
            ? "Verify SHIPPO_API_KEY is valid and the account has freight rates enabled."
            : "Rate card mode shouldn't fail. Check server logs for an internal error.",
        checkedAt: new Date().toISOString(),
      },
      { status: 502 },
    );
  }
}
