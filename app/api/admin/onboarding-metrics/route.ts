import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { onboardingSessions } from "@/lib/onboardingState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/onboarding-metrics — slice 26 system-health surface.
 *
 * Computes:
 *   - completion rate    completed / (completed + abandoned + active)
 *   - abandon rate       abandoned / total
 *   - avg time to complete (mins)
 *   - per-persona breakdown of started / completed
 *   - "stuck-on" most common currentStepId across active sessions
 *     (helps the operator spot a confusing step in any flow)
 *
 * Capability: system:read.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "system:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const all = await onboardingSessions.list();
  const total = all.length;
  const completed = all.filter((s) => s.status === "completed");
  const abandoned = all.filter((s) => s.status === "abandoned");
  const active = all.filter((s) => s.status === "active");

  // Avg time to complete in minutes
  const completionTimes = completed
    .map((s) => {
      if (!s.completedAt) return null;
      const ms = new Date(s.completedAt).getTime() - new Date(s.createdAt).getTime();
      return ms > 0 ? ms : null;
    })
    .filter((v): v is number => v !== null);
  const avgCompletionMs =
    completionTimes.length > 0
      ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
      : 0;

  // Per-persona breakdown
  const personas = ["admin", "team", "buyer", "supplier", "distributor"] as const;
  const byPersona = personas.map((p) => {
    const personaTotal = all.filter((s) => s.persona === p).length;
    const personaCompleted = completed.filter((s) => s.persona === p).length;
    return {
      persona: p,
      total: personaTotal,
      completed: personaCompleted,
      completionRate: personaTotal > 0 ? personaCompleted / personaTotal : 0,
    };
  });

  // Most-stuck step across active sessions
  const stuckCounts = new Map<string, number>();
  for (const s of active) {
    if (!s.currentStepId || !s.persona) continue;
    const key = `${s.persona}/${s.currentStepId}`;
    stuckCounts.set(key, (stuckCounts.get(key) ?? 0) + 1);
  }
  const stuckSteps = Array.from(stuckCounts.entries())
    .map(([key, count]) => {
      const [persona, stepId] = key.split("/");
      return { persona, stepId, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return NextResponse.json({
    total,
    completedCount: completed.length,
    abandonedCount: abandoned.length,
    activeCount: active.length,
    completionRate: total > 0 ? completed.length / total : 0,
    abandonRate: total > 0 ? abandoned.length / total : 0,
    avgCompletionMs,
    avgCompletionMinutes: Math.round(avgCompletionMs / 60_000),
    byPersona,
    stuckSteps,
  });
}
