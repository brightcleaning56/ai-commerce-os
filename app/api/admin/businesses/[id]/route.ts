import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { store, type BusinessRecord, type BusinessStatus } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES: BusinessStatus[] = [
  "active",
  "queued",
  "contacted",
  "responded",
  "won",
  "lost",
  "do_not_contact",
];

const PATCHABLE: (keyof BusinessRecord)[] = [
  "name", "legalName", "ein",
  "email", "phone", "website",
  "address1", "address2", "city", "county", "state", "zip", "country",
  "lat", "lng",
  "industry", "naicsCode", "sicCode", "employeesBand", "revenueBand", "yearFounded",
  "contactName", "contactTitle",
  "status", "notes", "tags",
  "doNotContact", "optedOutAt", "optedOutReason",
];

/**
 * GET /api/admin/businesses/[id] â€” fetch one record.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  const business = await store.getBusiness(id);
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ business });
}

/**
 * PATCH /api/admin/businesses/[id] â€” partial update.
 * Only fields in PATCHABLE allow-list are applied.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const existing = await store.getBusiness(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.status === "string" && !VALID_STATUSES.includes(body.status as BusinessStatus)) {
    return NextResponse.json(
      { error: `status must be one of ${VALID_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  const patch: Partial<BusinessRecord> = {};
  for (const key of PATCHABLE) {
    if (key in body) {
      const val = body[key];
      if (val === null || val === undefined) continue;
      (patch as Record<string, unknown>)[key as string] = val;
    }
  }

  // Email is canonicalized to lowercase
  if (typeof patch.email === "string") patch.email = patch.email.trim().toLowerCase();
  if (typeof patch.state === "string") patch.state = patch.state.toUpperCase();

  const updated = await store.updateBusiness(id, patch);
  if (!updated) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ business: updated });
}

/**
 * DELETE /api/admin/businesses/[id] â€” hard-delete from the store.
 *
 * For records that received outreach you may prefer flipping
 * status="do_not_contact" instead â€” that preserves the audit trail and
 * the suppression check still blocks future sends. Hard-delete is for
 * removing accidental dupes / test rows.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  const ok = await store.deleteBusiness(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
