import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth";
import { store } from "@/lib/store";
import { transitionTransaction } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/auto-release
 *
 * Released by the every-6h cron (or manually for testing). Finds
 * transactions in the `delivered` state whose `deliveredAt` is more than
 * AUTO_RELEASE_HOURS hours old and the buyer hasn't disputed → transitions
 * them through released → completed automatically.
 *
 * The platform shouldn't hold buyer funds indefinitely just because the
 * operator forgot to click Release. This is the same model Stripe Connect /
 * Shopify Markets / Etsy use: settle T+N if there's no dispute by then.
 *
 * Default window: 168 hours (7 days). Override via AUTO_RELEASE_HOURS env var.
 *
 * Auth: gated by `requireCron()` — accepts Authorization: Bearer ${CRON_SECRET}
 * (Netlify scheduled functions / Vercel cron / manual operator test).
 */
export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const hoursStr = process.env.AUTO_RELEASE_HOURS ?? "168";
  const hours = Math.max(1, Number(hoursStr) || 168);
  const cutoff = Date.now() - hours * 60 * 60 * 1000;

  const transactions = await store.getTransactions();
  const eligible = transactions.filter((t) => {
    if (t.state !== "delivered") return false;
    if (!t.deliveredAt) return false;
    const ts = new Date(t.deliveredAt).getTime();
    if (!Number.isFinite(ts)) return false;
    return ts <= cutoff;
  });

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const t of eligible) {
    try {
      await transitionTransaction({
        id: t.id,
        to: "released",
        actor: "system",
        detail: `Auto-released after ${hours}h post-delivery (no dispute raised)`,
        patch: {
          escrowReleasedAt: new Date().toISOString(),
          escrowReleaseAuthorizedBy: "auto",
        },
      });
      await transitionTransaction({
        id: t.id,
        to: "completed",
        actor: "system",
        detail: "Transaction completed (auto-released)",
      });
      results.push({ id: t.id, ok: true });
    } catch (e) {
      results.push({
        id: t.id,
        ok: false,
        error: e instanceof Error ? e.message : "Auto-release failed",
      });
    }
  }

  const released = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return NextResponse.json({
    ok: true,
    cutoffHours: hours,
    eligibleCount: eligible.length,
    released,
    failed,
    results,
  });
}
