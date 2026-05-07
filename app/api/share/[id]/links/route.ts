import { NextRequest, NextResponse } from "next/server";
import { expiryFromTtlHours, genShareToken } from "@/lib/shareTokens";
import { store, type ShareLink, type ShareScope } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mint a new named share link for an existing pipeline run.
 *
 * Auth model: open in the demo. The default `shareToken` from the original run
 * acts as a bearer credential — caller must pass it as ?t=<defaultToken> or in
 * the body, proving they originated this run. In production you'd switch this
 * to a session/workspace-scoped check.
 *
 * Body: { label: string, ttlHours?: number }
 * Returns: { token, label, expiresAt, createdAt, url }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  const presentedToken =
    req.nextUrl.searchParams.get("t") || (await safeBodyToken(req)) || "";

  const run = await store.getPipelineRun(id);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  // Mint authority: only the holder of the default token can add new links.
  if (!presentedToken || presentedToken !== run.shareToken) {
    return NextResponse.json({ error: "Invalid or missing share token" }, { status: 403 });
  }

  let body: { label?: string; ttlHours?: number; scope?: ShareScope } = {};
  try {
    body = await req.json();
  } catch {
    // body may have already been consumed by safeBodyToken; that's fine — re-parse handled there
  }
  const rawLabel = (body.label ?? "").trim();
  if (!rawLabel) {
    return NextResponse.json(
      { error: "Label is required (e.g., 'John @ Acme')" },
      { status: 400 },
    );
  }
  const label = rawLabel.length > 80 ? rawLabel.slice(0, 80) : rawLabel;

  // Default to "recipient" scope for named links — safe for sending to prospects.
  // Caller must explicitly request "full" to expose other buyers + drafts.
  const scope: ShareScope = body.scope === "full" ? "full" : "recipient";

  const link: ShareLink = {
    token: genShareToken(),
    label,
    createdAt: new Date().toISOString(),
    expiresAt: expiryFromTtlHours(body.ttlHours),
    scope,
  };

  const result = await store.addShareLink(id, link);
  if (!result) {
    return NextResponse.json({ error: "Failed to mint link" }, { status: 500 });
  }

  // Build the public URL. We'd love to use req.nextUrl.origin but it can be
  // wrong behind some proxies — fall back to env, then a relative path.
  const origin =
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    req.nextUrl.origin ||
    "";
  const url = origin ? `${origin}/share/${id}?t=${link.token}` : `/share/${id}?t=${link.token}`;

  return NextResponse.json({
    ok: true,
    id,
    token: link.token,
    label: link.label,
    scope: link.scope,
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    url,
  });
}

/**
 * Safely peek at a JSON body for { token } without consuming the stream
 * if the body isn't JSON. Returns "" on any error.
 */
async function safeBodyToken(req: NextRequest): Promise<string> {
  try {
    const cloned = req.clone();
    const body = (await cloned.json()) as { token?: string };
    return typeof body?.token === "string" ? body.token : "";
  } catch {
    return "";
  }
}
