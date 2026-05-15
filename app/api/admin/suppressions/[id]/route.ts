import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { store } from "@/lib/store";
import { suppressionAudits } from "@/lib/suppressionAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/suppressions/[id] — remove an email/phone from
 * the suppression list (a.k.a. "resubscribe"). Used SPARINGLY — only
 * when the operator has explicit re-opt-in consent from the recipient.
 * Removing without consent is a CAN-SPAM violation.
 *
 * Slice 30 hardening:
 *   - REQUIRES `consentReason` in the body. 412 if missing or too short.
 *   - Records the action to suppression-audits.json with the operator
 *     email + reason BEFORE the deletion lands. Audit survives even
 *     if the deletion adapter throws.
 *
 * Body: { consentReason: string (>=10 chars) }
 *
 * This endpoint does NOT propagate to BusinessRecord.doNotContact
 * automatically — operator should manually flip that flag too if
 * they want the business to be re-eligible for outreach. Keeping
 * these separate is intentional.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "system:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: { consentReason?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Body required for slice 30
  }

  const reason = (body.consentReason ?? "").trim();
  if (reason.length < 10) {
    return NextResponse.json(
      {
        error: "consentReason required (min 10 chars). CAN-SPAM § 7704 requires explicit recipient consent before re-enabling outreach.",
        gatedBy: "consent-audit",
      },
      { status: 412 },
    );
  }

  const { id } = await params;

  // Look up the suppression first so the audit captures contact +
  // source even after deletion.
  const all = await store.getEmailSuppressions();
  const target = all.find((s) => s.id === id);
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const actorEmail =
    "user" in auth && auth.user?.email
      ? auth.user.email
      : getOperator().email || "owner";

  // Audit FIRST -- survives a delete throw
  await suppressionAudits.record({
    action: "remove",
    email: target.email || undefined,
    phone: target.phone,
    channel: target.channel,
    actorEmail,
    consentReason: reason.slice(0, 500),
    suppressionId: target.id,
    source: target.source,
  });

  const ok = await store.removeEmailSuppression(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
