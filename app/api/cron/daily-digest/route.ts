import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { getOperator } from "@/lib/operator";
import { store } from "@/lib/store";
import { getRevenueStats } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/daily-digest — emails the operator a morning summary.
 *
 * Bundled into one email instead of N transactional emails so the operator
 * can scan their inbox once and know whether the platform needs attention
 * today. Mirrors what the dashboard's "Needs Attention" panel surfaces, but
 * also includes a 24h activity rollup ("yesterday: 5 transactions reached
 * escrow, 1 dispute opened, $12K platform fees collected") so the operator
 * can spot patterns over time without opening the app.
 *
 * Schedule: daily at 9am UTC via cron-daily-digest scheduled function
 * (configured in netlify.toml).
 *
 * Skipped automatically when:
 *   - CRON_ENABLED=false
 *   - Nothing happened in the last 24h AND no items need attention
 *     (no point spamming the operator with empty digests)
 */
export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  if (process.env.CRON_ENABLED === "false") {
    return NextResponse.json({ ok: true, skipped: true, reason: "CRON_ENABLED=false" });
  }

  const op = getOperator();
  if (!op.email) {
    return NextResponse.json({ ok: true, skipped: true, reason: "No operator email configured" });
  }

  const now = Date.now();
  const dayAgoIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const [drafts, transactions, runs, riskFlags, revenue] = await Promise.all([
    store.getDrafts(),
    store.getTransactions(),
    store.getRuns(),
    store.getRiskFlags(),
    getRevenueStats(),
  ]);

  // ── Yesterday rollup ────────────────────────────────────────────────
  const runsYesterday = runs.filter((r) => r.startedAt >= dayAgoIso);
  const successfulRunsYesterday = runsYesterday.filter((r) => r.status === "success").length;
  const failedRunsYesterday = runsYesterday.length - successfulRunsYesterday;
  const draftsCreatedYesterday = drafts.filter((d) => d.createdAt >= dayAgoIso).length;
  const draftsSentYesterday = drafts.filter(
    (d) => d.status === "sent" && (d as any).sentAt && (d as any).sentAt >= dayAgoIso,
  ).length;
  const txnsCreatedYesterday = transactions.filter((t) => t.createdAt >= dayAgoIso).length;
  const txnsCompletedYesterday = transactions.filter(
    (t) => (t.state === "completed" || t.state === "released") && (t.escrowReleasedAt ?? "") >= dayAgoIso,
  ).length;
  const disputesOpenedYesterday = transactions.filter(
    (t) => (t.disputedAt ?? "") >= dayAgoIso,
  ).length;
  const flagsRaisedYesterday = riskFlags.filter((f) => f.createdAt >= dayAgoIso).length;
  const platformFeesYesterdayCents = (revenue as any).byMonth?.length
    ? Math.round(revenue.netPlatformRevenueCents / 30)  // very rough monthly→daily proration
    : 0;

  // ── Needs attention buckets (mirrors /api/dashboard/attention) ─────
  const pendingDrafts = drafts.filter((d) => d.status === "draft").length;
  const escrowHeld = transactions.filter((t) => t.state === "escrow_held").length;
  const delivered = transactions.filter((t) => t.state === "delivered");
  const autoReleaseHours = Math.max(1, Number(process.env.AUTO_RELEASE_HOURS ?? "168") || 168);
  const closingThresholdMs = 24 * 60 * 60 * 1000;
  const autoReleaseMs = autoReleaseHours * 60 * 60 * 1000;
  const closingSoon = delivered.filter((t) => {
    if (!t.deliveredAt) return false;
    const remaining = autoReleaseMs - (now - new Date(t.deliveredAt).getTime());
    return remaining > 0 && remaining < closingThresholdMs;
  }).length;
  const disputed = transactions.filter((t) => t.state === "disputed").length;
  const criticalRisk = riskFlags.filter(
    (f) => f.severity === "Critical" || f.severity === "High",
  ).length;

  // Skip empty digests — nothing to say is better than spam
  const hasYesterdayActivity =
    runsYesterday.length > 0 ||
    draftsCreatedYesterday > 0 ||
    txnsCreatedYesterday > 0 ||
    disputesOpenedYesterday > 0;
  const hasAttention =
    pendingDrafts > 0 || escrowHeld > 0 || closingSoon > 0 || disputed > 0 || criticalRisk > 0;

  if (!hasYesterdayActivity && !hasAttention) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "No activity yesterday and nothing needs attention — empty digest skipped",
    });
  }

  // ── Compose the email ──────────────────────────────────────────────
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || "https://avyncommerce.com";
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const lines: string[] = [];
  lines.push(`Good morning ${op.name.split(" ")[0]},`);
  lines.push(``);
  lines.push(`Here's what happened in your AVYN workspace yesterday and what needs you today.`);
  lines.push(``);

  // Yesterday section — only if anything happened
  if (hasYesterdayActivity) {
    lines.push(`── Yesterday (last 24h) ──────────────────────────────`);
    if (runsYesterday.length > 0) {
      lines.push(`  · ${runsYesterday.length} agent run${runsYesterday.length === 1 ? "" : "s"} (${successfulRunsYesterday} success${failedRunsYesterday > 0 ? `, ${failedRunsYesterday} failed` : ""})`);
    }
    if (draftsCreatedYesterday > 0) {
      lines.push(`  · ${draftsCreatedYesterday} new draft${draftsCreatedYesterday === 1 ? "" : "s"} from outreach`);
    }
    if (draftsSentYesterday > 0) {
      lines.push(`  · ${draftsSentYesterday} outreach email${draftsSentYesterday === 1 ? "" : "s"} sent`);
    }
    if (txnsCreatedYesterday > 0) {
      lines.push(`  · ${txnsCreatedYesterday} new transaction${txnsCreatedYesterday === 1 ? "" : "s"} opened`);
    }
    if (txnsCompletedYesterday > 0) {
      lines.push(`  · ${txnsCompletedYesterday} transaction${txnsCompletedYesterday === 1 ? "" : "s"} completed`);
    }
    if (disputesOpenedYesterday > 0) {
      lines.push(`  · ⚠ ${disputesOpenedYesterday} dispute${disputesOpenedYesterday === 1 ? "" : "s"} opened`);
    }
    if (flagsRaisedYesterday > 0) {
      lines.push(`  · ⚠ ${flagsRaisedYesterday} risk flag${flagsRaisedYesterday === 1 ? "" : "s"} raised`);
    }
    if (platformFeesYesterdayCents > 0) {
      lines.push(`  · ~$${(platformFeesYesterdayCents / 100).toFixed(0)} platform fees recognized`);
    }
    lines.push(``);
  }

  // Attention section
  if (hasAttention) {
    lines.push(`── Needs your attention today ────────────────────────`);
    if (criticalRisk > 0) {
      lines.push(`  ! ${criticalRisk} critical/high risk flag${criticalRisk === 1 ? "" : "s"}`);
      lines.push(`    → ${origin}/risk`);
    }
    if (disputed > 0) {
      lines.push(`  ! ${disputed} dispute${disputed === 1 ? "" : "s"} need resolution`);
      lines.push(`    → ${origin}/transactions`);
    }
    if (closingSoon > 0) {
      lines.push(`  ! ${closingSoon} delivered transaction${closingSoon === 1 ? "" : "s"} auto-release in <24h`);
      lines.push(`    → ${origin}/transactions`);
    }
    if (pendingDrafts > 0) {
      lines.push(`  · ${pendingDrafts} draft${pendingDrafts === 1 ? "" : "s"} awaiting approval`);
      lines.push(`    → ${origin}/approvals${pendingDrafts >= 5 ? " (j/k/a/s shortcuts available)" : ""}`);
    }
    if (escrowHeld > 0) {
      lines.push(`  · ${escrowHeld} transaction${escrowHeld === 1 ? "" : "s"} ready to ship`);
      lines.push(`    → ${origin}/transactions`);
    }
    lines.push(``);
  } else if (hasYesterdayActivity) {
    lines.push(`── Inbox zero ────────────────────────────────────────`);
    lines.push(`  No drafts to approve, no transactions waiting, no risk flags.`);
    lines.push(`  Take a breath.`);
    lines.push(``);
  }

  lines.push(`Open the dashboard: ${origin}`);
  lines.push(``);
  lines.push(`— AVYN Daily Digest`);
  lines.push(`(To pause these, set CRON_ENABLED=false or remove cron-daily-digest from netlify.toml)`);

  const result = await sendEmail({
    to: op.email,
    subject: `AVYN · ${today} digest${hasAttention ? ` · ${[criticalRisk + disputed + closingSoon, pendingDrafts, escrowHeld].reduce((s, x) => s + x, 0)} need you` : ""}`,
    textBody: lines.join("\n"),
    metadata: { kind: "daily-digest" },
  });

  return NextResponse.json({
    ok: true,
    sent: result.ok,
    simulated: result.simulated ?? false,
    provider: result.provider,
    to: result.sentTo,
    yesterday: {
      runs: runsYesterday.length,
      drafts: draftsCreatedYesterday,
      transactions: txnsCreatedYesterday,
      completed: txnsCompletedYesterday,
      disputes: disputesOpenedYesterday,
    },
    attention: {
      pendingDrafts,
      escrowHeld,
      closingSoon,
      disputed,
      criticalRisk,
    },
  });
}
