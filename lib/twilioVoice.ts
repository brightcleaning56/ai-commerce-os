/**
 * Twilio Voice — server-side helpers.
 *
 * Two pieces:
 *   1. mintAccessToken(identity)  — signs a JWT the browser SDK uses to
 *      authenticate with Twilio. Tokens are scoped to a single TwiML App
 *      (TWILIO_TWIML_APP_SID) so the browser can only initiate calls
 *      that route through OUR /api/voice/twiml handler -- never random
 *      arbitrary Twilio app SIDs.
 *
 *   2. buildOutboundTwiml(toNumber, fromNumber) — returns the XML Twilio
 *      hits when a browser-initiated call happens. Tells Twilio to dial
 *      the requested number using our verified caller-id.
 *
 * No external SDK dependency: standard Node `crypto` for HMAC-SHA256
 * signing of the JWT. Same approach as lib/sms.ts (raw REST). Keeps the
 * server bundle small and avoids `twilio` package's binary deps.
 *
 * Security notes:
 *   - Only mint tokens for AUTHENTICATED operators (caller routes guard
 *     with requireAdmin). Never mint a token from public input.
 *   - Token TTL defaults to 1 hour. Long enough to make calls without
 *     refresh annoyance; short enough that a leaked token is bounded.
 *   - The TwiML handler MUST validate the request signature in production
 *     (helper provided below) so attackers can't trigger calls by hitting
 *     /api/voice/twiml directly. Twilio signs every webhook with
 *     X-Twilio-Signature using TWILIO_AUTH_TOKEN.
 */

import { createHmac, randomBytes } from "node:crypto";

export type AccessTokenInput = {
  /** Stable identifier for this operator session — e.g. their email */
  identity: string;
  /** Token TTL in seconds. Default 3600 (1 hour). Twilio max is 24h */
  ttlSec?: number;
};

export type AccessTokenResult = {
  ok: boolean;
  token?: string;
  identity?: string;
  expiresAt?: string;
  errorMessage?: string;
};

/**
 * Mint a Twilio Voice Access Token. Returns ok:false with a clear
 * errorMessage when env is missing — caller should surface that to
 * the operator (they need to set TWILIO_API_KEY etc).
 */
export function mintAccessToken(input: AccessTokenInput): AccessTokenResult {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

  if (!accountSid || !apiKey || !apiSecret || !twimlAppSid) {
    return {
      ok: false,
      errorMessage:
        "Voice not fully configured. Set TWILIO_ACCOUNT_SID + TWILIO_API_KEY + TWILIO_API_SECRET + TWILIO_TWIML_APP_SID.",
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.min(input.ttlSec ?? 3600, 24 * 3600);
  const exp = now + ttl;
  const jti = `${apiKey}-${randomBytes(8).toString("hex")}`;

  // Twilio Access Token format: standard JWT but with cty="twilio-fpa;v=1"
  // in the header so the SDK knows to parse the grants block.
  const header = {
    typ: "JWT",
    alg: "HS256",
    cty: "twilio-fpa;v=1",
  };

  const payload = {
    jti,
    iss: apiKey,
    sub: accountSid,
    iat: now,
    nbf: now,
    exp,
    grants: {
      identity: input.identity,
      voice: {
        incoming: { allow: true },
        outgoing: { application_sid: twimlAppSid },
      },
    },
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = base64url(
    createHmac("sha256", apiSecret).update(signingInput).digest(),
  );

  return {
    ok: true,
    token: `${signingInput}.${signature}`,
    identity: input.identity,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

/**
 * Build the TwiML response that Twilio hits when the browser-side
 * Device.connect() initiates an outbound call. The To parameter comes
 * from the SDK's connect() params.
 *
 * `callerId` MUST be a number you OWN in Twilio (or have verified for
 * outbound). Reads TWILIO_FROM (already used by SMS) by default; the
 * route handler can override per-call if you have multiple numbers.
 *
 * Recording behavior: enabled when TWILIO_RECORD_CALLS=true (default
 * off so deploys don't accidentally record without operator opt-in).
 * Uses dual-channel recording so the operator's voice and the buyer's
 * voice land on separate channels for cleaner review + auto-transcription.
 * Twilio POSTs the recording URL back to /api/voice/recording-status
 * once the call completes; that handler maps CallSid → recording URL
 * for client-side display.
 */
export function buildOutboundTwiml(args: {
  toNumber: string;
  callerIdOverride?: string;
  /**
   * Absolute URL of the recording-status webhook on this deployment.
   * Built from the inbound request URL by the route handler so we
   * don't have to guess the host.
   */
  recordingStatusUrl?: string;
}): string {
  const callerId = args.callerIdOverride || process.env.TWILIO_FROM || "";
  // Sanitize the To number — strip anything that's not a digit, plus, or
  // SIP characters. Defends against TwiML injection via crafted To values.
  const safeTo = args.toNumber.replace(/[^+\d#*]/g, "");
  const safeCaller = callerId.replace(/[^+\d]/g, "");

  const recordEnabled =
    process.env.TWILIO_RECORD_CALLS === "true" && !!args.recordingStatusUrl;
  const recordAttrs = recordEnabled
    ? ` record="record-from-answer-dual" recordingStatusCallback="${escapeXmlAttr(
        args.recordingStatusUrl!,
      )}" recordingStatusCallbackEvent="completed"`
    : "";

  // answerOnBridge=true — the browser session doesn't ring "connected"
  // until the called party actually answers. Better operator UX.
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${safeCaller}" answerOnBridge="true" timeout="30"${recordAttrs}>
    <Number>${safeTo}</Number>
  </Dial>
</Response>`;
}

function escapeXmlAttr(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Verify a Twilio webhook signature. Twilio signs every request to your
 * webhook URL with X-Twilio-Signature using TWILIO_AUTH_TOKEN. Without
 * this check, an attacker who learns your webhook URL could trigger
 * calls by POSTing crafted bodies.
 *
 * Returns true if signature is valid OR if TWILIO_AUTH_TOKEN isn't set
 * (dev-mode permissive — log a warning so the operator notices).
 *
 * Algorithm: HMAC-SHA1 of (URL + sorted concat of POST params),
 * base64-encoded. https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function verifyTwilioSignature(args: {
  signatureHeader: string | null;
  url: string;          // FULL url including protocol + query string
  formParams: Record<string, string>;
}): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.warn(
      "[twilioVoice] TWILIO_AUTH_TOKEN not set — webhook signature check is BYPASSED. Set it before exposing /api/voice/twiml publicly.",
    );
    return true;
  }
  if (!args.signatureHeader) return false;

  // Sort params by key, then concat key+value. Twilio's required input shape.
  const sorted = Object.keys(args.formParams)
    .sort()
    .map((k) => `${k}${args.formParams[k]}`)
    .join("");
  const signed = args.url + sorted;
  const expected = createHmac("sha1", authToken).update(signed).digest("base64");

  // Constant-time compare
  const a = Buffer.from(expected);
  const b = Buffer.from(args.signatureHeader);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
