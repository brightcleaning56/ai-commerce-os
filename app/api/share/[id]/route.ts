import { NextRequest, NextResponse } from "next/server";
import { fireFirstViewWebhook } from "@/lib/webhooks";
import {
  store,
  type ShareAccessEntry,
  type ShareScope,
  type StoredPipelineRun,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Strip everything the recipient shouldn't see:
 *
 *   - accessLog          → sender-only audit trail
 *   - shareLinks         → list of OTHER recipients' tokens
 *   - For "recipient" scope:
 *     - buyerSummaries   → other prospects you're pitching
 *     - draftSummaries   → outreach drafts written to other prospects
 *
 * "full" scope returns the same thing the legacy /api/share viewer always returned,
 * minus the sender-only metadata above. Used for internal/team sharing.
 */
function publicShape(
  run: StoredPipelineRun,
  scope: ShareScope,
): Omit<StoredPipelineRun, "accessLog" | "shareLinks"> {
  const { accessLog: _a, shareLinks: _l, ...rest } = run;
  if (scope === "recipient") {
    // Replace sensitive arrays with empty lists rather than dropping the keys —
    // simpler client-side rendering, no "is this property defined?" branches.
    return {
      ...rest,
      buyerSummaries: [],
      draftSummaries: [],
      totals: {
        ...rest.totals,
        // Don't lie about counts — show what the recipient is actually seeing.
        buyers: 0,
        drafts: 0,
      },
    };
  }
  return rest;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  const token = req.nextUrl.searchParams.get("t") || "";

  const run = await store.getPipelineRun(id);
  if (!run) {
    return NextResponse.json({ error: "Run not found or expired" }, { status: 404 });
  }

  // Resolve the presented token against the legacy default OR the named-link list.
  // Returns null if no match — same 403 either way so probers can't tell whether
  // a guessed token belongs to a real-but-revoked link or a non-existent one.
  const resolved = store.resolveShareToken(run, token);
  if (!resolved) {
    return NextResponse.json({ error: "Invalid or missing share token" }, { status: 403 });
  }

  // Pull the relevant lifecycle fields off the resolved entity.
  const revoked = resolved.kind === "default" ? resolved.revoked : resolved.link.revoked === true;
  const revokedAt = resolved.kind === "default" ? resolved.revokedAt : resolved.link.revokedAt;
  const expiresAt = resolved.kind === "default" ? resolved.expiresAt : resolved.link.expiresAt;
  const linkLabel = resolved.kind === "default" ? "Default link" : resolved.link.label;
  const linkToken = resolved.kind === "default" ? undefined : resolved.link.token;
  const scope = resolved.scope; // "full" | "recipient"

  // Revoke check — wins over natural expiry so the message can be specific.
  if (revoked) {
    return NextResponse.json(
      { error: "Share link revoked", revokedAt: revokedAt ?? null, reason: "revoked" },
      { status: 410 },
    );
  }

  // Expiry check — older snapshots without expiresAt are treated as never-expiring.
  if (expiresAt) {
    const ms = new Date(expiresAt).getTime();
    if (Number.isFinite(ms) && Date.now() > ms) {
      return NextResponse.json(
        { error: "Share link expired", expiredAt: expiresAt, reason: "expired" },
        { status: 410 },
      );
    }
  }

  // Determine if this is a FIRST view for the resolved link (before we append).
  // Re-read the run state so the check sees the latest (matters during rapid double-clicks).
  const fresh = (await store.getPipelineRun(id)) ?? run;
  const priorViewsForThisLink = (fresh.accessLog ?? []).filter((e) => {
    if (linkToken) return e.linkToken === linkToken;
    return !e.linkToken; // default link
  }).length;
  const isFirstView = priorViewsForThisLink === 0;

  // Log this view, attributed to whichever link was used.
  // Best-effort — failures don't block the response.
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 200);
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "";
  const referer = req.headers.get("referer") ?? "";
  try {
    const entry: ShareAccessEntry = {
      ts: new Date().toISOString(),
      ip: ip || undefined,
      userAgent: ua || undefined,
      referer: referer || undefined,
      linkToken,
      linkLabel,
    };
    await store.appendShareAccess(id, entry);
  } catch {
    // swallow — logging is best-effort
  }

  // Fire the first-view webhook AFTER logging (so the recipient gets a fast response
  // and the webhook receiver's slowness can't delay them). fire-and-forget is fine —
  // we're not awaiting in the request lifecycle.
  if (isFirstView) {
    const origin =
      process.env.NEXT_PUBLIC_APP_ORIGIN || req.nextUrl.origin || "";
    // No await — let it run in the background; failures log to console only.
    void fireFirstViewWebhook({
      event: "share.first_view",
      ts: new Date().toISOString(),
      pipelineId: id,
      linkLabel,
      linkToken,
      scope,
      viewer: {
        ip: ip || undefined,
        userAgent: ua || undefined,
        referer: referer || undefined,
      },
      dashboardUrl: origin ? `${origin}/share-activity` : "/share-activity",
    });
  }

  return NextResponse.json({
    run: publicShape(run, scope),
    scope,
    linkLabel,
  });
}
