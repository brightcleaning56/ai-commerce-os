import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { teamPrefs } from "@/lib/teamPrefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/team-prefs — list every teammate's onboarding-derived
 * preferences. Used by /admin/team-prefs viewer.
 *
 * Capability: users:read -- this is admin territory mirroring
 * /admin/users + /admin/onboarding-sessions.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "users:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const prefs = await teamPrefs.list();
  // Aggregate counts so the page can render headline tiles
  const summary = {
    total: prefs.length,
    byDepartment: prefs.reduce(
      (acc, p) => {
        if (p.department) acc[p.department] = (acc[p.department] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
    byPermission: prefs.reduce(
      (acc, p) => {
        acc[p.aiPermission] = (acc[p.aiPermission] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  };
  return NextResponse.json({ prefs, summary });
}
