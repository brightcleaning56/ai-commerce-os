import { NextRequest, NextResponse } from "next/server";
import { recordInAppSignature } from "@/lib/contracts";
import { store } from "@/lib/store";
import { transitionTransaction } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/transactions/[id]/sign  — buyer signs the contract.
 * Body: { token: string, signerName: string }
 *
 * Transitions: proposed → signed.
 * Records signer name + IP + user agent on the transaction.
 *
 * Public endpoint, gated by the share token in the body.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const txn = await store.getTransaction(params.id);
  if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  let body: { token?: string; signerName?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.token || body.token !== txn.shareToken) {
    return NextResponse.json({ error: "Invalid or missing share token" }, { status: 403 });
  }
  if (!body.signerName || body.signerName.trim().length < 2) {
    return NextResponse.json({ error: "signerName required (min 2 chars)" }, { status: 400 });
  }
  if (Date.now() > new Date(txn.shareExpiresAt).getTime()) {
    return NextResponse.json({ error: "Share link expired" }, { status: 410 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    undefined;
  const ua = req.headers.get("user-agent") ?? undefined;

  const sig = recordInAppSignature({
    signerName: body.signerName.trim(),
    signerIp: ip,
    userAgent: ua,
  });

  try {
    const updated = await transitionTransaction({
      id: params.id,
      to: "signed",
      actor: "buyer",
      detail: `Signed by ${sig.signerName} (clickwrap${sig.signerIp ? ` from ${sig.signerIp}` : ""})`,
      meta: {
        signerName: sig.signerName,
        signerIp: sig.signerIp,
        userAgent: sig.signerUserAgent,
        method: sig.method,
      },
      patch: {
        contractSignedAt: sig.signedAt,
        contractSignerName: sig.signerName,
        contractSignerIp: sig.signerIp,
      },
    });
    return NextResponse.json({ ok: true, transaction: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sign failed" },
      { status: 400 },
    );
  }
}
