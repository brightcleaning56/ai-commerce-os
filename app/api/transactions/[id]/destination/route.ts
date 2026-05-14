import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/transactions/[id]/destination
 *   Body: { country: string (ISO-2), state?: string, city?: string, zip?: string }
 *
 * Sets the buyer destination on a transaction so it can roll up
 * into Layer 6 Distribution Intelligence lanes. Capability:
 * transactions:write.
 *
 * Stamps buyerDestinationSetAt + buyerDestinationSetBy from the
 * auth context. Pass an empty body or { country: "" } to clear the
 * destination (useful if it was set wrong).
 *
 * Existing transactions can be backfilled this way; new
 * transactions ideally collect destination at proposal time
 * (future slice — needs the proposal flow to ask the buyer).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCapability(req, "transactions:write");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const txn = await store.getTransaction(id);
  if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const country = typeof body.country === "string" ? body.country.trim().toUpperCase() : "";
  // Empty country = clear the destination
  if (!country) {
    const cleared = await store.patchTransaction(id, {
      buyerCountry: undefined,
      buyerState: undefined,
      buyerCity: undefined,
      buyerZip: undefined,
      buyerDestinationSetAt: undefined,
      buyerDestinationSetBy: undefined,
    });
    return NextResponse.json({ ok: true, transaction: cleared, cleared: true });
  }
  if (country.length !== 2) {
    return NextResponse.json(
      { error: "country must be a 2-letter ISO code (e.g. US)" },
      { status: 400 },
    );
  }

  const op = getOperator();
  const isOwner = auth.mode === "production" ? !auth.user : true;
  const setBy = isOwner ? op.email : (auth.user?.email ?? "unknown");

  const str = (v: unknown, max = 80): string | undefined => {
    if (typeof v !== "string") return undefined;
    const t = v.trim().slice(0, max);
    return t || undefined;
  };

  const updated = await store.patchTransaction(id, {
    buyerCountry: country,
    buyerState: str(body.state, 80)?.toUpperCase(),
    buyerCity: str(body.city, 80),
    buyerZip: str(body.zip, 20),
    buyerDestinationSetAt: new Date().toISOString(),
    buyerDestinationSetBy: setBy,
  });

  return NextResponse.json({ ok: true, transaction: updated });
}
