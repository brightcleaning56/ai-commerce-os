import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { enrollmentsStore } from "@/lib/cadences";
import { getWorkspaceConfig } from "@/lib/workspaceConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cadences/[id]/enroll — enroll a buyer in this cadence.
 *
 * Body:
 *   {
 *     buyerId: string,
 *     buyerName: string,
 *     buyerCompany: string,
 *     buyerEmail?: string,
 *     buyerPhone?: string,
 *   }
 *
 * Returns 409 if the buyer is already enrolled (active or paused) in
 * the same cadence — operator must stop or wait for completion before
 * re-enrolling. Block prevents accidental double-blast.
 *
 * GET /api/cadences/[id]/enroll — list current enrollments for this cadence.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "outreach:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  const enrollments = await enrollmentsStore.list({ cadenceId: id });
  return NextResponse.json({ enrollments });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "outreach:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;

  let body: {
    buyerId?: string;
    buyerName?: string;
    buyerCompany?: string;
    buyerEmail?: string;
    buyerPhone?: string;
    /** Optional 0-100 match-fit score. Used by aiAggressiveness gate
     *  in slice 25. Omitting bypasses the fit check (caller didn't
     *  compute a score, default to enroll). */
    fitScore?: number;
    /** Set true to bypass the fit gate (operator explicitly chose
     *  this buyer despite low fit). */
    overrideFit?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.buyerId || !body.buyerName || !body.buyerCompany) {
    return NextResponse.json(
      { error: "buyerId, buyerName, and buyerCompany are required" },
      { status: 400 },
    );
  }

  // Slice 25: aiAggressiveness gate. When workspace config is
  // "conservative", enrollments with a fitScore below the threshold
  // are blocked unless overrideFit=true. "balanced" uses a lower
  // threshold. "aggressive" bypasses entirely. Callers that don't
  // pass fitScore also bypass (we can't gate what we can't score).
  if (typeof body.fitScore === "number" && !body.overrideFit) {
    const wsConfig = await getWorkspaceConfig().catch(() => null);
    const aggressiveness = wsConfig?.aiAggressiveness ?? "balanced";
    const threshold =
      aggressiveness === "conservative" ? 70 : aggressiveness === "balanced" ? 50 : 0;
    if (body.fitScore < threshold) {
      return NextResponse.json(
        {
          error: `Buyer fit score ${body.fitScore} below workspace threshold ${threshold} (mode: ${aggressiveness}). Set overrideFit:true to enroll anyway.`,
          gatedBy: "aiAggressiveness",
          mode: aggressiveness,
          threshold,
          fitScore: body.fitScore,
        },
        { status: 412 },
      );
    }
  }

  try {
    const enrollment = await enrollmentsStore.create({
      cadenceId: id,
      buyerId: body.buyerId,
      buyerName: body.buyerName,
      buyerCompany: body.buyerCompany,
      buyerEmail: body.buyerEmail,
      buyerPhone: body.buyerPhone,
      enrolledBy: "email" in auth ? (auth as { email?: string }).email : undefined,
    });
    return NextResponse.json({ ok: true, enrollment }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to enroll";
    // Distinguish duplicate-enrollment from cadence-missing for caller UX
    const status = msg.includes("already enrolled") ? 409 : msg.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
