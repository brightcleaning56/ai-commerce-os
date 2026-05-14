import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { tasksStore, type TaskCallOutcome } from "@/lib/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tasks/[id] — single-task lookup.
 * PATCH /api/tasks/[id] — partial update (whitelisted fields).
 * DELETE /api/tasks/[id] — remove from the shared store.
 *
 * Capabilities mirror /api/tasks (leads:read for GET, leads:write
 * for PATCH/DELETE).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "leads:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  const task = await tasksStore.get(id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ task });
}

export async function PATCH(
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

  const patch: Parameters<typeof tasksStore.patch>[1] = {};
  if (typeof body.done === "boolean") patch.done = body.done;
  if (typeof body.buyerPhone === "string") patch.buyerPhone = body.buyerPhone.trim().slice(0, 40);
  if (typeof body.buyerEmail === "string") patch.buyerEmail = body.buyerEmail.trim().slice(0, 200);
  if (typeof body.type === "string" && (body.type === "phone" || body.type === "sequence")) {
    patch.type = body.type;
  }
  if (Array.isArray(body.attempts)) {
    patch.attempts = (body.attempts as unknown[])
      .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
      .map((a) => ({
        at: typeof a.at === "string" ? a.at : new Date().toISOString(),
        durationSec: typeof a.durationSec === "number" ? Math.round(a.durationSec) : undefined,
        outcome: typeof a.outcome === "string" ? (a.outcome as TaskCallOutcome) : "no-answer",
        notes: typeof a.notes === "string" ? a.notes.slice(0, 2000) : undefined,
        callbackAt: typeof a.callbackAt === "string" ? a.callbackAt : undefined,
        callSid: typeof a.callSid === "string" ? a.callSid : undefined,
      }));
  }

  const updated = await tasksStore.patch(id, patch);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, task: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "leads:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  const removed = await tasksStore.remove(id);
  if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
