import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { enrollmentsStore } from "@/lib/cadences";

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
