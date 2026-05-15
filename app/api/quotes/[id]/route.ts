import { NextRequest, NextResponse } from "next/server";
import { estimateLane } from "@/lib/freight";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public quote view — gated by shareToken in ?t=<token>.
 * If no token is presented, only the basic existence check passes; full body
 * requires the token. Pattern matches /api/share/[id].
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const quote = await store.getQuote(params.id);
  if (!quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  const token = req.nextUrl.searchParams.get("t") || "";
  if (!token || token !== quote.shareToken) {
    return NextResponse.json({ error: "Invalid or missing share token" }, { status: 403 });
  }
  // Expiry check
  if (Date.now() > new Date(quote.shareExpiresAt).getTime()) {
    return NextResponse.json(
      { error: "Quote link expired", expiredAt: quote.shareExpiresAt },
      { status: 410 },
    );
  }
  return NextResponse.json({ quote });
}

/**
 * Update quote lifecycle status (accept / reject / sent).
 *
 * Two callers:
 *   - Operator (authenticated app endpoint) toggling status manually
 *   - Buyer (public, via the share link on /quote/[id]) accepting or
 *     rejecting their own quote. We don't gate this PATCH because the
 *     share-token gate on GET already proves the caller has a valid
 *     buyer link, and the only state transitions allowed are
 *     accept/reject from "draft" or "sent".
 *
 * On accept, the buyer can ALSO submit their shipping destination
 * (country / state / city / zip). When present, it's persisted on
 * the Quote so that Transaction creation later inherits it without
 * operator backfill — closes the "missing destination" gap on the
 * Layer 6 distribution-lanes dashboard.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body: {
    status?: "draft" | "sent" | "accepted" | "rejected" | "expired";
    destination?: {
      country?: string;
      state?: string;
      city?: string;
      zip?: string;
    };
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.status) {
    return NextResponse.json({ error: "Missing status" }, { status: 400 });
  }
  const allowed = ["draft", "sent", "accepted", "rejected", "expired"];
  if (!allowed.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const patch: Record<string, unknown> = { status: body.status };
  if (body.status === "accepted") patch.acceptedAt = new Date().toISOString();
  if (body.status === "rejected") patch.rejectedAt = new Date().toISOString();

  // Capture buyer destination if the client sent one alongside an
  // accept. Country is required to count as a "real" destination so
  // Layer 6 lanes can group on it; missing country = ignore the
  // whole block. All fields are length-capped defensively.
  if (body.status === "accepted" && body.destination) {
    const country = typeof body.destination.country === "string"
      ? body.destination.country.trim().toUpperCase().slice(0, 2)
      : "";
    if (country.length === 2) {
      patch.buyerCountry = country;
      const str = (v: unknown, max = 80): string | undefined => {
        if (typeof v !== "string") return undefined;
        const t = v.trim().slice(0, max);
        return t || undefined;
      };
      patch.buyerState = str(body.destination.state, 80)?.toUpperCase();
      patch.buyerCity = str(body.destination.city, 80);
      patch.buyerZip = str(body.destination.zip, 20);
      patch.buyerDestinationCapturedAt = new Date().toISOString();

      // ── Slice 47: auto-attach freight estimate ────────────────────
      // Now that we have a destination, call estimateLane() so the
      // resulting Transaction has freight cost ready to show. Best-
      // effort -- a freight failure does NOT block the accept.
      //
      // Origin: defaults to US for now since OutreachDraft doesn't
      // carry a supplier link. Slice 47.5 will pull from a future
      // Quote.supplierRegistryId field once quotes get supplier-aware.
      // Weight is approximated quantity * 0.5kg/unit (placeholder).
      try {
        const existingQuote = await store.getQuote(params.id);
        if (existingQuote) {
          const originCountry = "US"; // TODO slice 47.5: resolve via supplier
          const weightKg = Math.max(1, (existingQuote.quantity ?? 1) * 0.5);
          const quote = await estimateLane({
            originCountry,
            destCountry: country,
            destState: patch.buyerState as string | undefined,
            weightKg,
          });
          patch.freightEstimate = quote;
        }
      } catch (e) {
        console.warn(
          `[quote accept] freight estimate failed for ${params.id}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
  }

  const updated = await store.patchQuote(params.id, patch);
  if (!updated) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  // Auto-promote draft if quote is accepted/rejected. Skip for the
  // synthetic "manual:<random>" draftId from the bulk-quote builder
  // since there's no real Draft to update.
  if (body.status === "accepted" && !updated.draftId.startsWith("manual:")) {
    await store.patchDraft(updated.draftId, { dealStage: "Closed Won" });
  } else if (body.status === "rejected" && !updated.draftId.startsWith("manual:")) {
    await store.patchDraft(updated.draftId, { dealStage: "Closed Lost" });
  }
  return NextResponse.json({ ok: true, quote: updated });
}
