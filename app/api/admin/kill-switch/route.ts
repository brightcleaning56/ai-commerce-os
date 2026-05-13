import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { getKillSwitch, setKillSwitch } from "@/lib/killSwitch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/kill-switch â€” current state of the global agent kill switch.
 * POST /api/admin/kill-switch â€” toggle.
 *
 * Both admin-only. The /admin Super Admin page hits this on mount and on
 * every toggle so the state is server-authoritative and applies to every
 * code path that reads it (crons, lead auto-reply, retry-stuck, etc).
 */
export async function GET(req: NextRequest) {
  const auth = await requireCapability(req, "system:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const state = await getKillSwitch();
  return NextResponse.json(state);
}

export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "system:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  if (typeof body?.active !== "boolean") {
    return NextResponse.json({ error: "`active` must be a boolean" }, { status: 400 });
  }
  const activatedBy = typeof body?.activatedBy === "string" ? body.activatedBy.slice(0, 200) : null;
  const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : null;

  const state = await setKillSwitch({ active: body.active, activatedBy, reason });
  return NextResponse.json(state);
}
