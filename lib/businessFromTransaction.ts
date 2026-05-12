import crypto from "node:crypto";
import { store, type BusinessRecord, type Transaction } from "@/lib/store";

/**
 * When a transaction settles, we need a BusinessRecord to point the
 * supply edge at. The buyer might already be in the directory (CSV
 * import or earlier transaction) or might be new. This module finds
 * or creates that record.
 *
 * Dedup strategy:
 *   1. Match by buyerEmail (when present, lowercased) — strongest signal
 *   2. Match by buyer company name (case-insensitive trim)
 *   3. Create a new record with source="lead_promote" (re-using the
 *      existing source enum for "this came from real platform activity"
 *      semantics)
 *
 * Auto-created records are minimal: name + email if known + source.
 * Operator can enrich later via the AI Profile Scan if they add a
 * website. The point is: every transaction-driven edge has a real
 * BusinessRecord to anchor to, so the graph isn't full of orphan
 * string-only references.
 */
export async function resolveBuyerToBusiness(txn: Transaction): Promise<BusinessRecord> {
  // 1. Email match
  if (txn.buyerEmail) {
    const byEmail = await store.getBusinessByEmail(txn.buyerEmail);
    if (byEmail) return byEmail;
  }

  // 2. Name match (case-insensitive)
  const all = await store.getBusinesses();
  const target = txn.buyerCompany.trim().toLowerCase();
  const byName = all.find((b) => b.name.trim().toLowerCase() === target);
  if (byName) return byName;

  // 3. Auto-create. Minimal record — the AI Profile Scan can enrich
  // later if the operator adds a website. We DON'T set status="contacted"
  // because that path goes through the outreach UI; this business was
  // closed via a different surface (real signed transaction).
  const now = new Date().toISOString();
  const rec: BusinessRecord = {
    id: `biz_${crypto.randomBytes(6).toString("hex")}`,
    name: txn.buyerCompany,
    email: txn.buyerEmail?.trim().toLowerCase(),
    country: "US",
    status: "won",          // they completed a transaction = closed/won
    source: "lead_promote", // closest existing source attribution
    createdAt: now,
    updatedAt: now,
    notes: `Auto-created from transaction ${txn.id} (${txn.productName})`,
  };
  await store.addBusiness(rec);
  return rec;
}

/**
 * Observe a transaction-settled edge: the buyer SOURCED FROM the supplier.
 * Confidence 100 because this is the highest-signal observation we'll
 * ever get — a real Stripe-cleared transaction.
 *
 * Idempotent: re-running for the same (buyer, supplier) pair bumps
 * lastSeenAt but doesn't duplicate. Multiple transactions to the same
 * supplier are tracked via the lastSeenAt timestamp + each transaction
 * gets its own evidence pointer in the edge's evidence string history
 * (truncated to the last 280 chars).
 */
export async function observeTransactionEdge(txn: Transaction): Promise<{
  ok: boolean;
  reason?: string;
  buyerBusinessId?: string;
}> {
  // Only observe edges for settled transactions
  if (txn.state !== "released" && txn.state !== "completed") {
    return { ok: false, reason: "state not released/completed" };
  }
  // Need a supplier name to point the edge at
  const supplierName = (txn.supplierName ?? "").trim();
  if (!supplierName) {
    return { ok: false, reason: "no supplierName on transaction" };
  }

  const buyer = await resolveBuyerToBusiness(txn);
  const settledAt =
    txn.escrowReleasedAt ??
    txn.stateHistory?.find((e) => e.state === "released" || e.state === "completed")?.ts ??
    txn.updatedAt;

  await store.upsertSupplyEdge({
    fromBusinessId: buyer.id,
    fromBusinessName: buyer.name,
    toName: supplierName,
    kind: "sources_from",
    source: "transaction",
    confidence: 100,
    evidence: `txn ${txn.id} settled ${new Date(settledAt).toISOString().slice(0, 10)} · ${txn.productName} · $${(txn.productTotalCents / 100).toFixed(0)}`,
    observedAt: settledAt,
  });

  return { ok: true, buyerBusinessId: buyer.id };
}
