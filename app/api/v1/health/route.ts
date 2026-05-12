import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/health — minimal proof-of-life for an API key.
 *
 * Useful for:
 *   - Operator verifying a freshly-created key works
 *   - Partner monitoring (synthetic check) confirming the workspace is up
 *   - Confirming a Test-env key returns Test-env labelled responses
 *
 * Required scope: read:health
 */
export async function GET(req: Request) {
  const auth = await requireApiKey(req, "read:health");
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    ok: true,
    workspace: process.env.OPERATOR_COMPANY || "AVYN Commerce",
    environment: auth.key.environment,
    keyName: auth.key.name,
    keyPrefix: auth.key.prefix,
    serverTime: new Date().toISOString(),
  });
}
