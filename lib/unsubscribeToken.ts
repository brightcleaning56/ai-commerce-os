import crypto from "node:crypto";

/**
 * Per-recipient unsubscribe tokens. Deterministic HMAC so we never have
 * to store a per-email token — we recompute and compare in O(1) at
 * verification time. Same email + same secret = same token.
 *
 * Token format:
 *   base64url(HMAC-SHA256(emailLowercased, secret)) truncated to 32 chars
 *
 * Secret precedence:
 *   1. UNSUBSCRIBE_SECRET (recommended — rotate independently)
 *   2. ADMIN_TOKEN (fallback so this works out of the box on existing deploys)
 *   3. "avyn-default-do-not-use" (dev-only; warn on every call)
 *
 * The unsubscribe URL embeds both `token` and `email` because the
 * landing page needs to render "Unsubscribe <email> from AVYN?" — the
 * token alone doesn't reveal the email (it's a one-way hash). Worst
 * case if a link is forwarded: the wrong person sees the email + can
 * confirm an unsubscribe they didn't intend. Recoverable (operator can
 * un-suppress) and small risk; matches industry norm.
 */

function getSecret(): { secret: string; isDefault: boolean } {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.ADMIN_TOKEN;
  if (s && s.length >= 16) return { secret: s, isDefault: false };
  if (typeof console !== "undefined") {
    console.warn(
      "[unsubscribeToken] UNSUBSCRIBE_SECRET (or ADMIN_TOKEN) not set — tokens use a default secret. NEVER use this in production.",
    );
  }
  return { secret: "avyn-default-do-not-use", isDefault: true };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generateUnsubscribeToken(email: string): string {
  const { secret } = getSecret();
  const e = normalizeEmail(email);
  if (!e) return "";
  const h = crypto.createHmac("sha256", secret).update(e).digest();
  return h.toString("base64url").slice(0, 32);
}

/**
 * Verify a token against a presented email. Returns true only when
 * the token matches the recomputed HMAC for that email. Constant-time
 * compare so timing attacks can't reveal the secret.
 */
export function verifyUnsubscribeToken(email: string, presentedToken: string): boolean {
  if (!email || !presentedToken) return false;
  const expected = generateUnsubscribeToken(email);
  if (!expected || expected.length !== presentedToken.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(presentedToken, "utf8"),
    );
  } catch {
    return false;
  }
}

/**
 * Build the fully-qualified unsubscribe URL the email footer embeds.
 * The page at /u/[token]?e=<email> shows a "Confirm unsubscribe" UI
 * and POSTs to /api/unsubscribe on confirm.
 */
export function buildUnsubscribeUrl(email: string): string {
  const origin =
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    process.env.URL ||
    "https://avyncommerce.com";
  const token = generateUnsubscribeToken(email);
  if (!token) return origin;
  // Email goes in the query string. Token in the path so it shows in
  // the URL bar (so the recipient can verify the domain matches the
  // sender before clicking confirm).
  return `${origin}/u/${token}?e=${encodeURIComponent(email.trim())}`;
}
