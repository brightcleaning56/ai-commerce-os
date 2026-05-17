import { expiryFromTtlHours, genShareToken } from "@/lib/shareTokens";
import {
  store,
  type Quote,
  type RevenueEntry,
  type Transaction,
  type TransactionEvent,
  type TransactionState,
} from "@/lib/store";
import { getEscrowFeeBps, getPlatformFeeBps, splitFees } from "@/lib/payments";
import { supplierRegistry } from "@/lib/supplierRegistry";

/**
 * Transaction lifecycle engine — the state-transition rules + side effects
 * for moving a deal from quote-accepted → money-moved → completed.
 *
 * Every transition writes:
 *   1. Updated Transaction.state + Transaction.stateHistory
 *   2. RevenueLedger entries when money actually moves
 *
 * State machine (allowed transitions):
 *
 *   draft           → proposed, cancelled
 *   proposed        → signed, cancelled
 *   signed          → payment_pending, cancelled
 *   payment_pending → escrow_held (on payment success), cancelled (timeout)
 *   escrow_held     → shipped, refunded (operator-initiated), disputed
 *   shipped         → delivered, disputed
 *   delivered       → released, disputed
 *   released        → completed
 *   completed       → (terminal)
 *   disputed        → escrow_held (resolution: hold), refunded (resolution: buyer wins),
 *                     released (resolution: supplier wins)
 *   refunded        → (terminal)
 *   cancelled       → (terminal)
 *
 * The engine refuses invalid transitions with a clear error. Callers should
 * surface that error to the operator UI; never let the state diverge from
 * the rules.
 */

const ALLOWED: Record<TransactionState, TransactionState[]> = {
  draft:           ["proposed", "cancelled"],
  proposed:        ["signed", "cancelled"],
  signed:          ["payment_pending", "cancelled"],
  payment_pending: ["escrow_held", "cancelled"],
  escrow_held:     ["shipped", "refunded", "disputed"],
  shipped:         ["delivered", "disputed"],
  delivered:       ["released", "disputed"],
  released:        ["completed"],
  completed:       [],
  disputed:        ["escrow_held", "refunded", "released"],
  refunded:        [],
  cancelled:       [],
};

