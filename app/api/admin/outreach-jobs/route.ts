import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { store, type OutreachJob } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BUSINESSES_PER_JOB = 1000;
const DEFAULT_BATCH_SIZE = 25;

/**
 * GET /api/admin/outreach-jobs — list recent jobs, newest first
 * (active jobs always pinned to top via store sort order).
 */
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const jobs = await store.getOutreachJobs();
  // Strip the full businessIds + outcomes arrays from the list view —
  // they can be 1000-item arrays each. Per-job detail endpoint returns
  // the full record.
  const summary = jobs.map((j) => ({
    id: j.id,
    createdAt: j.createdAt,
    createdBy: j.createdBy,
    status: j.status,
    campaignLabel: j.campaignLabel,
    total: j.businessIds.length,
    processed: j.outcomes.length,
    stats: j.stats,
    startedAt: j.startedAt,
    completedAt: j.completedAt,
    cancelledAt: j.cancelledAt,
    lastTickAt: j.lastTickAt,
    pitchOverride: j.pitchOverride,
  }));

  return NextResponse.json({ jobs: summary });
}

/**
 * POST /api/admin/outreach-jobs — queue a new bulk-draft job.
 *
 * Body:
 *   businessIds      string[]  (1..1000)
 *   pitchOverride?   { currentBrand, alternative, rationale }
 *   campaignLabel?   string    (operator label, default derived)
 *   batchSize?       number    (default 25)
 *
 * Returns the created job. Cron picks it up within ~5 min.
 */
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: {
    businessIds?: unknown;
    pitchOverride?: unknown;
    campaignLabel?: unknown;
    batchSize?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.businessIds) || body.businessIds.length === 0) {
    return NextResponse.json(
      { error: "businessIds array required (1..1000 items)" },
      { status: 400 },
    );
  }
  if (body.businessIds.length > MAX_BUSINESSES_PER_JOB) {
    return NextResponse.json(
      { error: `Too many businesses per job (${MAX_BUSINESSES_PER_JOB} max). Split into separate jobs.` },
      { status: 400 },
    );
  }
  const businessIds = body.businessIds.filter((x): x is string => typeof x === "string");
  // De-dupe within the job — same business in twice would draft once
  // anyway (dedupe via productName), but we save a wasted cycle.
  const dedupedIds = Array.from(new Set(businessIds));

  // Pitch override validation — same shape as /draft-outreach
  let pitchOverride: OutreachJob["pitchOverride"];
  if (body.pitchOverride && typeof body.pitchOverride === "object") {
    const po = body.pitchOverride as { currentBrand?: unknown; alternative?: unknown; rationale?: unknown };
    const currentBrand = typeof po.currentBrand === "string" ? po.currentBrand.trim() : "";
    const alternative = typeof po.alternative === "string" ? po.alternative.trim() : "";
    const rationale = typeof po.rationale === "string" ? po.rationale.trim() : "";
    if (!currentBrand || !alternative || !rationale) {
      return NextResponse.json(
        { error: "pitchOverride requires currentBrand, alternative, and rationale" },
        { status: 400 },
      );
    }
    pitchOverride = { currentBrand, alternative, rationale: rationale.slice(0, 280) };
  }

  const batchSizeRaw =
    typeof body.batchSize === "number" ? Math.floor(body.batchSize) : DEFAULT_BATCH_SIZE;
  const batchSize = Math.max(1, Math.min(batchSizeRaw, 25));

  const campaignLabel =
    typeof body.campaignLabel === "string" && body.campaignLabel.trim()
      ? body.campaignLabel.trim().slice(0, 120)
      : pitchOverride
        ? `Switch ${pitchOverride.currentBrand} → ${pitchOverride.alternative}`
        : `Bulk outreach · ${dedupedIds.length} businesses`;

  const op = getOperator();
  const job: OutreachJob = {
    id: `job_${crypto.randomBytes(8).toString("hex")}`,
    createdAt: new Date().toISOString(),
    createdBy: op.email,
    status: "pending",
    businessIds: dedupedIds,
    pitchOverride,
    batchSize,
    outcomes: [],
    campaignLabel,
    stats: { drafted: 0, skipped: 0, errored: 0 },
  };
  await store.addOutreachJob(job);

  return NextResponse.json({ ok: true, job });
}
