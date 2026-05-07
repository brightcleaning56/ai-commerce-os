import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { expiryFromTtlHours, genShareToken } from "@/lib/shareTokens";
import { store, type ShareLink } from "@/lib/store";
import { BUYERS } from "@/lib/buyers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const recent: number[] = [];

async function findBuyerEmail(buyerId: string, buyerCompany: string): Promise<{ email: string | null; source: "discovered" | "static" | null }> {
  // Check discovered (agent-surfaced) buyers first
  const discovered = await store.getDiscoveredBuyers();
  const dh = discovered.find((b) => b.id === buyerId);
  if (dh) return { email: dh.email, source: "discovered" };
  // Fall back to static catalog by id
  const stat = BUYERS.find((b) => b.id === buyerId);
  if (stat) return { email: stat.email, source: "static" };
  // Fall back to fuzzy match by company (rare)
  const byCompany =
    discovered.find((b) => b.company === buyerCompany) ||
    BUYERS.find((b) => b.company === buyerCompany);
  if (byCompany) return { email: byCompany.email, source: discovered.includes(byCompany as any) ? "discovered" : "static" };
  return { email: null, source: null };
}

export async function POST(req: NextRequest) {
  const now = Date.now();
  while (recent.length && now - recent[0] > RATE_WINDOW_MS) recent.shift();
  if (recent.length >= RATE_LIMIT) {
    return NextResponse.json(
      { error: "Send rate limit (30/min) exceeded — try again in a minute." },
      { status: 429 }
    );
  }
  recent.push(now);

  let body: { id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "Missing draft id" }, { status: 400 });
  }

  const draft = await store.getDraft(body.id);
  if (!draft) return NextResponse.json({ error: `Draft ${body.id} not found` }, { status: 404 });
  if (draft.status === "sent") {
    return NextResponse.json({
      ok: true,
      already: true,
      draft,
    });
  }
  if (draft.status === "rejected") {
    return NextResponse.json({ error: "Draft was rejected — cannot send" }, { status: 400 });
  }

  const { email, source } = await findBuyerEmail(draft.buyerId, draft.buyerCompany);
  if (!email) {
    const updated = await store.patchDraft(draft.id, {
      sendError: `Could not resolve buyer email for ${draft.buyerCompany}`,
    });
    return NextResponse.json(
      { error: "Buyer email not found", draft: updated },
      { status: 422 }
    );
  }

  // ─── Auto-mint a recipient-scoped tracked share link ────────────────────────
  // Idempotent: if the draft already has a shareLinkToken (e.g., a prior send
  // attempt failed mid-flight), reuse it instead of stacking duplicates.
  // No-op when the draft has no pipelineId (legacy drafts pre-slice-28) — in
  // that case we send the original body without a link, no harm done.
  let shareLinkToken: string | undefined = draft.shareLinkToken;
  let shareLinkUrl: string | undefined = draft.shareLinkUrl;
  let shareLinkError: string | undefined;

  if (draft.pipelineId && !shareLinkToken) {
    try {
      const run = await store.getPipelineRun(draft.pipelineId);
      if (run) {
        const link: ShareLink = {
          token: genShareToken(),
          // Label combines the buyer's company + product so the sender can
          // disambiguate if the same prospect gets multiple proposals.
          label: `${draft.buyerCompany} (${draft.productName})`,
          createdAt: new Date().toISOString(),
          // 30 days — long enough that a slow-moving deal still has access,
          // short enough that an unanswered email's link expires before the
          // year is out. Sender can revoke earlier via the governance panel.
          expiresAt: expiryFromTtlHours(720),
          scope: "recipient",
        };
        const minted = await store.addShareLink(run.id, link);
        if (minted) {
          shareLinkToken = link.token;
          // Build absolute URL — req.nextUrl.origin is the most reliable
          // option in dev + Vercel; falls back to a relative path otherwise.
          const origin =
            process.env.NEXT_PUBLIC_APP_ORIGIN || req.nextUrl.origin || "";
          shareLinkUrl = origin
            ? `${origin}/share/${run.id}?t=${link.token}`
            : `/share/${run.id}?t=${link.token}`;
        }
      } else {
        shareLinkError = `Parent pipeline ${draft.pipelineId} not found`;
      }
    } catch (e) {
      // Don't block the send on a tracking-link failure — log and continue
      shareLinkError = e instanceof Error ? e.message : "share-link mint failed";
    }
  }

  // Build the body that actually goes out: original Claude-generated content
  // PLUS a clean footer with the tracked link, if we have one. The email body
  // shown in the review UI (draft.email.body) is left untouched for audit.
  const enrichedBody = shareLinkUrl
    ? `${draft.email.body}\n\n— View the full proposal: ${shareLinkUrl}`
    : draft.email.body;

  const result = await sendEmail({
    to: email,
    subject: draft.email.subject,
    textBody: enrichedBody,
    metadata: {
      draftId: draft.id,
      buyerId: draft.buyerId,
      buyerCompany: draft.buyerCompany,
      productName: draft.productName,
      buyerSource: source || "unknown",
      shareLinkToken: shareLinkToken || "",
    },
  });

  if (!result.ok) {
    const updated = await store.patchDraft(draft.id, {
      sendError: result.errorMessage ?? "Send failed",
      emailProvider: result.provider,
      // Even on failed send, keep the share-link tracking so the user doesn't
      // see a different link if they retry. The minted link is harmless on its own.
      shareLinkToken,
      shareLinkUrl,
    });
    return NextResponse.json(
      {
        error: result.errorMessage ?? "Send failed",
        draft: updated,
        result,
        shareLinkError,
      },
      { status: 502 }
    );
  }

  const updated = await store.patchDraft(draft.id, {
    status: "sent",
    sentAt: new Date().toISOString(),
    sentToEmail: result.sentTo,
    redirectedFromEmail: result.redirectedFrom,
    messageId: result.messageId,
    emailProvider: result.provider,
    sendSimulated: result.simulated,
    sendError: undefined,
    sentBody: enrichedBody,
    shareLinkToken,
    shareLinkUrl,
  });

  return NextResponse.json({
    ok: true,
    draft: updated,
    result,
    shareLink: shareLinkToken
      ? { token: shareLinkToken, url: shareLinkUrl }
      : null,
    shareLinkError,
  });
}
