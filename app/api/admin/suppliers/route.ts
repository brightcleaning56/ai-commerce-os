import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import {
  supplierRegistry,
  type SupplierKind,
  type SupplierRecord,
  type SupplierTier,
} from "@/lib/supplierRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_KINDS: SupplierKind[] = ["Manufacturer", "Wholesaler", "Distributor", "Dropship"];
const VALID_TIERS: SupplierTier[] = ["unverified", "basic", "verified", "trusted", "enterprise"];
const VALID_STATUSES: SupplierRecord["status"][] = ["pending", "active", "rejected", "suspended"];
const VALID_SOURCES: SupplierRecord["source"][] = ["manual", "self-signup", "csv-import", "agent-discovery"];

/**
 * GET /api/admin/suppliers — list registered suppliers with optional
 * filters (tier, status, country, kind, query).
 *
 * Capability: leads:read. Suppliers are the inverse side of the
 * lead funnel — anyone who can see leads can see suppliers.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "leads:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const url = new URL(req.url);
  const tier = url.searchParams.get("tier");
  const status = url.searchParams.get("status");
  const country = url.searchParams.get("country");
  const kind = url.searchParams.get("kind");
  const query = url.searchParams.get("q") ?? undefined;

  const suppliers = await supplierRegistry.list({
    tier: tier && VALID_TIERS.includes(tier as SupplierTier) ? (tier as SupplierTier) : undefined,
    status:
      status && VALID_STATUSES.includes(status as SupplierRecord["status"])
        ? (status as SupplierRecord["status"])
        : undefined,
    country: country ?? undefined,
    kind: kind && VALID_KINDS.includes(kind as SupplierKind) ? (kind as SupplierKind) : undefined,
    query,
  });

  return NextResponse.json({ suppliers, count: suppliers.length });
}

/**
 * POST /api/admin/suppliers — create a new supplier.
 *
 * Required body fields: legalName, email, country, kind, categories[]
 * Optional: dbaName, registrationNumber, taxId, yearFounded, phone,
 *   website, state, city, address1, zip, moq, leadTimeDays,
 *   capacityUnitsPerMo, source, internalNotes
 *
 * Capability: leads:write. New supplier records always start at tier
 * "unverified" — caller (or a follow-up POST to /verify) needs to run
 * verification to graduate them.
 */
export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "leads:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Required field validation.
  const legalName = typeof body.legalName === "string" ? body.legalName.trim().slice(0, 200) : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const country = typeof body.country === "string" ? body.country.trim().toUpperCase().slice(0, 2) : "";
  const kind = typeof body.kind === "string" && VALID_KINDS.includes(body.kind as SupplierKind)
    ? (body.kind as SupplierKind)
    : null;
  const categories = Array.isArray(body.categories)
    ? body.categories
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 20)
    : [];

  if (!legalName) return NextResponse.json({ error: "legalName is required" }, { status: 400 });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (!country || country.length !== 2) {
    return NextResponse.json({ error: "country (ISO-3166 alpha-2) is required" }, { status: 400 });
  }
  if (!kind) {
    return NextResponse.json(
      { error: `kind must be one of ${VALID_KINDS.join(", ")}` },
      { status: 400 },
    );
  }

  // Optional string fields, all length-capped to avoid abuse.
  const str = (k: string, max = 200): string | undefined => {
    const v = body[k];
    return typeof v === "string" ? v.trim().slice(0, max) || undefined : undefined;
  };
  const num = (k: string, min = 0, max = Number.MAX_SAFE_INTEGER): number | undefined => {
    const v = body[k];
    if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
    if (v < min || v > max) return undefined;
    return Math.round(v);
  };

  const source =
    typeof body.source === "string" && VALID_SOURCES.includes(body.source as SupplierRecord["source"])
      ? (body.source as SupplierRecord["source"])
      : "manual";

  const supplier = await supplierRegistry.create({
    legalName,
    email,
    country,
    kind,
    categories,
    dbaName: str("dbaName"),
    registrationNumber: str("registrationNumber", 80),
    taxId: str("taxId", 40),
    yearFounded: num("yearFounded", 1800, new Date().getFullYear()),
    phone: str("phone", 40),
    website: str("website", 200),
    state: str("state", 80),
    city: str("city", 80),
    address1: str("address1", 200),
    zip: str("zip", 20),
    moq: num("moq", 1),
    leadTimeDays: num("leadTimeDays", 0, 365),
    capacityUnitsPerMo: num("capacityUnitsPerMo", 0),
    status: "pending",
    source,
    internalNotes: str("internalNotes", 2000),
  });

  return NextResponse.json({ ok: true, supplier });
}
