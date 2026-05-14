import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { tasksStore, type TaskCallOutcome } from "@/lib/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tasks/[id]/attempts — append a call attempt to a task.
 * Body: { at?, durationSec?, outcome, notes?, callbackAt?, callSid? }
 * Capability: leads:write.
 */
const VALID_OUTCOMES: TaskCallOutcome[] = [
  "connected",
  "voicemail",
  "no-answer",
  "wrong-number",
  "callback-scheduled",
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "leads:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const outcomeRaw = typeof body.outcome === "string" ? body.outcome : "";
  if (!VALID_OUTCOMES.includes(outcomeRaw as TaskCallOutcome)) {
    return NextResponse.json(
      { error: `outcome must be one of ${VALID_OUTCOMES.join(", ")}` },
      { status: 400 },
    );
  }

  const updated = await tasksStore.appendAttempt(id, {
    at: typeof body.at === "string" ? body.at : new Date().toISOString(),
    durationSec: typeof body.durationSec === "number" ? Math.round(body.durationSec) : undefined,
    outcome: outcomeRaw as TaskCallOutcome,
    notes: typeof body.notes === "string" ? body.notes.slice(0, 2000) : undefined,
    callbackAt: typeof body.callbackAt === "string" ? body.callbackAt : undefined,
    callSid: typeof body.callSid === "string" ? body.callSid : undefined,
  });
  if (!updated) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ ok: true, task: updated });
}
