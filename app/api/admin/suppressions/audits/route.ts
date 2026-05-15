import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { suppressionAudits } from "@/lib/suppressionAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/suppressions/audits — list resubscribe / add /
 * import audit entries.
 *
 * Query: ?action=remove|add|import   ?limit=N (default 200, max 5000)
 *
 * Capability: system:read.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "system:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const sp = req.nextUrl.searchParams;
  const action = sp.get("action") as "remove" | "add" | "import" | null;
  const limitRaw = parseInt(sp.get("limit") ?? "200", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5000) : 200;

  const audits = await suppressionAudits.list({
    action: action ?? undefined,
    limit,
  });
  return NextResponse.json({ audits });
}
