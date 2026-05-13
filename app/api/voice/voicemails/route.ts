import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listVoicemails } from "@/lib/voicemails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/voice/voicemails — admin-only.
 * Returns every captured voicemail, newest first.
 *
 * Optional ?unread=true filter for the attention-item count.
 */
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "true";

  const all = await listVoicemails();
  const voicemails = unreadOnly ? all.filter((v) => !v.read) : all;
  return NextResponse.json({ voicemails });
}
