/**
 * Per-user session token — HMAC-signed, stateless, edge-compatible.
 *
 * Why this exists: the workspace had exactly one shared secret
 * (ADMIN_TOKEN) gating the whole admin app. When invitees accept an
 * invite, they need their OWN credential to sign in without us
 * handing out the global admin token. Building a full user table +
 * password hashing + magic-link flow is a bigger slice; this is the
 * smallest thing that works: a self-validating bearer token that
 * embeds the user's identity + role + expiry, signed with the same
 * ADMIN_TOKEN as the HMAC key.
 *
 * Token format:  u_<base64url(payload)>.<base64url(signature)>
 *   - "u_" prefix lets callers distinguish from ADMIN_TOKEN strings
 *     without parsing.
 *   - payload is a UTF-8 JSON: { v, sub, email, role, exp, jti }
 *     v: schema version (1) — bump if payload shape changes
 *     sub: invite id (stable identity)
 *     email: lowercased invitee email
 *     role: "Owner" | "Admin" | "Operator" | "Viewer" | "Billing"
 *     exp: unix seconds (90 days from mint)
 *     jti: random 16 hex chars — lets us add a denylist later
 *   - signature is HMAC-SHA256 of base64url(payload) keyed with
 *     ADMIN_TOKEN.
 *
 * Verification is async because Web Crypto's importKey/verify are
 * async — that's why requireAdmin had to become async.
 *
 * Limitations of this slice (call out so future-you knows):
 *   - No revocation. Cancelling an invite doesn't invalidate already-
 *     minted user tokens. Token expires in 90 days. To revoke
 *     earlier, rotate ADMIN_TOKEN (which is the HMAC key).
 *   - Role isn't enforced anywhere yet — every admin route is
 *     all-or-nothing. The role field is captured for the next slice
 *     so we can add per-route policy.
 *   - If ADMIN_TOKEN rotates, every per-user token instantly invalidates.
 *     That's a feature (mass revoke) but also means rotating breaks all
 *     existing teammate sessions.
 */

export type UserTokenPayload = {
  v: 1;
  sub: string;         // invite id (kind="user") or supplier id (kind="supplier")
  email: string;
  role: string;        // staff role for kind="user"; "Supplier" for kind="supplier"
  exp: number;         // unix seconds
  jti: string;         // random nonce
  /**
   * Identity type. Omitted (or "user") for internal staff invite tokens.
   * "supplier" for external supplier-portal access tokens. Staff routes
   * (admin / internal /(app) pages) MUST reject "supplier" tokens — they
   * grant scoped access to a single supplier's data via /portal only.
   */
  kind?: "user" | "supplier";
  /**
   * When kind="supplier", the registry id of the supplier this token
   * grants access to. Portal endpoints scope all reads + writes by this.
   */
  supplierId?: string;
};

export type VerifyResult =
  | { ok: true; payload: UserTokenPayload }
  | { ok: false; reason: string };

const PREFIX = "u_";

