import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { store, type LeadStatus } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "won", "lost"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCapability(req, "leads:read");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  const lead = await store.getLead(id);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ lead });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCapability(req, "leads:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: { status?: LeadStatus; notes?: string } = {};
  if (typeof body.status === "string") {
    if (!VALID_STATUSES.includes(body.status as LeadStatus)) {
      return NextResponse.json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` }, { status: 400 });
    }
    patch.status = body.status as LeadStatus;
  }
  if (typeof body.notes === "string") {
    patch.notes = body.notes.slice(0, 5000);
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  const updated = await store.updateLead(id, patch);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ lead: updated });
}
