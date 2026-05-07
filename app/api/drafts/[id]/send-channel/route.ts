import { NextRequest, NextResponse } from "next/server";
import { sendLinkedIn, sendSms } from "@/lib/messaging";
import { expiryFromTtlHours, genShareToken } from "@/lib/shareTokens";
import { store, type ShareLink } from "@/lib/store";
import { BUYERS } from "@/lib/buyers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Channel = "sms" | "linkedin";

async function findBuyerContact(
  buyerId: string,
  buyerCompany: string,
): Promise<{ phone?: string; linkedinUrl?: string }> {
  const discovered = await store.getDiscoveredBuyers();
  const dh =
    discovered.find((b) => b.id === buyerId) ||
    discovered.find((b) => b.company === buyerCompany);
  if (dh) {
    return {
      phone: (dh as unknown as { phone?: string }).phone,
      linkedinUrl: (dh as unknown as { linkedinUrl?: string }).linkedinUrl,
    };
  }
  const stat =
    BUYERS.find((b) => b.id === buyerId) ||
    BUYERS.find((b) => b.company === buyerCompany);
  if (stat) {
    return {
      phone: (stat as unknown as { phone?: string }).phone,
      linkedinUrl: (stat as unknown as { linkedinUrl?: string }).linkedinUrl,
    };
  }
  return {};
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const channel = (url.searchParams.get("channel") ?? "").toLowerCase() as Channel;
  if (channel !== "sms" && channel !== "linkedin") {
    return NextResponse.json(
      { error: "Missing or invalid ?channel — must be 'sms' or 'linkedin'" },
      { status: 400 },
    );
  }

  const draft = await store.getDraft(params.id);
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  if (draft.status === "rejected") {
    return NextResponse.json(
      { error: "Draft was rejected — cannot send" },
      { status: 400 },
    );
  }

  // Idempotency — if this channel has already sent, return early
  const alreadySent =
    channel === "sms" ? !!draft.smsSentAt : !!draft.linkedinSentAt;
  if (alreadySent) {
    return NextResponse.json({ ok: true, already: true, draft });
  }

  // Resolve destination
  const contact = await findBuyerContact(draft.buyerId, draft.buyerCompany);
  const destination = channel === "sms" ? contact.phone : contact.linkedinUrl;
  // Both channels can simulate without a real destination — for SMS we still
  // pass through to the lib so the simulated path runs. LinkedIn is always simulated.
  const fallbackDest =
    channel === "sms"
      ? `+10000000000`
      : `linkedin.com/in/${draft.buyerName.toLowerCase().replace(/\s+/g, "-")}`;
  const to = destination || fallbackDest;

  // ─── Auto-mint a recipient-scoped tracked link with channel suffix ─────
  let shareLinkToken: string | undefined =
    channel === "sms" ? draft.smsShareLinkToken : draft.linkedinShareLinkToken;
  let shareLinkUrl: string | undefined =
    channel === "sms" ? draft.smsShareLinkUrl : draft.linkedinShareLinkUrl;
  let shareLinkError: string | undefined;

  if (draft.pipelineId && !shareLinkToken) {
    try {
      const run = await store.getPipelineRun(draft.pipelineId);
      if (run) {
        const channelTag = channel === "sms" ? "[SMS]" : "[LinkedIn]";
        const link: ShareLink = {
          token: genShareToken(),
          label: `${draft.buyerCompany} (${draft.productName}) ${channelTag}`,
          createdAt: new Date().toISOString(),
          expiresAt: expiryFromTtlHours(720), // 30 days, same as email
          scope: "recipient",
        };
        const minted = await store.addShareLink(run.id, link);
        if (minted) {
          shareLinkToken = link.token;
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
      shareLinkError = e instanceof Error ? e.message : "share-link mint failed";
    }
  }

  // Build channel-specific body
  const baseBody = channel === "sms" ? draft.sms.body : draft.linkedin.body;
  // SMS is short — we use a short URL form. LinkedIn DMs are roomier — full prose.
  const enrichedBody = shareLinkUrl
    ? channel === "sms"
      ? `${baseBody} ${shareLinkUrl}`
      : `${baseBody}\n\n— Full proposal: ${shareLinkUrl}`
    : baseBody;

  const result =
    channel === "sms"
      ? await sendSms({
          to,
          body: enrichedBody,
          metadata: {
            draftId: draft.id,
            buyerCompany: draft.buyerCompany,
            shareLinkToken: shareLinkToken || "",
          },
        })
      : await sendLinkedIn({
          to,
          body: enrichedBody,
          metadata: {
            draftId: draft.id,
            buyerCompany: draft.buyerCompany,
            shareLinkToken: shareLinkToken || "",
          },
        });

  const patch: Record<string, unknown> = {};
  if (channel === "sms") {
    if (!result.ok) {
      patch.smsSendError = result.errorMessage ?? "SMS failed";
      patch.smsShareLinkToken = shareLinkToken;
      patch.smsShareLinkUrl = shareLinkUrl;
    } else {
      patch.smsSentAt = new Date().toISOString();
      patch.smsSentTo = result.sentTo;
      patch.smsSimulated = result.simulated;
      patch.smsMessageId = result.messageId;
      patch.smsSentBody = enrichedBody;
      patch.smsShareLinkToken = shareLinkToken;
      patch.smsShareLinkUrl = shareLinkUrl;
      patch.smsSendError = undefined;
    }
  } else {
    if (!result.ok) {
      patch.linkedinSendError = result.errorMessage ?? "LinkedIn failed";
      patch.linkedinShareLinkToken = shareLinkToken;
      patch.linkedinShareLinkUrl = shareLinkUrl;
    } else {
      patch.linkedinSentAt = new Date().toISOString();
      patch.linkedinSentTo = result.sentTo;
      patch.linkedinSimulated = result.simulated;
      patch.linkedinSentBody = enrichedBody;
      patch.linkedinShareLinkToken = shareLinkToken;
      patch.linkedinShareLinkUrl = shareLinkUrl;
      patch.linkedinSendError = undefined;
    }
  }

  const updated = await store.patchDraft(draft.id, patch);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.errorMessage ?? "Send failed", draft: updated, result, shareLinkError },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    draft: updated,
    result,
    shareLink: shareLinkToken ? { token: shareLinkToken, url: shareLinkUrl } : null,
    shareLinkError,
  });
}
