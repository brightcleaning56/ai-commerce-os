import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth";
import { cadenceQueueItemsStore } from "@/lib/cadences";
import { checkKillSwitch } from "@/lib/killSwitch";
import { isSlackConfigured, sendSlack } from "@/lib/slack";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cronRunId(): string {
  return `cron_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Cron-triggered Slack digest for cadence items that have been pending
 * approval longer than the operator-tolerable window.
 *
 * Defaults:
 *   STALE_APPROVAL_HOURS = 24 (configurable via env)
 *   APP_ORIGIN -> falls back through NEXT_PUBLIC_APP_ORIGIN / URL /
 *                 DEPLOY_PRIME_URL so the digest links work in any env
 *
 * Skip conditions:
 *   - CRON_ENABLED=false
 *   - Kill switch active
 *   - SLACK_WEBHOOK_URL not configured (logs the count, returns ok)
 *   - Zero stale items
 *
 * Auth: same Bearer-CRON_SECRET pattern as other cron endpoints.
 *
 * Scheduled by netlify/functions/cron-stale-approvals.mjs (hourly).
 */
export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  if (process.env.CRON_ENABLED === "false") {
    return NextResponse.json({ ok: true, skipped: true, reason: "CRON_ENABLED=false" });
  }

  const tickStart = Date.now();
  const startedAt = new Date().toISOString();

  const ks = await checkKillSwitch();
  if (ks.killed) {
    await store.saveCronRun({
      id: cronRunId(),
      kind: "stale-approvals",
      ranAt: startedAt,
      durationMs: Date.now() - tickStart,
      status: "skipped",
      summary: "kill-switch active",
    });
    return NextResponse.json({ ok: true, skipped: true, reason: "kill-switch-active" });
  }

  const hoursRaw = Number.parseFloat(process.env.STALE_APPROVAL_HOURS ?? "24");
  const staleHours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? hoursRaw : 24;
  const cutoffMs = Date.now() - staleHours * 60 * 60 * 1000;

  const items = await cadenceQueueItemsStore.list();
  const stale = items.filter(
    (i) =>
      i.status === "pending" &&
      i.requiresApproval &&
      new Date(i.createdAt).getTime() <= cutoffMs,
  );

  if (stale.length === 0) {
    await store.saveCronRun({
      id: cronRunId(),
      kind: "stale-approvals",
      ranAt: startedAt,
      durationMs: Date.now() - tickStart,
      status: "skipped",
      summary: "no stale approvals",
    });
    return NextResponse.json({ ok: true, stale: 0 });
  }

  if (!isSlackConfigured()) {
    await store.saveCronRun({
      id: cronRunId(),
      kind: "stale-approvals",
      ranAt: startedAt,
      durationMs: Date.now() - tickStart,
      status: "skipped",
      summary: `${stale.length} stale -- Slack not configured`,
    });
    return NextResponse.json({
      ok: true,
      stale: stale.length,
      slackConfigured: false,
      note: "Set SLACK_WEBHOOK_URL to enable the digest.",
    });
  }

  // Group by cadence + channel for the digest
  const byCadence = new Map<string, typeof stale>();
  for (const item of stale) {
    const key = item.cadenceName;
    if (!byCadence.has(key)) byCadence.set(key, []);
    byCadence.get(key)!.push(item);
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    "https://avyncommerce.com";
  const queueUrl = `${origin}/queue`;

  const oldestMs = Math.min(...stale.map((i) => new Date(i.createdAt).getTime()));
  const oldestHours = Math.round((Date.now() - oldestMs) / (60 * 60 * 1000));

  const lines: string[] = [
    `*${stale.length} cadence touch${stale.length === 1 ? "" : "es"}* pending approval > ${staleHours}h`,
    "",
  ];
  for (const [cadenceName, group] of byCadence.entries()) {
    const channelCounts = group.reduce(
      (acc, i) => {
        acc[i.channel] = (acc[i.channel] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    const cParts = Object.entries(channelCounts)
      .map(([c, n]) => `${n} ${c}`)
      .join(" · ");
    lines.push(`• *${cadenceName}* — ${group.length} item${group.length === 1 ? "" : "s"} (${cParts})`);
  }
  lines.push("");
  lines.push(`Oldest is ${oldestHours}h old. Review at <${queueUrl}|/queue · Needs approval>`);

  const text = lines.join("\n");

  const slack = await sendSlack({
    text: `${stale.length} cadence touches pending approval > ${staleHours}h`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🛑 Approvals piling up" },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Cron tick · ${new Date(startedAt).toLocaleString()} · workspace approval policy is gating these.`,
          },
        ],
      },
    ],
    username: "AVYN Approvals",
    iconEmoji: ":lock:",
  });

  await store.saveCronRun({
    id: cronRunId(),
    kind: "stale-approvals",
    ranAt: startedAt,
    durationMs: Date.now() - tickStart,
    status: slack.ok ? "success" : "error",
    summary: `${stale.length} stale${slack.ok ? " · slacked" : ` · slack failed: ${slack.errorMessage}`}`,
  });

  return NextResponse.json({
    ok: slack.ok,
    stale: stale.length,
    slack: slack.ok,
    errorMessage: slack.errorMessage,
  });
}
