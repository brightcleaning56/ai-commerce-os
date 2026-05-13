import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { markVoicemailRead } from "@/lib/voicemails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/voice/voicemails/[id] â€” toggle read status.
 * Body: { read: boolean }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (typeof body?.read !== "boolean") {
    return NextResponse.json({ error: "`read` must be a boolean" }, { status: 400 });
  }

  const updated = await markVoicemailRead(id, body.read);
  if (!updated) {
    return NextResponse.json({ error: "Voicemail not found" }, { status: 404 });
  }
  return NextResponse.json({ voicemail: updated });
}
