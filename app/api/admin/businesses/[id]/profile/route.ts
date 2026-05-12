import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runBusinessProfileScan } from "@/lib/agents/businessProfile";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/businesses/[id]/profile — run the AI Profile Scan
 * on a single business. Fetches the homepage, asks Claude to extract
 * what they sell + likely suppliers + distributors, and persists the
 * result on the business record.
 *
 * Idempotent: re-running overwrites the previous aiProfile (operator
 * can re-scan after the website updates). Use the bulk endpoint
 * (/profile-batch) for >1 at a time.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const biz = await store.getBusiness(id);
  if (!biz) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { profile, fetchedUrl } = await runBusinessProfileScan(biz);
  return NextResponse.json({
    ok: true,
    businessId: id,
    profile,
    fetchedUrl,
  });
}
