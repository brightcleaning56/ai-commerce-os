import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { listDocumentsForSession } from "@/lib/onboardingVerification";
import { onboardingSessions } from "@/lib/onboardingState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/onboarding-sessions — operator-facing list of every
 * onboarding session.
 *
 * Filters (query params):
 *   ?status=active|completed|abandoned   default: all
 *   ?persona=admin|team|buyer|supplier|distributor   default: all
 *   ?limit=N                              default 200
 *
 * For each session we attach a doc-count (without the binary payload)
 * so the list view can show a "3 docs" badge without round-tripping.
 *
 * Capability: users:read -- this is admin territory.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "users:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const sp = req.nextUrl.searchParams;
  const statusFilter = sp.get("status");
  const personaFilter = sp.get("persona");
  const limit = Math.min(Math.max(Number.parseInt(sp.get("limit") ?? "200", 10) || 200, 1), 2000);

  let sessions = await onboardingSessions.list();
  if (statusFilter) sessions = sessions.filter((s) => s.status === statusFilter);
  if (personaFilter) sessions = sessions.filter((s) => s.persona === personaFilter);

  // Newest first
  sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  sessions = sessions.slice(0, limit);

  // Attach doc count + answer count per session (light enrichment)
  const enriched = await Promise.all(
    sessions.map(async (s) => {
      const docs = await listDocumentsForSession(s.id).catch(() => []);
      const stepCount = Object.keys(s.answers).length;
      const answerCount = Object.values(s.answers).reduce(
        (sum, bucket) =>
          sum +
          Object.values(bucket as Record<string, unknown>).filter(
            (v) => v != null && v !== "" && (!Array.isArray(v) || v.length > 0),
          ).length,
        0,
      );
      return {
        id: s.id,
        persona: s.persona,
        status: s.status,
        email: s.email,
        currentStepId: s.currentStepId,
        emailVerified: s.emailVerified ?? false,
        documentCount: docs.length,
        documentKinds: s.documentsUploaded ?? [],
        stepCount,
        answerCount,
        resultUserId: s.resultUserId,
        resultRole: s.resultRole,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        completedAt: s.completedAt,
      };
    }),
  );

  // Aggregate counts for the dashboard tiles
  const all = await onboardingSessions.list();
  const summary = {
    total: all.length,
    active: all.filter((s) => s.status === "active").length,
    completed: all.filter((s) => s.status === "completed").length,
    abandoned: all.filter((s) => s.status === "abandoned").length,
    byPersona: {
      admin: all.filter((s) => s.persona === "admin").length,
      team: all.filter((s) => s.persona === "team").length,
      buyer: all.filter((s) => s.persona === "buyer").length,
      supplier: all.filter((s) => s.persona === "supplier").length,
      distributor: all.filter((s) => s.persona === "distributor").length,
    },
  };

  return NextResponse.json({ sessions: enriched, summary });
}
