import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import {
  store,
  type BusinessRecord,
  type BusinessSource,
  type BusinessStatus,
} from "@/lib/store";

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

/**
 * GET /api/admin/businesses â€” list with optional filters.
 *
 * Query params (all optional):
 *   q       text search across name/email/website/notes
 *   state   2-letter state code
 *   city    case-insensitive city match
 *   zip     prefix match (so "752" finds 75201, 75202, etc.)
 *   industry case-insensitive substring match
 *   status  exact match (active|queued|contacted|...)
 *   source  exact match (manual|csv_import|lead_promote|...)
 *   tag     exact tag match
 *   limit   max rows returned (default 500, hard cap 5000)
 *   offset  pagination offset
 *
 * Returns: { businesses, total, filteredTotal, counts: { byStatus, byState } }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const state = (sp.get("state") ?? "").trim().toUpperCase();
  const city = (sp.get("city") ?? "").trim().toLowerCase();
  const zip = (sp.get("zip") ?? "").trim();
  const industry = (sp.get("industry") ?? "").trim().toLowerCase();
  const statusFilter = sp.get("status") as BusinessStatus | null;
  const sourceFilter = sp.get("source") as BusinessSource | null;
  const tag = (sp.get("tag") ?? "").trim();
  const limitRaw = parseInt(sp.get("limit") ?? "500", 10);
  const offsetRaw = parseInt(sp.get("offset") ?? "0", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5000) : 500;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  const all = await store.getBusinesses();

  // Build per-status + per-state counts BEFORE filtering â€” operator sees true totals
  const byStatus: Record<string, number> = {};
  const byState: Record<string, number> = {};
  for (const b of all) {
    byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;
    if (b.state) byState[b.state] = (byState[b.state] ?? 0) + 1;
  }

  const filtered = all.filter((b) => {
    if (statusFilter && VALID_STATUSES.includes(statusFilter) && b.status !== statusFilter) return false;
    if (sourceFilter && b.source !== sourceFilter) return false;
    if (state && (b.state ?? "").toUpperCase() !== state) return false;
    if (city && (b.city ?? "").toLowerCase() !== city) return false;
    if (zip && !(b.zip ?? "").startsWith(zip)) return false;
    if (industry && !(b.industry ?? "").toLowerCase().includes(industry)) return false;
    if (tag && !(b.tags ?? []).includes(tag)) return false;
    if (q) {
      const hay = [
        b.name,
        b.email,
        b.website,
        b.notes,
        b.contactName,
        b.industry,
        b.city,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const page = filtered.slice(offset, offset + limit);

  return NextResponse.json({
    businesses: page,
    total: all.length,
    filteredTotal: filtered.length,
    counts: { byStatus, byState },
    appliedFilter: { q, state, city, zip, industry, status: statusFilter, source: sourceFilter, tag, limit, offset },
  });
}

/**
 * POST /api/admin/businesses â€” create one record.
 * Body: BusinessRecord-shaped fields except id/createdAt/updatedAt.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const status = typeof body.status === "string" && VALID_STATUSES.includes(body.status as BusinessStatus)
    ? (body.status as BusinessStatus)
    : "active";

  const now = new Date().toISOString();
  const rec: BusinessRecord = {
    id: `biz_${crypto.randomBytes(6).toString("hex")}`,
    name,
    country: typeof body.country === "string" ? body.country : "US",
    status,
    source: "manual",
    createdAt: now,
    updatedAt: now,
    // Pass-through optional fields
    email: typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined,
    phone: typeof body.phone === "string" ? body.phone.trim() : undefined,
    website: typeof body.website === "string" ? body.website.trim() : undefined,
    address1: typeof body.address1 === "string" ? body.address1 : undefined,
    address2: typeof body.address2 === "string" ? body.address2 : undefined,
    city: typeof body.city === "string" ? body.city : undefined,
    county: typeof body.county === "string" ? body.county : undefined,
    state: typeof body.state === "string" ? body.state.toUpperCase() : undefined,
    zip: typeof body.zip === "string" ? body.zip.trim() : undefined,
    industry: typeof body.industry === "string" ? body.industry : undefined,
    naicsCode: typeof body.naicsCode === "string" ? body.naicsCode : undefined,
    contactName: typeof body.contactName === "string" ? body.contactName : undefined,
    contactTitle: typeof body.contactTitle === "string" ? body.contactTitle : undefined,
    notes: typeof body.notes === "string" ? body.notes : undefined,
    tags: Array.isArray(body.tags) ? (body.tags as string[]).filter((t) => typeof t === "string") : undefined,
  };

  await store.addBusiness(rec);
  return NextResponse.json({ ok: true, business: rec });
}