function b64urlEncode(bytes: Uint8Array): string {
  // btoa handles ASCII bytes; we hand it a binary string built per-byte
  // to avoid the spread-with-large-arrays stack overflow.
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(input: string): Uint8Array | null {
  try {
    const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
    const s = atob(input.replace(/-/g, "+").replace(/_/g, "/") + pad);
    // Allocate a fresh ArrayBuffer (not SharedArrayBuffer) so this can be
    // passed directly to crypto.subtle.verify, which only accepts
    // ArrayBuffer-backed BufferSources under strict TS lib types.
    const buf = new ArrayBuffer(s.length);
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Mint a per-user token. Requires ADMIN_TOKEN to be set — if it's not,
 * we throw rather than silently producing an unsigned token.
 */
export async function mintUserToken(input: {
  inviteId: string;
  email: string;
  role: string;
  ttlSeconds?: number; // default 90 days
}): Promise<string> {
  return mintToken({
    sub: input.inviteId,
    email: input.email,
    role: input.role,
    ttlSeconds: input.ttlSeconds,
    kind: "user",
  });
}

/**
 * Mint a supplier-portal token. Owner-only at the API layer. The
 * supplier never sees ADMIN_TOKEN; their token is HMAC-signed against
 * it so rotating ADMIN_TOKEN mass-revokes every outstanding supplier
 * session at the same time as every staff session. Acceptable trade
 * because both are subject to the same blast-radius policy.
 *
 * Default TTL is 180 days (longer than staff tokens — suppliers
 * shouldn't be re-onboarded as often as employees turn over).
 */
export async function mintSupplierToken(input: {
  supplierId: string;
  email: string;
  ttlSeconds?: number; // default 180 days
}): Promise<string> {
  return mintToken({
    sub: input.supplierId,
    email: input.email,
    role: "Supplier",
    ttlSeconds: input.ttlSeconds ?? 60 * 60 * 24 * 180,
    kind: "supplier",
    supplierId: input.supplierId,
  });
}

async function mintToken(input: {
  sub: string;
  email: string;
  role: string;
  ttlSeconds?: number;
  kind?: "user" | "supplier";
  supplierId?: string;
}): Promise<string> {
  const secret = process.env.ADMIN_TOKEN;
  if (!secret) {
    throw new Error(
      "Cannot mint token: ADMIN_TOKEN env var not set. Tokens are HMAC-signed with ADMIN_TOKEN as the key.",
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const ttl = input.ttlSeconds ?? 60 * 60 * 24 * 90; // 90 days default
  const jtiBytes = new Uint8Array(8);
  crypto.getRandomValues(jtiBytes);
  const jti = Array.from(jtiBytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const payload: UserTokenPayload = {
    v: 1,
    sub: input.sub,
    email: input.email.toLowerCase(),
    role: input.role,
    exp: now + ttl,
    jti,
    kind: input.kind ?? "user",
    supplierId: input.supplierId,
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadB64 = b64urlEncode(payloadBytes);
  const key = await hmacKey(secret);
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64)),
  );
  const sigB64 = b64urlEncode(sigBytes);
  return `${PREFIX}${payloadB64}.${sigB64}`;
}

/**
 * Verify a string. Returns { ok: true, payload } if the token is well-
 * formed, HMAC-valid, unexpired, and signed with the current ADMIN_TOKEN.
 *
 * Returns { ok: false } (never throws) for any kind of failure so
 * callers can fall through to other auth paths.
 */
export async function verifyUserToken(token: string): Promise<VerifyResult> {
  if (!token || !token.startsWith(PREFIX)) {
    return { ok: false, reason: "not a user token" };
  }
  const secret = process.env.ADMIN_TOKEN;
  if (!secret) {
    return { ok: false, reason: "ADMIN_TOKEN not configured" };
  }
  const body = token.slice(PREFIX.length);
  const dot = body.lastIndexOf(".");
  if (dot < 1 || dot === body.length - 1) {
    return { ok: false, reason: "malformed token" };
  }
  const payloadB64 = body.slice(0, dot);
  const sigB64 = body.slice(dot + 1);
  const sigBytes = b64urlDecode(sigB64);
  if (!sigBytes) return { ok: false, reason: "bad signature encoding" };

  let key: CryptoKey;
  try {
    key = await hmacKey(secret);
  } catch {
    return { ok: false, reason: "key import failed" };
  }
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes as BufferSource,
      new TextEncoder().encode(payloadB64) as BufferSource,
    );
  } catch {
    return { ok: false, reason: "verify threw" };
  }
  if (!valid) return { ok: false, reason: "signature mismatch" };

  const payloadBytes = b64urlDecode(payloadB64);
  if (!payloadBytes) return { ok: false, reason: "bad payload encoding" };
  let payload: UserTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as UserTokenPayload;
  } catch {
    return { ok: false, reason: "payload not JSON" };
  }
  if (payload.v !== 1) return { ok: false, reason: `unsupported version ${payload.v}` };
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) {
    return { ok: false, reason: "token expired" };
  }
  return { ok: true, payload };
}

/**
 * Quick test for "does this look like a user token" — does NOT verify.
 * Use this in middleware before doing the async verify to avoid the
 * crypto cost on every ADMIN_TOKEN cookie.
 */
export function looksLikeUserToken(s: string): boolean {
  return typeof s === "string" && s.startsWith(PREFIX) && s.includes(".");
}
