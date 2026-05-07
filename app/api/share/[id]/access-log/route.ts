import { NextRequest, NextResponse } from "next/server";
import {
  store,
  type ShareAccessEntry,
  type ShareLink,
  type ShareScope,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LinkSummary = {
  token: string;
  label: string;
  isDefault: boolean;
  createdAt: string;
  expiresAt?: string;
  revoked: boolean;
  revokedAt?: string;
  accessCount: number;
  lastViewedAt?: string;
  scope: ShareScope;
};

/**
 * Sender-facing view of who/when opened a share link.
 *
 * Gating: caller must present the default shareToken — the same one that gives
 * full read access to the run. Named per-recipient tokens CANNOT read the log
 * (you don't want a recipient enumerating who else got the deck).
 *
 * Returns: { id, defaultToken (revoke + expiry state), accessLog, links[] (per-recipient stats) }
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  const token = req.nextUrl.searchParams.get("t") || "";

  const run = await store.getPipelineRun(id);
  if (!run) {
    return NextResponse.json({ error: "Run not found or expired" }, { status: 404 });
  }
  // Only the default token can read the log — named tokens can't see siblings.
  if (!token || token !== run.shareToken) {
    return NextResponse.json({ error: "Invalid or missing share token" }, { status: 403 });
  }

  const log: ShareAccessEntry[] = run.accessLog ?? [];
  const links: ShareLink[] = run.shareLinks ?? [];

  // Per-link summaries: views attributed by linkToken, plus a synthetic "default"
  // entry for views that came in via the legacy/default token (linkToken undefined).
  const linkSummaries: LinkSummary[] = [];

  // Default link — always present, always "full" scope (legacy semantics)
  const defaultViews = log.filter((e) => !e.linkToken);
  linkSummaries.push({
    token: run.shareToken,
    label: "Default link",
    isDefault: true,
    createdAt: run.startedAt,
    expiresAt: run.shareExpiresAt,
    revoked: run.revoked === true,
    revokedAt: run.revokedAt,
    accessCount: defaultViews.length,
    lastViewedAt: defaultViews[0]?.ts,
    scope: "full",
  });

  // Named links — undefined scope is treated as "recipient" (safe default)
  for (const l of links) {
    const views = log.filter((e) => e.linkToken === l.token);
    linkSummaries.push({
      token: l.token,
      label: l.label,
      isDefault: false,
      createdAt: l.createdAt,
      expiresAt: l.expiresAt,
      revoked: l.revoked === true,
      revokedAt: l.revokedAt,
      accessCount: views.length,
      lastViewedAt: views[0]?.ts,
      scope: l.scope ?? "recipient",
    });
  }

  return NextResponse.json({
    id: run.id,
    revoked: run.revoked === true,
    revokedAt: run.revokedAt ?? null,
    shareExpiresAt: run.shareExpiresAt ?? null,
    accessLog: log,
    accessCount: log.length,
    links: linkSummaries,
  });
}
