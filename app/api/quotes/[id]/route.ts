import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public quote view — gated by shareToken in ?t=<token>.
 * If no token is presented, only the basic existence check passes; full body
 * requires the token. Pattern matches /api/share/[id].
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const quote = await store.getQuote(params.id);
  if (!quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  const token = req.nextUrl.searchParams.get("t") || "";
  if (!token || token !== quote.shareToken) {
    return NextResponse.json({ error: "Invalid or missing share token" }, { status: 403 });
  }
  // Expiry check
  if (Date.now() > new Date(quote.shareExpiresAt).getTime()) {
    return NextResponse.json(
      { error: "Quote link expired", expiredAt: quote.shareExpiresAt },
      { status: 410 },
    );
  }
  return NextResponse.json({ quote });
}

/**
 * Update quote lifecycle status (accept / reject / sent). Sender-side only
 * (no token required since it's an authenticated app endpoint).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { status?: "draft" | "sent" | "accepted" | "rejected" | "expired" } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.status) {
    return NextResponse.json({ error: "Missing status" }, { status: 400 });
  }
  const allowed = ["draft", "sent", "accepted", "rejected", "expired"];
  if (!allowed.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const patch: Record<string, unknown> = { status: body.status };
  if (body.status === "accepted") patch.acceptedAt = new Date().toISOString();
  if (body.status === "rejected") patch.rejectedAt = new Date().toISOString();
  const updated = await store.patchQuote(params.id, patch);
  if (!updated) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  // Auto-promote draft if quote is accepted/rejected
  if (body.status === "accepted") {
    await store.patchDraft(updated.draftId, { dealStage: "Closed Won" });
  } else if (body.status === "rejected") {
    await store.patchDraft(updated.draftId, { dealStage: "Closed Lost" });
  }
  return NextResponse.json({ ok: true, quote: updated });
}
