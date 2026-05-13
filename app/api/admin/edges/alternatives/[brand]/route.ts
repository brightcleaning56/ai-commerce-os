import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runBrandAlternativesScan } from "@/lib/agents/brandAlternatives";
import { checkKillSwitch } from "@/lib/killSwitch";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/admin/edges/alternatives/[brand]
 * Returns existing alternatives for the URL-decoded brand. 404 if
 * none generated yet.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ brand: string }> },
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { brand: rawBrand } = await params;
  const brand = decodeURIComponent(rawBrand ?? "").trim();
  if (!brand) return NextResponse.json({ error: "brand required" }, { status: 400 });

  const alternative = await store.getBrandAlternative(brand);
  if (!alternative) {
    return NextResponse.json(
      { error: "No alternatives generated for this brand yet", brand },
      { status: 404 },
    );
  }
  return NextResponse.json({ alternative });
}

/**
 * POST /api/admin/edges/alternatives/[brand]
 * Generates (or regenerates) alternatives for the named brand. Builds
 * context from the SupplyEdge graph automatically; operator can pass
 * an explicit category override in the body.
 *
 * Body (optional): { explicitCategory?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ brand: string }> },
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const ks = await checkKillSwitch();
  if (ks.killed) {
    return NextResponse.json(
      { error: `Agents paused: ${ks.state.reason ?? "kill switch active"}. Resume at /admin.` },
      { status: 503 },
    );
  }

  const { brand: rawBrand } = await params;
  const brand = decodeURIComponent(rawBrand ?? "").trim();
  if (!brand) return NextResponse.json({ error: "brand required" }, { status: 400 });

  let body: { explicitCategory?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — generation uses graph-derived context
  }

  const explicitCategory =
    typeof body.explicitCategory === "string" && body.explicitCategory.trim()
      ? body.explicitCategory.trim()
      : undefined;

  const { alternative } = await runBrandAlternativesScan(brand, { explicitCategory });
  return NextResponse.json({ ok: true, alternative });
}
