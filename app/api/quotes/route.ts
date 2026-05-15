import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireCapability } from "@/lib/auth";
import { teamPrefs } from "@/lib/teamPrefs";
import { expiryFromTtlHours, genShareToken } from "@/lib/shareTokens";
import { store, type Quote } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ quotes: await store.getQuotes() });
}

/**
 * POST /api/quotes — bulk-quote creation from the manual builder on
 * /deals. Creates ONE Quote record per line item so each line gets
 * its own shareable buyer link + lifecycle.
 *
 * Body:
 *   {
 *     buyerCompany: string,
 *     buyerName: string,
 *     paymentTerms?: string,    // default "Net 30"
 *     shippingTerms?: string,   // default "FOB Origin"
 *     validForDays?: number,    // default 14
 *     discountPct?: number,     // 0-100, applied to each line's subtotal
 *     shippingCents?: number,   // total shipping; split pro-rata across lines
 *     notes?: string,
 *     lines: Array<{
 *       product: string,
 *       sku?: string,
 *       qty: number,
 *       price: number,    // unit price in dollars
 *     }>,
 *   }
 *
 * Response: { ok, quotes: Quote[] } — each entry includes shareToken
 * the operator can paste into the buyer's email.
 *
 * Capability: deals:write. Same gate as outreach drafts → quotes.
 */
const DEFAULT_PAYMENT_TERMS = "Net 30";
const DEFAULT_SHIPPING_TERMS = "FOB Origin";
const DEFAULT_VALID_DAYS = 14;

