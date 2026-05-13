import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runBusinessProfileScan } from "@/lib/agents/businessProfile";
import { checkKillSwitch } from "@/lib/killSwitch";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BATCH = 10;

type Outcome =
  | { businessId: string; status: "scanned"; confidence: number; fetchedUrl?: string; productsFound: number }
  | { businessId: string; status: "skipped"; reason: string }
  | { businessId: string; status: "error"; error: string };

/**
 * POST /api/admin/businesses/profile-batch
 * Body: { businessIds: string[] }   (1..10)
 *
 * Runs the Business Profile Agent against each id. Smaller batch cap
 * than draft-outreach (10 vs 25) because each scan involves a homepage
 * fetch (up to 10s) plus a Claude call â€” staying under the 60s function
 * timeout requires keeping batches modest.
 *
 * Per business:
 *   - 404 â†’ status "skipped" reason "not found"
 *   - No website on record â†’ status "skipped" reason "no website"
 *   - Otherwise â†’ run the scan, persist aiProfile, return short summary
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const ks = await checkKillSwitch();
  if (ks.killed) {
    return NextResponse.json(
      { error: `Agents paused: ${ks.state.reason ?? "kill switch active"}. Resume at /admin.` },
      { status: 503 },
    );
  }

  let body: { businessIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.businessIds) || body.businessIds.length === 0) {
    return NextResponse.json(
      { error: "businessIds array required (1..10 items)" },
      { status: 400 },
    );
  }
  if (body.businessIds.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Batch too large (${MAX_BATCH} max). Split into smaller batches.` },
      { status: 400 },
    );
  }

  const ids: string[] = body.businessIds.filter((x): x is string => typeof x === "string");
  const outcomes: Outcome[] = [];
  const startedAt = new Date().toISOString();

  for (const id of ids) {
    const biz = await store.getBusiness(id);
    if (!biz) {
      outcomes.push({ businessId: id, status: "skipped", reason: "not found" });
      continue;
    }
    if (!biz.website) {
      outcomes.push({ businessId: id, status: "skipped", reason: "no website on record" });
      continue;
    }
    try {
      const { profile, fetchedUrl } = await runBusinessProfileScan(biz);
      outcomes.push({
        businessId: id,
        status: "scanned",
        confidence: profile?.confidence ?? 0,
        fetchedUrl,
        productsFound: profile?.productsSold.length ?? 0,
      });
    } catch (e) {
      outcomes.push({
        businessId: id,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const scanned = outcomes.filter((o) => o.status === "scanned").length;
  const skipped = outcomes.filter((o) => o.status === "skipped").length;
  const errored = outcomes.filter((o) => o.status === "error").length;

  return NextResponse.json({
    ok: true,
    startedAt,
    requested: ids.length,
    scanned,
    skipped,
    errored,
    outcomes,
  });
}
