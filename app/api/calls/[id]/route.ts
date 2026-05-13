import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { callsStore, type CallOutcome } from "@/lib/calls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/calls/[id] — single call.
 * PATCH /api/calls/[id] — update endedAt, outcome, notes, callSid.
 *
 * VoiceProvider PATCHes here on Device "disconnect" / "cancel" events
 * to write endedAt + outcome. /calls UI also PATCHes when an agent
 * sets a disposition (connected / voicemail / wrong-number / etc.) or
 * a callback time after the fact. Owners or anyone with voice:write
 * can edit any record — we don't yet enforce "only the agent who made
 * the call can update" because dispositions sometimes need to be
 * corrected by a supervisor. Audit logging of edits is a later slice.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "voice:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  const call = await callsStore.get(id);
  if (!call) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ call });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "voice:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Parameters<typeof callsStore.update>[1] = {};
  if (typeof body.endedAt === "string") patch.endedAt = body.endedAt;
  if (typeof body.callSid === "string") patch.callSid = body.callSid;
  if (typeof body.notes === "string") patch.notes = body.notes.slice(0, 2000);
  if (typeof body.recordingSid === "string") patch.recordingSid = body.recordingSid;
  if (typeof body.toContact === "string") patch.toContact = body.toContact.slice(0, 160);
  if (typeof body.durationSec === "number" && body.durationSec >= 0) {
    patch.durationSec = Math.round(body.durationSec);
  }
  const VALID_OUTCOMES: CallOutcome[] = [
    "connected", "voicemail", "no-answer", "wrong-number",
    "callback-scheduled", "missed", "failed",
  ];
  if (typeof body.outcome === "string" && VALID_OUTCOMES.includes(body.outcome as CallOutcome)) {
    patch.outcome = body.outcome as CallOutcome;
  }

  const updated = await callsStore.update(id, patch);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, call: updated });
}
