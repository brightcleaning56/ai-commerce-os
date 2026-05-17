import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/leads/[id]/log-call/[callSid] — slice 106.
 *
 * Edit the text of a MANUAL transcript entry (slice 93). Only entries
 * with callSid prefixed "manual_" are editable -- real Twilio
 * transcripts are immutable source-of-truth and must not be hand-
 * modified.
 *
 * Body: { notes: string (required, <= 4000 chars) }
 *
 * Capability: leads:write -- same as log-call POST.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; callSid: string }> },
) {
  const auth = await requireCapability(req, "leads:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id, callSid } = await params;
  if (!callSid.startsWith("manual_")) {
    return NextResponse.json(
      { error: "Only manual entries can be edited" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (!notes) {
    return NextResponse.json({ error: "notes required" }, { status: 400 });
  }

  const lead = await store.getLead(id);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = lead.callTranscripts ?? [];
  const idx = existing.findIndex((c) => c.callSid === callSid);
  if (idx === -1) {
    return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
  }

  const next = existing.slice();
  next[idx] = { ...next[idx], text: notes.slice(0, 4000) };
  const updated = await store.updateLead(id, { callTranscripts: next });
  if (!updated) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  return NextResponse.json({ ok: true, entry: next[idx], lead: updated });
}

/**
 * DELETE /api/leads/[id]/log-call/[callSid] — slice 106.
 *
 * Remove a MANUAL transcript entry. Same prefix guard as PATCH --
 * Twilio entries stay immutable.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; callSid: string }> },
) {
  const auth = await requireCapability(req, "leads:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id, callSid } = await params;
  if (!callSid.startsWith("manual_")) {
    return NextResponse.json(
      { error: "Only manual entries can be deleted" },
      { status: 403 },
    );
  }

  const lead = await store.getLead(id);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = lead.callTranscripts ?? [];
  const next = existing.filter((c) => c.callSid !== callSid);
  if (next.length === existing.length) {
    return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
  }
  const updated = await store.updateLead(id, { callTranscripts: next });
  if (!updated) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
