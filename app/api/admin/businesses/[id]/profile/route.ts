import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { runBusinessProfileScan } from "@/lib/agents/businessProfile";
import { checkKillSwitch } from "@/lib/killSwitch";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/businesses/[id]/profile â€” run the AI Profile Scan
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
  const auth = await requireCapability(req, "leads:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const ks = await checkKillSwitch();
  if (ks.killed) {
    return NextResponse.json(
      { error: `Agents paused: ${ks.state.reason ?? "kill switch active"}. Resume at /admin.` },
      { status: 503 },
    );
  }

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
