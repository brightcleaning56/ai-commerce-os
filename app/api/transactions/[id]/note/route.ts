import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/transactions/[id]/note â€” set or clear the operator's free-text note.
 *
 * Body: { note?: string }   (empty string OR omitted clears the note)
 *
 * Notes are private to operators â€” they're NOT exposed in the public
 * buyer-facing transaction API. They live alongside structured fields
 * like disputeReason / disputeResolutionNotes for context that isn't
 * captured by the state machine.
 *
 * Max 1000 chars (hard cap, server-side). Whitespace trimmed.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCapability(req, "transactions:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const txn = await store.getTransaction(params.id);
  if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  let body: { note?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = typeof body.note === "string" ? body.note.trim() : "";
  const note: string | undefined = raw ? raw.slice(0, 1000) : undefined;

  await store.patchTransaction(params.id, {
    operatorNotes: note,
    operatorNotesUpdatedAt: new Date().toISOString(),
  });

  const updated = await store.getTransaction(params.id);
  return NextResponse.json({ ok: true, transaction: updated });
}
