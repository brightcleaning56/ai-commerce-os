import crypto from "node:crypto";

/**
 * Verify an incoming webhook's HMAC signature.
 *
 * Use this on the RECEIVER side to confirm a payload came from us.
 *
 * Inputs:
 *   rawBody:   the request body as a UTF-8 string, EXACTLY as we sent it
 *              (don't pre-parse JSON and re-stringify — the bytes will differ)
 *   header:    the value of the X-AICOS-Signature header (e.g., "sha256=abc...")
 *   secret:    the shared secret you configured (matches our SHARE_FIRSTVIEW_WEBHOOK_SECRET)
 *
 * Returns true iff the signature is valid. Uses constant-time comparison.
 */
export function verifyAicosSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
): boolean {
  if (!header || !secret) return false;
  const m = /^sha256=([a-f0-9]+)$/i.exec(header.trim());
  if (!m) return false;
  const presented = Buffer.from(m[1], "hex");
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();
  if (presented.length !== expected.length) return false;
  return crypto.timingSafeEqual(presented, expected);
}

/**
 * Verify a Postmark webhook signature. Postmark's webhook signing uses HMAC-SHA1
 * with a configured key (Account → Webhooks → Signing key), sent as the
 * `X-Postmark-Signature` header (Base64).
 *
 * If you set up Basic Auth on the inbound webhook (recommended), you can skip
 * signature verification — but if you've disabled Basic Auth and rely on the
 * signature alone, use this.
 */
export function verifyPostmarkSignature(
  rawBody: string,
  header: string | null | undefined,
  signingKey: string,
): boolean {
  if (!header || !signingKey) return false;
  const expected = crypto.createHmac("sha1", signingKey).update(rawBody).digest("base64");
  // Postmark sends the signature directly (no algorithm prefix)
  if (header.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/**
 * Verify a Twilio webhook signature. Twilio signs with HMAC-SHA1 of
 * `<full URL> + sorted POST params`, Base64-encoded, sent as
 * `X-Twilio-Signature`. See https://www.twilio.com/docs/usage/security
 *
 * For inbound SMS replies if you configure Twilio.
 */
export function verifyTwilioSignature(
  fullUrl: string,
  postParams: Record<string, string>,
  header: string | null | undefined,
  authToken: string,
): boolean {
  if (!header || !authToken) return false;
  // Concatenate URL + sorted key-value pairs
  const sortedKeys = Object.keys(postParams).sort();
  const data = fullUrl + sortedKeys.map((k) => k + postParams[k]).join("");
  const expected = crypto.createHmac("sha1", authToken).update(data).digest("base64");
  if (header.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/**
 * First-view webhook payload — sent when a recipient opens a tracked share
 * link for the first time. Subsequent opens do NOT fire this webhook (use the
 * /api/share-activity feed for live polling instead).
 */
export type FirstViewPayload = {
  event: "share.first_view";
  ts: string;
  pipelineId: string;
  linkLabel: string;
  linkToken?: string;
  scope: "full" | "recipient";
  viewer: {
    ip?: string;
    userAgent?: string;
    referer?: string;
  };
  // Convenience: a URL the sender can deep-link to in the dashboard
  dashboardUrl: string;
};

/**
 * Fire-and-forget POST to the configured webhook URL.
 * Returns immediately — failures are logged but never block the share-link GET.
 *
 * If SHARE_FIRSTVIEW_WEBHOOK_SECRET is set, the body is HMAC-SHA256 signed and
 * the signature is sent in the `X-AICOS-Signature` header (`sha256=<hex>`).
 *
 * Receivers verify by computing HMAC-SHA256 of the raw body with the same
 * secret and constant-time-comparing to the header.
 */
export async function fireFirstViewWebhook(payload: FirstViewPayload): Promise<void> {
  const url = process.env.SHARE_FIRSTVIEW_WEBHOOK_URL;
  if (!url) return;

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "AICommerceOS/1.0 (share-webhook)",
  };

  const secret = process.env.SHARE_FIRSTVIEW_WEBHOOK_SECRET;
  if (secret) {
    const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
    headers["X-AICOS-Signature"] = `sha256=${sig}`;
  }

  // Fire-and-forget — but await with a short timeout so dev sees errors fast.
  // We don't want a slow webhook receiver to delay the share-page response.
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(
        `[share-webhook] POST ${url} responded ${res.status} ${res.statusText}`,
      );
    }
  } catch (e) {
    // AbortError, network failure, DNS — log but don't throw
    console.warn("[share-webhook] failed:", e instanceof Error ? e.message : e);
  }
}
