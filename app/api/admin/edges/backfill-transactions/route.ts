import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { observeTransactionEdge } from "@/lib/businessFromTransaction";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/edges/backfill-transactions
 *
 * Walk every transaction that's already settled (state in released or
 * completed) and observe a supply edge for it. Idempotent â€” re-running
 * just bumps lastSeenAt on each edge.
 *
 * Use this once after the slice 5 deploy to seed the graph with
 * existing closed deals. From then on, the transitionTransaction hook
 * handles new transactions automatically.
 *
 * Caps:
 *   - 500 transactions per run (keeps under 60s function timeout)
 *   - Operator can re-run if there's more to process
 */
const MAX_PER_RUN = 500;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const startedAt = new Date().toISOString();
  const txns = await store.getTransactions();
  const settled = txns.filter((t) => t.state === "released" || t.state === "completed");
  const slice = settled.slice(0, MAX_PER_RUN);

  let observed = 0;
  let skipped = 0;
  const skipReasons: Record<string, number> = {};

  for (const t of slice) {
    try {
      const r = await observeTransactionEdge(t);
      if (r.ok) {
        observed += 1;
      } else {
        skipped += 1;
        const reason = r.reason ?? "unknown";
        skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
      }
    } catch (e) {
      skipped += 1;
      const reason = e instanceof Error ? e.message : "error";
      skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
    }
  }

  return NextResponse.json({
    ok: true,
    startedAt,
    totalSettled: settled.length,
    scanned: slice.length,
    observed,
    skipped,
    skipReasons,
    truncated: settled.length > MAX_PER_RUN,
  });
}
