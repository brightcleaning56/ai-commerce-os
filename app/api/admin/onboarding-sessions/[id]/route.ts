import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { listDocumentsForSession } from "@/lib/onboardingVerification";
import { onboardingSessions } from "@/lib/onboardingState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/onboarding-sessions/[id] — full session payload for
 * the operator-facing detail view.
 *
 * Returns the session + uploaded-document metadata (filename + size +
 * uploadedAt; binary not included). The detail page renders the
 * answers map as a step-by-step playback so the operator can see
 * what the user actually entered.
 *
 * DELETE /api/admin/onboarding-sessions/[id] — admin can hard-remove
 * a session (e.g. spam, test data). Doesn't cascade to created records
 * (BusinessRecord/SupplierRecord stay -- delete those via their own
 * surfaces).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "users:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const session = await onboardingSessions.get(id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const docs = await listDocumentsForSession(id).catch(() => []);

  return NextResponse.json({
    session,
    documents: docs,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "users:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  const removed = await onboardingSessions.remove(id);
  if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
