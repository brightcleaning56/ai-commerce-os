import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import {
  getOnlineAgents,
  markOffline,
  markOnline,
  PRESENCE_TTL_MS,
} from "@/lib/agentPresence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Agent presence — VoiceProvider in the browser heartbeats here every
 * 30 seconds while its Twilio Device is registered, and posts DELETE
 * on unmount. The /api/voice/inbound webhook reads the resulting list
 * to build the multi-agent <Dial> TwiML.
 *
 * Capability gate: voice:write. Only agents that CAN take calls
 * (Operator + Support presets, or anyone the Owner toggles in) can
 * register presence. Other authenticated users (Viewer, Analyst, etc.)
 * see voice:read but can't make/receive — they shouldn't appear in
 * the inbound ring set.
 */

/**
 * POST /api/voice/presence — heartbeat. Idempotent. Returns the full
 * online list so the client can show "3 agents online" in TopBar.
 */
export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "voice:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  // Identity = signed-in user's email. Owner uses op.email; per-user
  // tokens use auth.user.email. This MUST match the identity baked
  // into the Twilio Access Token from /api/voice/token, otherwise the
  // Dial->Client lookup at inbound time misses the right Device.
  const op = getOperator();
  const isOwner = auth.mode === "production" ? !auth.user : true;
  const email = isOwner ? op.email : auth.user!.email;
  const role = isOwner ? "Owner" : auth.user!.role;

  const userAgent = req.headers.get("user-agent")?.slice(0, 200) ?? undefined;
  const record = await markOnline({
    identity: email,
    email,
    role,
    userAgent,
  });

  const online = await getOnlineAgents();
  return NextResponse.json({
    ok: true,
    me: record,
    online,
    ttlSeconds: Math.floor(PRESENCE_TTL_MS / 1000),
  });
}

/**
 * DELETE /api/voice/presence — explicit offline (called on tab close
 * / VoiceProvider unmount). Silent no-op if not registered.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireCapability(req, "voice:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const op = getOperator();
  const isOwner = auth.mode === "production" ? !auth.user : true;
  const email = isOwner ? op.email : auth.user!.email;
  await markOffline(email);
  return NextResponse.json({ ok: true });
}

/**
 * GET /api/voice/presence — list online agents. Anyone with voice:read
 * can see who's online (used by a future "team status" widget).
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "voice:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const online = await getOnlineAgents();
  return NextResponse.json({
    online,
    ttlSeconds: Math.floor(PRESENCE_TTL_MS / 1000),
  });
}
