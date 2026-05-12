import { sendEmail } from "@/lib/email";
import { getOperator } from "@/lib/operator";
import type { OutreachJob } from "@/lib/store";

/**
 * Notify the operator when an OutreachJob finishes. Lets them queue a
 * 100-business campaign and walk away — they'll get a summary email
 * with counts + a /outreach link when the cron finishes drafting.
 *
 * Uses skipFooter:true because this is internal transactional mail to
 * the operator themselves — not subject to CAN-SPAM since the operator
 * has explicit account access and didn't unsubscribe from their own
 * dashboard.
 *
 * Best-effort by design: errors are caught + logged in the cron caller;
 * this function should never throw. If sendEmail fails (Postmark
 * pending approval, etc.) the operator still sees the completed
 * status in /admin/outreach-jobs.
 */
export async function sendJobCompletionEmail(job: OutreachJob): Promise<void> {
  const op = getOperator();
  if (!op.email) return;

  const totalRequested = job.businessIds.length;
  const label = job.campaignLabel ?? `Bulk outreach (${totalRequested} businesses)`;
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || "https://avyncommerce.com";

  const lines: string[] = [
    `Your outreach job is done.`,
    ``,
    `Campaign: ${label}`,
    ``,
    `Results:`,
    `  Drafted:  ${job.stats.drafted}`,
    `  Skipped:  ${job.stats.skipped}`,
    `  Errored:  ${job.stats.errored}`,
    `  Total:    ${totalRequested}`,
    ``,
  ];

  if (job.pitchOverride) {
    lines.push(
      `Pitch angle: Switch ${job.pitchOverride.currentBrand} → ${job.pitchOverride.alternative}`,
      `  "${job.pitchOverride.rationale}"`,
      ``,
    );
  }

  if (job.stats.errored > 0) {
    // Surface up to 5 distinct error messages so the operator can spot
    // patterns at a glance without opening the dashboard.
    const errors = job.outcomes
      .filter((o): o is typeof o & { status: "error" } => o.status === "error")
      .map((o) => o.error)
      .slice(0, 5);
    if (errors.length > 0) {
      lines.push(`First ${errors.length} error${errors.length === 1 ? "" : "s"}:`);
      for (const e of errors) lines.push(`  - ${e.slice(0, 120)}`);
      lines.push(``);
    }
  }

  if (job.stats.skipped > 0) {
    // Count skip reasons (suppressed, no-email, etc.) so operator sees
    // suppression-list hits at a glance.
    const reasons: Record<string, number> = {};
    for (const o of job.outcomes) {
      if (o.status === "skipped") {
        reasons[o.reason] = (reasons[o.reason] ?? 0) + 1;
      }
    }
    const top = Object.entries(reasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (top.length > 0) {
      lines.push(`Skip reasons:`);
      for (const [reason, count] of top) lines.push(`  ${count}× ${reason}`);
      lines.push(``);
    }
  }

  lines.push(
    `Next step: review drafts at ${origin}/outreach`,
    `Job detail: ${origin}/admin/outreach-jobs`,
    ``,
    `— AVYN Commerce cron`,
  );

  try {
    await sendEmail({
      to: op.email,
      subject: `Done · ${job.stats.drafted} drafted for "${label}"`,
      textBody: lines.join("\n"),
      // Internal mail to operator → skip the CAN-SPAM footer.
      skipFooter: true,
      metadata: {
        kind: "outreach-job-completed",
        jobId: job.id,
      },
    });
  } catch (e) {
    // Cron caller logs + swallows — function should never throw.
    if (typeof console !== "undefined") {
      console.warn(
        `[jobCompletionEmail] send failed for job ${job.id}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
}
