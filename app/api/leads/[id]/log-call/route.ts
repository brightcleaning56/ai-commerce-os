import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/leads/[id]/log-call — slice 93.
 *
 * Manually append a call entry to lead.callTranscripts. Used when
 * the operator placed a call from their personal phone (the
 * tel: fallback path doesn't create a Twilio Call record, so the
 * slice 60 webhook auto-attach never fires) and wants to keep the
 * conversation history in /leads.
 *
 * Body:
 *   { notes: string (required, <= 4000 chars),
 *     direction?: "outbound" | "inbound" (default "outbound"),
 *     durationSec?: number (default 0) }
 *
 * Capability: leads:write -- same as updating status/notes.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "leads:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const lead = await store.getLead(id);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (!notes) {
    return NextResponse.json({ error: "notes required" }, { status: 400 });
  }
  const direction: "outbound" | "inbound" =
    body.direction === "inbound" ? "inbound" : "outbound";
  const durationSec =
    typeof body.durationSec === "number" && body.durationSec >= 0
      ? Math.min(86_400, Math.floor(body.durationSec))
      : 0;

  // Synthetic callSid -- distinct from Twilio's "CA<32-hex>" pattern so
  // we can tell manual entries apart in /calls and on the dedupe path
  // in slice 60 (which keys on callSid -- a manual entry will never
  // collide with a real Twilio one).
  const callSid = `manual_${crypto.randomBytes(6).toString("hex")}`;

  const entry = {
    at: new Date().toISOString(),
    callSid,
    durationSec,
    text: notes.slice(0, 4000),
    direction,
  };

  const next = [...(lead.callTranscripts ?? []), entry];
  const updated = await store.updateLead(id, { callTranscripts: next });
  if (!updated) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  return NextResponse.json({ ok: true, entry, lead: updated });
}
