import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { callsStore, type CallDirection, type CallOutcome } from "@/lib/calls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/calls — shared call log across all agents.
 *
 * Query params: sinceIso, untilIso, agentEmail, outcome, limit
 * Capability: voice:read (Viewer/Analyst can see the team's history
 * even if they can't place calls themselves).
 *
 * POST /api/calls — register a new call record. VoiceProvider posts
 * here as soon as placeOutboundCall begins so the record exists even
 * if the call never connects. The Twilio CallSid lands later when
 * Device.connect() resolves, via PATCH or attachCallSidToLatest.
 * Capability: voice:write.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "voice:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const url = new URL(req.url);
  const sinceIso = url.searchParams.get("since") ?? undefined;
  const untilIso = url.searchParams.get("until") ?? undefined;
  const agentEmail = url.searchParams.get("agent") ?? undefined;
  const rawOutcome = url.searchParams.get("outcome");
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(2000, Math.max(1, Number(limitParam) || 500)) : 500;

  const VALID_OUTCOMES: CallOutcome[] = [
    "connected", "voicemail", "no-answer", "wrong-number",
    "callback-scheduled", "missed", "failed",
  ];
  const outcome = rawOutcome && VALID_OUTCOMES.includes(rawOutcome as CallOutcome)
    ? (rawOutcome as CallOutcome)
    : undefined;

  const calls = await callsStore.list({ sinceIso, untilIso, agentEmail, outcome, limit });
  return NextResponse.json({ calls });
}

export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "voice:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Agent identity comes from the auth context (never from the body)
  // so a malicious client can't log a call as someone else.
  const op = getOperator();
  const isOwner = auth.mode === "production" ? !auth.user : true;
  const agentEmail = isOwner ? op.email : auth.user!.email;
  const agentRole = isOwner ? "Owner" : auth.user!.role;

  const direction: CallDirection = body.direction === "inbound" ? "inbound" : "outbound";
  const toNumber = typeof body.toNumber === "string" ? body.toNumber.trim().slice(0, 80) : "";
  if (!toNumber) {
    return NextResponse.json({ error: "toNumber required" }, { status: 400 });
  }
  const toContact = typeof body.toContact === "string" ? body.toContact.trim().slice(0, 160) : undefined;
  const callSid = typeof body.callSid === "string" ? body.callSid : null;
  const VALID_SOURCES = ["tasks", "calls", "system-health", "lead-detail", "other"] as const;
  const source = VALID_SOURCES.includes(body.source as typeof VALID_SOURCES[number])
    ? (body.source as typeof VALID_SOURCES[number])
    : "other";

  const call = await callsStore.create({
    direction,
    callSid,
    agentEmail,
    agentRole,
    toNumber,
    toContact,
    source,
  });
  return NextResponse.json({ ok: true, call });
}
