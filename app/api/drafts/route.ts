import { NextRequest, NextResponse } from "next/server";
import { store, type OutreachDraft } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ drafts: store.getDrafts() });
}

export async function PATCH(req: NextRequest) {
  let body: { id?: string; status?: OutreachDraft["status"] } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id || !body.status) {
    return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
  }
  const updated = store.updateDraftStatus(body.id, body.status);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ draft: updated });
}