export class InvalidTransitionError extends Error {
  constructor(public from: TransactionState, public to: TransactionState) {
    super(`Invalid transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

function canTransition(from: TransactionState, to: TransactionState): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

/**
 * Create a Transaction from an accepted Quote. Sets initial state = "draft".
 * The operator sends it to the buyer via /api/transactions/[id]/send which
 * transitions to "proposed".
 */
export async function createTransactionFromQuote(quote: Quote, options: {
  shippingCents?: number;
  refundPolicy?: string;
  supplierName?: string;
  supplierStripeAccountId?: string;
  buyerEmail?: string;
} = {}): Promise<Transaction> {
  const productTotalCents = Math.round(quote.total * 100) + (options.shippingCents ?? 0);
  const fees = splitFees({
    productTotalCents,
    platformFeeBps: getPlatformFeeBps(),
    escrowFeeBps: getEscrowFeeBps(),
  });

  const now = new Date().toISOString();
  const id = `txn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  // Auto-resolve to supplier registry: when a Stripe Connect account
  // id is supplied AND we already know that account belongs to a
  // record in the supplier registry, link this transaction
  // automatically. Closes the loop end-to-end so future verification
  // (L3 Operational), distribution intel (Layer 6), and per-supplier
  // revenue rollups all populate without operator click.
  //
  // Best-effort — failures here just leave the transaction unlinked,
  // same as any pre-registry transaction. Operator can still wire up
  // the link manually via /admin/suppliers later.
  let autoSupplier: { registryId: string; legalName: string } | null = null;
  if (options.supplierStripeAccountId) {
    try {
      const match = await supplierRegistry.getByStripeConnectAccountId(
        options.supplierStripeAccountId,
      );
      if (match) {
        autoSupplier = { registryId: match.id, legalName: match.legalName };
      }
    } catch {
      // Swallow — auto-link is opportunistic, not required.
    }
  }

  const initialEvent: TransactionEvent = {
    ts: now,
    state: "draft",
    actor: "operator",
    detail: autoSupplier
      ? `Transaction created from accepted quote ${quote.id}; auto-linked to supplier ${autoSupplier.legalName}`
      : `Transaction created from accepted quote ${quote.id}`,
    meta: {
      quoteId: quote.id,
      productTotalCents,
      ...(autoSupplier ? { autoLinkedSupplierId: autoSupplier.registryId } : {}),
    },
  };

  const txn: Transaction = {
    id,
    quoteId: quote.id,
    draftId: quote.draftId,
    pipelineId: quote.pipelineId,
    buyerCompany: quote.buyerCompany,
    buyerName: quote.buyerName,
    buyerEmail: options.buyerEmail,
    productName: quote.productName,
    // Inherit buyer destination from the Quote when present. Quote
    // captures it on the buyer's "Accept" form (/quote/[id]); having
    // it on the Transaction means Layer 6 distribution lanes
    // populate without operator backfill.
    buyerCountry: quote.buyerCountry,
    buyerState: quote.buyerState,
    buyerCity: quote.buyerCity,
    buyerZip: quote.buyerZip,
    buyerDestinationSetAt: quote.buyerDestinationCapturedAt,
    buyerDestinationSetBy: quote.buyerDestinationCapturedAt ? "buyer-on-accept" : undefined,
    // Slice 47: propagate freight estimate from Quote -> Transaction
    // so /transactions panels can show cost without re-fetching.
    freightEstimate: quote.freightEstimate,
    // Slice 67: propagate the buyer-preview snapshot too. Shows the
    // operator what the buyer was evaluating before they accepted.
    freightPreview: quote.freightPreview,

    unitPriceCents: Math.round(quote.unitPrice * 100),
    quantity: quote.quantity,
    subtotalCents: Math.round(quote.subtotal * 100),
    discountPctBps: Math.round(quote.discountPct * 100),
    discountCents: Math.round(quote.discountAmount * 100),
    shippingCents: options.shippingCents ?? 0,
    productTotalCents,

    platformFeePctBps: getPlatformFeeBps(),
    platformFeeCents: fees.platformFeeCents,
    escrowFeePctBps: getEscrowFeeBps(),
    escrowFeeCents: fees.escrowFeeCents,
    supplierPayoutCents: fees.supplierPayoutCents,

    paymentTerms: quote.paymentTerms,
    shippingTerms: quote.shippingTerms,
    leadTimeDays: quote.leadTimeDays,
    refundPolicy: options.refundPolicy,

    state: "draft",
    stateHistory: [initialEvent],
    createdAt: now,
    updatedAt: now,

    contractToken: genShareToken(),

    // If we matched a registry record by Stripe account, prefer that
    // legal name over whatever the operator passed (they may have
    // typed a free-text supplier name; the registry is canonical).
    supplierName: options.supplierName || autoSupplier?.legalName,
    supplierStripeAccountId: options.supplierStripeAccountId,
    supplierRegistryId: autoSupplier?.registryId,
    supplierLinkedAt: autoSupplier ? now : undefined,
    supplierLinkedBy: autoSupplier ? "auto" : undefined,

    aiConfidenceScore: undefined, // computed asynchronously by a future pass

    // Buyer accesses /transaction/[id]?t=<shareToken>; valid for 30d
    shareToken: genShareToken(),
    shareExpiresAt: expiryFromTtlHours(720),
  };

  await store.saveTransaction(txn);
  return txn;
}

/**
 * Apply a state transition. Validates the transition, appends a history
 * event, and writes any side-effect ledger entries.
 *
 * Throws InvalidTransitionError on illegal transitions.
 */
export async function transitionTransaction(args: {
  id: string;
  to: TransactionState;
  actor: TransactionEvent["actor"];
  detail: string;
  patch?: Partial<Transaction>;
  meta?: Record<string, unknown>;
}): Promise<Transaction> {
  const txn = await store.getTransaction(args.id);
  if (!txn) throw new Error(`Transaction ${args.id} not found`);

  if (!canTransition(txn.state, args.to)) {
    throw new InvalidTransitionError(txn.state, args.to);
  }

  const ts = new Date().toISOString();
  const event: TransactionEvent = {
    ts,
    state: args.to,
    actor: args.actor,
    detail: args.detail,
    meta: args.meta,
  };

  // Apply any field patches first
  if (args.patch) {
    await store.patchTransaction(args.id, args.patch);
  }

  // Append the event (mutates state + stateHistory + updatedAt)
  await store.appendTransactionEvent(args.id, event);

  // Side effects: revenue ledger entries when money actually moves
  await writeRevenueEntries(args.id, args.to, ts);

  const updated = await store.getTransaction(args.id);
  if (!updated) throw new Error("Transaction disappeared mid-transition");

  // Fire-and-forget transition email. Best-effort — must NEVER block or throw
  // out of this function, otherwise a Postmark / Resend hiccup could brick the
  // entire state machine. Errors are logged in lib/transactionEmails.ts.
  // Use dynamic import to avoid pulling email dependencies into modules that
  // don't need them (e.g., the cron auto-release ships without email config).
  import("@/lib/transactionEmails")
    .then((m) => m.sendTransitionEmail(updated, args.to))
    .catch((e) => {
      console.warn(
        `[transitionTransaction] email side-effect failed for ${args.id} → ${args.to}:`,
        e instanceof Error ? e.message : e,
      );
    });

  // Observe a transaction-settled supply edge. Only fires for released/
  // completed states (Commercial Intelligence Graph slice 5). Same
  // fire-and-forget contract as the email side effect — graph writes
  // must never brick the state machine. Dynamic import so non-business
  // code paths don't pull in the resolver.
  if (args.to === "released" || args.to === "completed") {
    import("@/lib/businessFromTransaction")
      .then((m) => m.observeTransactionEdge(updated))
      .catch((e) => {
        console.warn(
          `[transitionTransaction] supply-edge side-effect failed for ${args.id} → ${args.to}:`,
          e instanceof Error ? e.message : e,
        );
      });
  }

  return updated;
}

/**
 * Write revenue ledger entries for state transitions that actually move money.
 *
 *   escrow_held → +productTotal in (held, not yet recognized as revenue)
 *   released   → +platformFee + escrowFee recognized; -supplierPayout outflow
 *   refunded   → -productTotal outflow (full refund) or partial
 */
async function writeRevenueEntries(
  txnId: string,
  newState: TransactionState,
  ts: string,
): Promise<void> {
  const txn = await store.getTransaction(txnId);
  if (!txn) return;

  const baseId = `rev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  if (newState === "released") {
    // Platform fee recognized
    const platformEntry: RevenueEntry = {
      id: `${baseId}_pf`,
      transactionId: txnId,
      ts,
      kind: "platform_fee",
      cents: txn.platformFeeCents,
      detail: `Platform fee on ${txn.buyerCompany} (${txn.productName})`,
    };
    await store.addRevenueEntry(platformEntry);

    // Escrow fee recognized
    const escrowEntry: RevenueEntry = {
      id: `${baseId}_ef`,
      transactionId: txnId,
      ts,
      kind: "escrow_fee",
      cents: txn.escrowFeeCents,
      detail: `Escrow fee on ${txn.buyerCompany}`,
    };
    await store.addRevenueEntry(escrowEntry);

    // Supplier payout (negative — outflow)
    const payoutEntry: RevenueEntry = {
      id: `${baseId}_sp`,
      transactionId: txnId,
      ts,
      kind: "supplier_payout",
      cents: -txn.supplierPayoutCents,
      detail: `Supplier payout to ${txn.supplierName ?? "supplier"} for ${txn.productName}`,
    };
    await store.addRevenueEntry(payoutEntry);
    return;
  }

  if (newState === "refunded") {
    const refunded = txn.refundCents ?? txn.productTotalCents;
    const entry: RevenueEntry = {
      id: `${baseId}_rf`,
      transactionId: txnId,
      ts,
      kind: "refund",
      cents: -refunded,
      detail: `Refund to ${txn.buyerCompany}`,
    };
    await store.addRevenueEntry(entry);
    return;
  }

  // No revenue impact for other transitions (proposed, signed, etc.)
}

/**
 * Aggregate revenue stats for the dashboard.
 */
export async function getRevenueStats(): Promise<{
  totalPlatformFeesCents: number;
  totalEscrowFeesCents: number;
  totalSupplierPayoutsCents: number;
  totalRefundsCents: number;
  netPlatformRevenueCents: number;
  inFlightEscrowCents: number;
  byMonth: { month: string; platformFeesCents: number; escrowFeesCents: number }[];
  txnsByState: Record<TransactionState, number>;
}> {
  const ledger = await store.getRevenueLedger();
  const txns = await store.getTransactions();

  let platformFees = 0;
  let escrowFees = 0;
  let payouts = 0;
  let refunds = 0;
  const byMonthMap = new Map<string, { p: number; e: number }>();

  for (const e of ledger) {
    const month = e.ts.slice(0, 7); // YYYY-MM
    const cur = byMonthMap.get(month) ?? { p: 0, e: 0 };
    if (e.kind === "platform_fee") {
      platformFees += e.cents;
      cur.p += e.cents;
    } else if (e.kind === "escrow_fee") {
      escrowFees += e.cents;
      cur.e += e.cents;
    } else if (e.kind === "supplier_payout") {
      payouts += -e.cents;
    } else if (e.kind === "refund") {
      refunds += -e.cents;
    }
    byMonthMap.set(month, cur);
  }

  const inFlightEscrow = txns
    .filter((t) => t.state === "escrow_held" || t.state === "shipped" || t.state === "delivered")
    .reduce((sum, t) => sum + t.productTotalCents, 0);

  const states: TransactionState[] = [
    "draft", "proposed", "signed", "payment_pending", "escrow_held",
    "shipped", "delivered", "released", "completed", "disputed", "refunded", "cancelled",
  ];
  const txnsByState = states.reduce((acc, s) => ({ ...acc, [s]: 0 }), {} as Record<TransactionState, number>);
  for (const t of txns) txnsByState[t.state] = (txnsByState[t.state] ?? 0) + 1;

  const byMonth = Array.from(byMonthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      platformFeesCents: v.p,
      escrowFeesCents: v.e,
    }));

  return {
    totalPlatformFeesCents: platformFees,
    totalEscrowFeesCents: escrowFees,
    totalSupplierPayoutsCents: payouts,
    totalRefundsCents: refunds,
    netPlatformRevenueCents: platformFees + escrowFees - refunds,
    inFlightEscrowCents: inFlightEscrow,
    byMonth,
    txnsByState,
  };
}