export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "deals:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const buyerCompany = typeof body.buyerCompany === "string" ? body.buyerCompany.trim().slice(0, 200) : "";
  const buyerName = typeof body.buyerName === "string" ? body.buyerName.trim().slice(0, 200) : "";
  if (!buyerCompany) return NextResponse.json({ error: "buyerCompany is required" }, { status: 400 });
  if (!buyerName) return NextResponse.json({ error: "buyerName is required" }, { status: 400 });

  const linesRaw = Array.isArray(body.lines) ? body.lines : [];
  const lines = linesRaw
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .map((l) => ({
      product: typeof l.product === "string" ? l.product.trim().slice(0, 200) : "",
      sku: typeof l.sku === "string" ? l.sku.trim().slice(0, 80) : undefined,
      qty: typeof l.qty === "number" && l.qty > 0 ? Math.round(l.qty) : 0,
      price: typeof l.price === "number" && l.price >= 0 ? l.price : 0,
    }))
    .filter((l) => l.product && l.qty > 0);
  if (lines.length === 0) {
    return NextResponse.json(
      { error: "At least one line item with product + qty > 0 is required" },
      { status: 400 },
    );
  }

  const paymentTerms = typeof body.paymentTerms === "string" && body.paymentTerms.trim()
    ? body.paymentTerms.trim().slice(0, 80)
    : DEFAULT_PAYMENT_TERMS;
  const shippingTerms = typeof body.shippingTerms === "string" && body.shippingTerms.trim()
    ? body.shippingTerms.trim().slice(0, 80)
    : DEFAULT_SHIPPING_TERMS;
  const validForDays = typeof body.validForDays === "number" && body.validForDays > 0
    ? Math.min(180, Math.max(1, Math.round(body.validForDays)))
    : DEFAULT_VALID_DAYS;
  const discountPct = typeof body.discountPct === "number" && body.discountPct >= 0
    ? Math.min(100, body.discountPct)
    : 0;
  const totalShippingCents = typeof body.shippingCents === "number" && body.shippingCents >= 0
    ? Math.round(body.shippingCents)
    : 0;
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : undefined;
  const overrideCap = body.overrideCap === true;
  // Slice 53: optional supplierRegistryId from the operator -- when
  // set, slice-47 freight estimator (at quote-accept time) uses the
  // supplier's country/state as origin instead of defaulting to US.
  const supplierRegistryId =
    typeof body.supplierRegistryId === "string" && body.supplierRegistryId.trim()
      ? body.supplierRegistryId.trim().slice(0, 80)
      : undefined;

  // ── Slice 33: per-teammate quote / discount cap enforcement ──────
  // Sums every line's subtotal (qty * price) + shipping to compute
  // the total quote value, then checks against this teammate's
  // team-prefs (slice 3 onboarding answers). Owner / non-team
  // sessions bypass entirely (no email -> no pref lookup).
  // overrideCap=true in the body skips the gate (operator explicitly
  // chose to exceed the cap; logged via the audit trail later).
  if (!overrideCap && "user" in auth && auth.user?.email) {
    const pref = await teamPrefs.getByEmail(auth.user.email).catch(() => null);
    if (pref) {
      const totalDollars = lines.reduce((s, l) => s + l.qty * l.price, 0)
        + (totalShippingCents / 100);
      if (
        pref.quoteApprovalCap != null &&
        pref.quoteApprovalCap > 0 &&
        totalDollars > pref.quoteApprovalCap
      ) {
        return NextResponse.json(
          {
            error: `Quote total $${totalDollars.toFixed(2)} exceeds your approval cap of $${pref.quoteApprovalCap}. Set overrideCap:true to send to /approvals queue, or have the workspace owner raise your cap on /admin/team-prefs.`,
            gatedBy: "team-prefs-quote-cap",
            cap: pref.quoteApprovalCap,
            attempted: totalDollars,
          },
          { status: 412 },
        );
      }
      if (
        pref.discountCap != null &&
        pref.discountCap > 0 &&
        discountPct > pref.discountCap
      ) {
        return NextResponse.json(
          {
            error: `Discount ${discountPct}% exceeds your approval cap of ${pref.discountCap}%. Set overrideCap:true to send to /approvals queue, or have the workspace owner raise your cap.`,
            gatedBy: "team-prefs-discount-cap",
            cap: pref.discountCap,
            attempted: discountPct,
          },
          { status: 412 },
        );
      }
    }
  }

  const leadTimeDays = typeof body.leadTimeDays === "number" && body.leadTimeDays > 0
    ? Math.min(365, Math.max(1, Math.round(body.leadTimeDays)))
    : 14;

  // Synthetic draft id ties all lines from the same submission
  // together. The Quote schema requires `draftId` because quotes
  // normally come from accepted outreach drafts; for the manual
  // builder we mint a "manual:<random>" sentinel so we can later
  // trace these back to the bulk session that created them.
  const draftId = `manual:${crypto.randomBytes(6).toString("hex")}`;
  const now = new Date().toISOString();
  const sumQty = lines.reduce((s, l) => s + l.qty, 0) || 1;

  const created: Quote[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const subtotal = +(line.qty * line.price).toFixed(2);
    const discountAmount = +((subtotal * discountPct) / 100).toFixed(2);
    // Split shipping pro-rata by quantity so each line's total is
    // proportional. Operator sees the same combined total they typed
    // in the builder when they sum the per-line totals.
    const lineShippingCents = i === lines.length - 1
      // Round-trip the last line's share so totals reconcile to the
      // exact shippingCents the operator entered (no penny drift).
      ? totalShippingCents - lines.slice(0, -1).reduce(
          (s, l) => s + Math.round((totalShippingCents * l.qty) / sumQty),
          0,
        )
      : Math.round((totalShippingCents * line.qty) / sumQty);
    const total = +(subtotal - discountAmount + lineShippingCents / 100).toFixed(2);

    const quote: Quote = {
      id: `q_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`,
      createdAt: now,
      draftId,
      buyerCompany,
      buyerName,
      productName: line.product,
      unitPrice: line.price,
      quantity: line.qty,
      subtotal,
      discountPct,
      discountAmount,
      total,
      currency: "USD",
      paymentTerms,
      leadTimeDays,
      validForDays,
      shippingTerms,
      notes,
      status: "draft",
      shareToken: genShareToken(),
      shareExpiresAt: expiryFromTtlHours(validForDays * 24),
      modelUsed: "manual-bulk-builder",
      usedFallback: true,
      generatedRationale: `Created via the manual bulk-quote builder by ${
        auth.user ? auth.user.email : "owner"
      }${notes ? ` — operator note: ${notes}` : ""}`,
      supplierRegistryId,
    };
    await store.saveQuote(quote);
    created.push(quote);
  }

  return NextResponse.json({ ok: true, quotes: created });
}
