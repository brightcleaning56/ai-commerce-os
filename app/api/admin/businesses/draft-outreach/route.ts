import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runBusinessOutreach } from "@/lib/agents/businessOutreach";
import { isBusinessSuppressed, store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BUSINESSES_PER_BATCH = 25;

type PerBusinessOutcome =
  | { businessId: string; status: "drafted"; draftId: string; deduped: boolean }
  | { businessId: string; status: "skipped"; reason: string }
  | { businessId: string; status: "error"; error: string };

/**
 * POST /api/admin/businesses/draft-outreach
 *
 * Body: { businessIds: string[] }   (1..25)
 *
 * For each business id:
 *   1. Refuses if the business is suppressed (isBusinessSuppressed gate)
 *   2. Calls the Business Outreach Agent (Claude OR deterministic fallback)
 *   3. Saves an OutreachDraft (status: "draft") to the existing drafts store
 *   4. Marks the business status: "queued" and bumps outreachCount + lastDraftId
 *
 * Drafts land in /outreach where the operator reviews + sends via the
 * existing /api/drafts/send flow. NO email is sent by this endpoint —
 * drafts only. Send is a separate operator action so they can review
 * the AI's pitch before it leaves the building.
 *
 * Hard cap: 25 businesses per batch. Operator runs the action multiple
 * times for larger campaigns. Keeps Anthropic spend predictable and
 * each request well under the 60s function timeout.
 */
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: { businessIds?: unknown; pitchOverride?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.businessIds) || body.businessIds.length === 0) {
    return NextResponse.json(
      { error: "businessIds array required (1..25 items)" },
      { status: 400 },
    );
  }
  if (body.businessIds.length > MAX_BUSINESSES_PER_BATCH) {
    return NextResponse.json(
      { error: `Batch too large (${MAX_BUSINESSES_PER_BATCH} max). Split into smaller batches.` },
      { status: 400 },
    );
  }

  // Optional pitch override — used when the Brand Alternatives flow
  // bulk-drafts a specific "switch from X to Y" pitch instead of the
  // generic AVYN intro. All three fields required if present.
  type IncomingPitchOverride = {
    currentBrand?: unknown;
    alternative?: unknown;
    rationale?: unknown;
  };
  let pitchOverride: { currentBrand: string; alternative: string; rationale: string } | undefined;
  if (body.pitchOverride && typeof body.pitchOverride === "object") {
    const po = body.pitchOverride as IncomingPitchOverride;
    const currentBrand = typeof po.currentBrand === "string" ? po.currentBrand.trim() : "";
    const alternative = typeof po.alternative === "string" ? po.alternative.trim() : "";
    const rationale = typeof po.rationale === "string" ? po.rationale.trim() : "";
    if (!currentBrand || !alternative || !rationale) {
      return NextResponse.json(
        { error: "pitchOverride requires currentBrand, alternative, and rationale (all non-empty)" },
        { status: 400 },
      );
    }
    pitchOverride = { currentBrand, alternative, rationale: rationale.slice(0, 280) };
  }

  const ids: string[] = body.businessIds.filter((x): x is string => typeof x === "string");
  const outcomes: PerBusinessOutcome[] = [];
  const startedAt = new Date().toISOString();

  for (const id of ids) {
    const biz = await store.getBusiness(id);
    if (!biz) {
      outcomes.push({ businessId: id, status: "skipped", reason: "not found" });
      continue;
    }
    if (isBusinessSuppressed(biz)) {
      outcomes.push({
        businessId: id,
        status: "skipped",
        reason:
          biz.status === "do_not_contact"
            ? "do_not_contact"
            : biz.optedOutAt
              ? "opted out"
              : "suppressed",
      });
      continue;
    }
    if (!biz.email && !biz.phone) {
      outcomes.push({
        businessId: id,
        status: "skipped",
        reason: "no email or phone on record — cannot send",
      });
      continue;
    }

    try {
      const { draft, deduped } = await runBusinessOutreach(biz, { pitchOverride });

      // Mark business as queued + bump outreach metadata. We use
      // "queued" rather than "contacted" because the draft hasn't
      // sent yet — operator review + /api/drafts/send flips
      // status to "contacted" via the send-side patch (next slice
      // wires that callback; for now the operator can flip manually).
      await store.updateBusiness(biz.id, {
        status: biz.status === "won" ? biz.status : "queued", // never demote a closed business
        outreachCount: (biz.outreachCount ?? 0) + (deduped ? 0 : 1),
        lastDraftId: draft.id,
      });

      outcomes.push({
        businessId: id,
        status: "drafted",
        draftId: draft.id,
        deduped: !!deduped,
      });
    } catch (e) {
      outcomes.push({
        businessId: id,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const drafted = outcomes.filter((o) => o.status === "drafted").length;
  const skipped = outcomes.filter((o) => o.status === "skipped").length;
  const errored = outcomes.filter((o) => o.status === "error").length;

  return NextResponse.json({
    ok: true,
    startedAt,
    requested: ids.length,
    drafted,
    skipped,
    errored,
    outcomes,
  });
}
