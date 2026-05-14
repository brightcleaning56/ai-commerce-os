import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { supplierRegistry, type SupplierRecord } from "@/lib/supplierRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/suppliers/[id] — single supplier + full verification
 * audit trail. Capability: leads:read.
 *
 * PATCH /api/admin/suppliers/[id] — operator edits a supplier record.
 * Capability: leads:write. Can update most fields; cannot edit
 * `verificationRuns` directly (use /verify endpoint to append a run)
 * or `tier` (derived from runs).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "leads:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  const supplier = await supplierRegistry.get(id);
  if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ supplier });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "leads:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Whitelist of editable fields. Tier + verificationRuns are
  // intentionally excluded — they're derived from /verify runs.
  const patch: Partial<Omit<SupplierRecord, "id" | "createdAt">> = {};
  const str = (k: keyof SupplierRecord, max = 200) => {
    const v = body[k as string];
    if (typeof v === "string") patch[k as keyof typeof patch] = v.trim().slice(0, max) as never;
  };
  str("legalName");
  str("dbaName");
  str("registrationNumber", 80);
  str("taxId", 40);
  str("email");
  str("phone", 40);
  str("website");
  str("state", 80);
  str("city", 80);
  str("address1");
  str("zip", 20);
  str("country", 2);
  str("internalNotes", 2000);
  str("stripeConnectAccountId", 80);

  if (Array.isArray(body.categories)) {
    patch.categories = body.categories
      .filter((c): c is string => typeof c === "string")
      .map((c) => c.trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 20);
  }
  if (typeof body.kind === "string" && ["Manufacturer", "Wholesaler", "Distributor", "Dropship"].includes(body.kind)) {
    patch.kind = body.kind as SupplierRecord["kind"];
  }
  if (typeof body.status === "string" && ["pending", "active", "rejected", "suspended"].includes(body.status)) {
    patch.status = body.status as SupplierRecord["status"];
  }
  if (typeof body.moq === "number" && body.moq >= 1) patch.moq = Math.round(body.moq);
  if (typeof body.leadTimeDays === "number" && body.leadTimeDays >= 0) {
    patch.leadTimeDays = Math.round(body.leadTimeDays);
  }
  if (typeof body.capacityUnitsPerMo === "number" && body.capacityUnitsPerMo >= 0) {
    patch.capacityUnitsPerMo = Math.round(body.capacityUnitsPerMo);
  }
  if (typeof body.yearFounded === "number") {
    const y = Math.round(body.yearFounded);
    if (y >= 1800 && y <= new Date().getFullYear()) patch.yearFounded = y;
  }

  const updated = await supplierRegistry.update(id, patch);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, supplier: updated });
}
