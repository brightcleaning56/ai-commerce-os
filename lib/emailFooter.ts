import { getOperator } from "@/lib/operator";
import { buildUnsubscribeUrl } from "@/lib/unsubscribeToken";

/**
 * Build CAN-SPAM compliant email footer for outbound mail.
 *
 * What CAN-SPAM requires (15 U.S.C. § 7704):
 *   1. A clear and conspicuous opt-out mechanism (link / address)
 *   2. A valid physical postal address for the sender
 *   3. Honor opt-out within 10 business days (we honor immediately)
 *   4. No deceptive headers / subject lines (handled in the agents)
 *
 * The footer here covers (1) + (2). The unsubscribe URL is a per-
 * recipient HMAC token, so each footer is unique to the recipient.
 *
 * Configuration:
 *   OPERATOR_POSTAL_ADDRESS  full postal address line for the footer
 *                            (e.g. "AVYN Commerce, 123 Main St, Austin, TX 78701")
 *                            REQUIRED for legal compliance. Falls back to a
 *                            placeholder + warns in logs if missing.
 */

function getOperatorPostalAddress(): { address: string; isPlaceholder: boolean } {
  const env = process.env.OPERATOR_POSTAL_ADDRESS?.trim();
  if (env) return { address: env, isPlaceholder: false };
  if (typeof console !== "undefined") {
    console.warn(
      "[emailFooter] OPERATOR_POSTAL_ADDRESS is not set — emails ship with a placeholder physical address. Set this in Netlify env BEFORE any production send to comply with CAN-SPAM.",
    );
  }
  return {
    address: "(physical address not configured — set OPERATOR_POSTAL_ADDRESS env var)",
    isPlaceholder: true,
  };
}

/**
 * Plain-text footer block. Appended to textBody with a clean separator.
 */
export function buildPlainTextFooter(recipientEmail: string): string {
  const op = getOperator();
  const { address } = getOperatorPostalAddress();
  const unsubUrl = buildUnsubscribeUrl(recipientEmail);

  const lines: string[] = [
    "",
    "--",
    `${op.company} · ${op.name}, ${op.title}`,
    address,
    "",
    "You're receiving this because we identified your business as a potential fit for AVYN.",
    `Unsubscribe (one click): ${unsubUrl}`,
  ];
  return lines.join("\n");
}

/**
 * HTML footer block — used when an htmlBody is built.
 */
export function buildHtmlFooter(recipientEmail: string): string {
  const op = getOperator();
  const { address } = getOperatorPostalAddress();
  const unsubUrl = buildUnsubscribeUrl(recipientEmail);

  // Inline styles only — many email clients strip <style> blocks.
  return `<div style="margin-top:24px;padding-top:14px;border-top:1px solid #d9d9d9;color:#666;font-family:Arial,sans-serif;font-size:11px;line-height:1.55;">
<p style="margin:0 0 4px 0;"><strong style="color:#333;">${escapeHtml(op.company)}</strong> · ${escapeHtml(op.name)}, ${escapeHtml(op.title)}</p>
<p style="margin:0 0 4px 0;">${escapeHtml(address)}</p>
<p style="margin:8px 0 0 0;">You're receiving this because we identified your business as a potential fit for AVYN.</p>
<p style="margin:4px 0 0 0;"><a href="${escapeAttr(unsubUrl)}" style="color:#666;text-decoration:underline;">Unsubscribe</a> (one click)</p>
</div>`;
}

/**
 * RFC 2369 / RFC 8058 List-Unsubscribe headers — recognized by Gmail,
 * Yahoo, iCloud + others to surface a native "Unsubscribe" link above
 * the message body. Increases deliverability + reduces spam reports.
 */
export function buildListUnsubscribeHeaders(recipientEmail: string): {
  "List-Unsubscribe": string;
  "List-Unsubscribe-Post": string;
} {
  const unsubUrl = buildUnsubscribeUrl(recipientEmail);
  return {
    "List-Unsubscribe": `<${unsubUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

// ── helpers ─────────────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
