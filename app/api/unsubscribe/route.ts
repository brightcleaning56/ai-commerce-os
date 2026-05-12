import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { verifyUnsubscribeToken } from "@/lib/unsubscribeToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/unsubscribe
 *
 * Body: { email: string, token: string, reason?: string }
 *
 * Adds the email to the suppression list AND propagates the suppression
 * to any matching BusinessRecord / Lead records so the rest of the
 * platform sees DNC immediately (defense-in-depth).
 *
 * This endpoint is PUBLIC — the token IS the auth. Anyone with a valid
 * (email, token) pair can unsubscribe that email. That matches CAN-SPAM
 * "one-click unsubscribe" intent.
 *
 * Also supports RFC 8058 one-click POST: Gmail / iCloud unsubscribe
 * buttons hit this with form-encoded "List-Unsubscribe=One-Click" —
 * we accept that shape too.
 */
export async function POST(req: NextRequest) {
  // Read body once — could be JSON OR form-encoded (RFC 8058)
  let email = "";
  let token = "";
  let reason: string | undefined;

  const ctype = (req.headers.get("content-type") ?? "").toLowerCase();
  try {
    if (ctype.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      const params = new URLSearchParams(text);
      // RFC 8058: presence of List-Unsubscribe=One-Click is the signal.
      // The actual email + token are appended to the unsubscribe URL by
      // the email client when it POSTs back — they live in either the
      // body or the URL. We accept either.
      email = params.get("email") ?? "";
      token = params.get("token") ?? "";
    } else {
      const body = await req.json().catch(() => ({}));
      email = typeof body.email === "string" ? body.email : "";
      token = typeof body.token === "string" ? body.token : "";
      reason = typeof body.reason === "string" ? body.reason.slice(0, 200) : undefined;
    }
  } catch {
    // Fall through — empty email/token will fail validation below
  }

  // RFC 8058 one-click POSTs often arrive with email + token in the
  // URL query string, not the body. Pick those up too.
  if (!email) email = req.nextUrl.searchParams.get("e") ?? req.nextUrl.searchParams.get("email") ?? "";
  if (!token) token = req.nextUrl.searchParams.get("t") ?? req.nextUrl.searchParams.get("token") ?? "";

  email = email.trim().toLowerCase();

  if (!email || !token) {
    return NextResponse.json(
      { error: "email and token required" },
      { status: 400 },
    );
  }

  if (!verifyUnsubscribeToken(email, token)) {
    return NextResponse.json(
      { error: "Invalid or expired unsubscribe token" },
      { status: 403 },
    );
  }

  // ─── Persist to the suppression list ────────────────────────────────
  const sup = await store.addEmailSuppression({
    email,
    source: "unsubscribe",
    reason: reason ?? "Unsubscribe via email link",
  });

  // ─── Defense-in-depth: mark matching BusinessRecord / Lead ──────────
  // The suppression list is the canonical source of truth, but several
  // pre-existing flows check BusinessRecord.doNotContact / Lead.status
  // directly. Propagate so they don't accidentally route around the list.
  try {
    const biz = await store.getBusinessByEmail(email);
    if (biz && !biz.doNotContact) {
      await store.updateBusiness(biz.id, {
        doNotContact: true,
        optedOutAt: new Date().toISOString(),
        optedOutReason: reason ?? "Unsubscribe via email link",
        status: "do_not_contact",
      });
    }
  } catch (e) {
    console.warn("[unsubscribe] business propagation failed:", e instanceof Error ? e.message : e);
  }
  try {
    const lead = await store.getLeadByEmail(email);
    if (lead && lead.status !== "lost") {
      await store.updateLead(lead.id, {
        status: "lost",
        notes: [lead.notes, `Unsubscribed ${new Date().toISOString().slice(0, 10)}: ${reason ?? "via email link"}`]
          .filter(Boolean)
          .join("\n"),
      });
    }
  } catch (e) {
    console.warn("[unsubscribe] lead propagation failed:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({
    ok: true,
    email,
    suppressionId: sup.id,
    addedAt: sup.addedAt,
  });
}
