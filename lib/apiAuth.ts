import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { store, type ApiKey, type ApiKeyScope } from "@/lib/store";

/**
 * Bearer-auth + scope check for /api/v1/* endpoints. Validates the
 * Authorization header, looks up the key by its SHA-256 hash, ensures
 * it's Active and carries the required scope, then bumps usage.
 *
 * Returns the ApiKey on success so the endpoint can read environment /
 * scopes / id (e.g. for response metadata or rate-limit decisions).
 *
 * On failure returns a NextResponse the endpoint should return as-is —
 * keeps every /api/v1/* error shape consistent.
 */

export type ApiKeyAuthResult =
  | { ok: true; key: ApiKey }
  | { ok: false; response: NextResponse };

export function hashApiKeySecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function err(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "WWW-Authenticate": 'Bearer realm="api"' } },
  );
}

export async function requireApiKey(
  req: Request,
  scope: ApiKeyScope,
): Promise<ApiKeyAuthResult> {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) {
    return {
      ok: false,
      response: err(401, "missing_credentials", "Bearer token required"),
    };
  }
  const presented = match[1];
  if (presented.length < 16 || presented.length > 256) {
    return {
      ok: false,
      response: err(401, "invalid_credentials", "Bearer token malformed"),
    };
  }

  const hashed = hashApiKeySecret(presented);
  const key = await store.getApiKeyByHash(hashed);
  if (!key) {
    return {
      ok: false,
      response: err(401, "invalid_credentials", "Unknown API key"),
    };
  }
  if (key.status !== "Active") {
    return {
      ok: false,
      response: err(401, "key_revoked", "API key has been revoked"),
    };
  }
  if (!key.scopes.includes(scope)) {
    return {
      ok: false,
      response: err(
        403,
        "insufficient_scope",
        `This endpoint requires the "${scope}" scope; this key has [${key.scopes.join(", ")}]`,
      ),
    };
  }

  // Best-effort usage tracking — never block the request on the write.
  store.recordApiKeyUse(key.id).catch((e) => {
    console.error("[apiAuth] recordApiKeyUse failed", e);
  });

  return { ok: true, key };
}

/**
 * Generate a new key secret. Format: sk_{live|test}_<48 random base64url
 * chars>. We expose `prefix` (the first 12 chars including `sk_live_`) on
 * the stored ApiKey so the operator can identify it later without ever
 * showing the full secret again.
 */
export function generateApiKeySecret(env: "Production" | "Test"): {
  secret: string;
  prefix: string;
} {
  const prefixToken = env === "Production" ? "live" : "test";
  const random = crypto.randomBytes(36).toString("base64url");
  const secret = `sk_${prefixToken}_${random}`;
  return {
    secret,
    prefix: secret.slice(0, 12),
  };
}
