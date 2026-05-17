import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { estimateLane } from "@/lib/freight";
import { store } from "@/lib/store";
import { supplierRegistry } from "@/lib/supplierRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/transactions/[id]/freight-recompute — slice 75.
 *
 * Re-runs estimateLane() against the transaction's current state
 * (buyer destination + linked supplier origin) and overwrites the
 * stored freightEstimate. Useful because:
 *   - Rate-card mode is deterministic but Shippo rates move
 *     hourly. A txn that's been sitting in escrow for days has a
 *     stale estimate.
 *   - The original estimate was stamped at slice 47 quote-accept;
 *     if the operator later changed the buyer destination (via
 *     /destination) or linked a supplier (via /link-supplier),
 *     the original estimate is wrong.
 *
 * Capability: transactions:write -- same as /destination.
 *
 * Requires buyerCountry to be set; without a destination there's
 * nothing to estimate. Falls back to a US origin when no supplier
 * is linked, matching the slice 47 behavior so the answer is
 * consistent.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "transactions:write");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const { id } = await params;
  const txn = await store.getTransaction(id);
  if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  if (!txn.buyerCountry) {
    return NextResponse.json(
      {
        error:
          "Transaction has no buyer destination -- set one via POST /destination first.",
      },
      { status: 400 },
    );
  }

  // Origin: prefer the linked supplier's registry entry, fall back to
  // US (same default as the original slice 47 quote-accept path).
  let originCountry = "US";
  let originState: string | undefined;
  if (txn.supplierRegistryId) {
    const supplier = await supplierRegistry.get(txn.supplierRegistryId).catch(() => null);
    if (supplier) {
      originCountry = supplier.country || "US";
      originState = supplier.state;
    }
  }

  // Weight: 0.5kg per unit, same heuristic as slice 47 + slice 58.
  // Centralizing this in lib/freight is a future slice; today every
  // call-site repeats it for clarity.
  const weightKg = Math.max(1, (txn.quantity ?? 1) * 0.5);

  try {
    const quote = await estimateLane({
      originCountry,
      originState,
      destCountry: txn.buyerCountry,
      destState: txn.buyerState,
      weightKg,
    });

    const updated = await store.patchTransaction(id, {
      freightEstimate: quote,
    });

    return NextResponse.json({
      ok: true,
      transaction: updated,
      freight: {
        provider: quote.provider,
        laneKey: quote.laneKey,
        rateCount: quote.rates.length,
        cheapest: quote.rates[0] ?? null,
        computedAt: quote.computedAt,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Recompute failed" },
      { status: 500 },
    );
  }
}
