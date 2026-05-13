import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { store, type EmailSuppressionSource } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SOURCES: EmailSuppressionSource[] = [
  "unsubscribe",
  "complaint",
  "operator",
  "import",
  "hard_bounce",
];

/**
 * GET /api/admin/suppressions â€” list every email on the suppression
 * list. Sorted newest-first. Supports filtering by source + query.
 *
 * Query params:
 *   q       text search across email + reason
 *   source  exact match on source enum
 *   limit   max rows (default 500, max 5000)
 *
 * Returns:
 *   { suppressions, total, filteredTotal, counts: { bySource } }
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "system:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const sourceFilter = sp.get("source") as EmailSuppressionSource | null;
  const limitRaw = parseInt(sp.get("limit") ?? "500", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5000) : 500;

  const all = await store.getEmailSuppressions();
  const sorted = all
    .slice()
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());

  // Counts BEFORE filtering â€” operator sees the real distribution
  const bySource: Record<string, number> = {};
  for (const s of sorted) {
    bySource[s.source] = (bySource[s.source] ?? 0) + 1;
  }

  const filtered = sorted.filter((s) => {
    if (sourceFilter && VALID_SOURCES.includes(sourceFilter) && s.source !== sourceFilter) {
      return false;
    }
    if (q) {
      const hay = `${s.email} ${s.reason ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return NextResponse.json({
    suppressions: filtered.slice(0, limit),
    total: all.length,
    filteredTotal: filtered.length,
    counts: { bySource },
  });
}

/**
 * POST /api/admin/suppressions â€” operator manually adds an email to
 * the suppression list. Source is forced to "operator" for audit
 * clarity. The body's reason is preserved.
 */
export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "system:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: { email?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 200) : undefined;
  const op = getOperator();

  const sup = await store.addEmailSuppression({
    email,
    source: "operator",
    reason: reason ?? `Manually added by ${op.email}`,
  });

  // Same defense-in-depth as the public unsubscribe endpoint â€”
  // propagate DNC to BusinessRecord + Lead.
  try {
    const biz = await store.getBusinessByEmail(email);
    if (biz && !biz.doNotContact) {
      await store.updateBusiness(biz.id, {
        doNotContact: true,
        optedOutAt: new Date().toISOString(),
        optedOutReason: reason ?? "operator-added DNC",
        status: "do_not_contact",
      });
    }
  } catch {
    // best-effort
  }

  return NextResponse.json({ ok: true, suppression: sup });
}
