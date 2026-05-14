/**
 * Minimal Slack webhook helper.
 *
 * Activates when SLACK_WEBHOOK_URL env is set (Incoming Webhooks
 * URL from a Slack app). When unset, send() returns
 * { ok: false, simulated: true } so callers can detect the no-op
 * without throwing.
 *
 * Why a separate file instead of a generic notifications layer:
 *   - Slack is currently the only push channel we have for operator
 *     alerts (in-app toasts cover the live-session case)
 *   - Webhook URL is a single env var with no per-tenant config to
 *     manage; the abstraction stays tiny
 *   - When we add Discord / MS Teams / PagerDuty later, we'll lift
 *     this into a notify(channel, ...) router rather than retrofit
 *     the slack call sites
 *
 * Node-only (uses fetch with arbitrary headers).
 */

export type SlackBlock =
  | { type: "header"; text: { type: "plain_text"; text: string } }
  | { type: "section"; text: { type: "mrkdwn"; text: string }; accessory?: unknown }
  | { type: "context"; elements: Array<{ type: "mrkdwn" | "plain_text"; text: string }> }
  | { type: "divider" };

export type SendSlackInput = {
  /** Plain-text fallback shown in notifications (required by Slack). */
  text: string;
  /** Optional rich blocks (https://api.slack.com/block-kit). When
   *  omitted, only the plain text renders. */
  blocks?: SlackBlock[];
  /** Override the username Slack displays (per-message). Useful for
   *  distinguishing e.g. "AVYN Cron" vs "AVYN Approvals" without
   *  separate webhook URLs. */
  username?: string;
  /** Emoji icon override (per-message). */
  iconEmoji?: string;
};

export type SendSlackResult = {
  ok: boolean;
  simulated?: boolean;
  errorMessage?: string;
  status?: number;
};

export function isSlackConfigured(): boolean {
  return !!process.env.SLACK_WEBHOOK_URL;
}

export async function sendSlack(input: SendSlackInput): Promise<SendSlackResult> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) {
    return { ok: false, simulated: true, errorMessage: "SLACK_WEBHOOK_URL not configured" };
  }

  const payload: Record<string, unknown> = { text: input.text };
  if (input.blocks) payload.blocks = input.blocks;
  if (input.username) payload.username = input.username;
  if (input.iconEmoji) payload.icon_emoji = input.iconEmoji;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        errorMessage: `Slack returned ${res.status}: ${txt.slice(0, 200)}`,
      };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return {
      ok: false,
      errorMessage: e instanceof Error ? e.message : "Slack request failed",
    };
  }
}
