import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireCapability } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { generateApiKeySecret, hashApiKeySecret } from "@/lib/apiAuth";
import {
  store,
  type ApiKey,
  type ApiKeyEnvironment,
  type ApiKeyScope,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SCOPES: ApiKeyScope[] = [
  "read:health",
  "read:insights",
  "read:leads",
  "read:campaigns",
  "write:leads",
];
const VALID_ENVS: ApiKeyEnvironment[] = ["Production", "Test"];

/**
 * GET /api/admin/api-keys â€” list keys for the operator dashboard.
 * Strips `hashedSecret` from the response so the secret never leaves
 * the server. The operator sees prefix + name + scopes + usage.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "apikeys:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const all = await store.getApiKeys();
  const sanitized = all.map(({ hashedSecret, ...rest }) => ({
    ...rest,
    used24h: (rest.usageWindow ?? []).length,
  }));
  return NextResponse.json({ keys: sanitized });
}

/**
 * POST /api/admin/api-keys â€” create a new key.
 *
 * Returns the raw secret EXACTLY ONCE in this response. Operator must
 * copy it now; the server stores only the hash and will refuse to
 * recover it later. Same model as Stripe / GitHub.
 */
export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "apikeys:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const environment = body.environment;
  const scopes = Array.isArray(body.scopes) ? body.scopes : [];

  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Name (2-80 chars) required" }, { status: 400 });
  }
  if (typeof environment !== "string" || !VALID_ENVS.includes(environment as ApiKeyEnvironment)) {
    return NextResponse.json(
      { error: `environment must be one of ${VALID_ENVS.join(", ")}` },
      { status: 400 },
    );
  }
  const cleanScopes: ApiKeyScope[] = [];
  for (const s of scopes) {
    if (typeof s === "string" && VALID_SCOPES.includes(s as ApiKeyScope)) {
      cleanScopes.push(s as ApiKeyScope);
    }
  }
  if (cleanScopes.length === 0) {
    return NextResponse.json(
      { error: `Pick at least one scope from [${VALID_SCOPES.join(", ")}]` },
      { status: 400 },
    );
  }

  const { secret, prefix } = generateApiKeySecret(environment as ApiKeyEnvironment);
  const op = getOperator();
  const key: ApiKey = {
    id: `key_${crypto.randomBytes(8).toString("hex")}`,
    name,
    prefix,
    hashedSecret: hashApiKeySecret(secret),
    scopes: cleanScopes,
    environment: environment as ApiKeyEnvironment,
    status: "Active",
    createdAt: new Date().toISOString(),
    createdBy: op.email,
    usageWindow: [],
  };

  await store.addApiKey(key);

  // Strip the hash from the response too â€” UI never needs it.
  const { hashedSecret: _h, ...rest } = key;
  return NextResponse.json({
    ok: true,
    key: { ...rest, used24h: 0 },
    secret,                        // shown once, never returned again
  });
}
