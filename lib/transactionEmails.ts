/**
 * Transaction lifecycle emails.
 *
 * Fires automatically from transitionTransaction() after the state change +
 * ledger writes complete. All sends are best-effort: an email failure must
 * NEVER block the transition or throw upstream — we just log and move on.
 *
 * Recipients vary by transition:
 *   signed       → buyer        "Contract signed — pay to start escrow"
 *   escrow_held  → buyer        "Payment received — funds in escrow"
 *   shipped      → buyer        "Your order has shipped"
 *   delivered    → buyer        "Delivery confirmed — dispute window open"
 *   released     → buyer        "Funds released — transaction complete"
 *   disputed     → operator     "Dispute opened on transaction X"
 *   refunded     → buyer        "Refund processed"
 *   cancelled    → buyer        "Transaction cancelled"
 *
 * The buyer email is on Transaction.buyerEmail. Operator email is from
 * getOperator().email. Supplier emails are not sent yet — that requires a
 * persisted supplier email which we don't capture today.
 */

import { sendEmail } from "@/lib/email";
import { getOperator } from "@/lib/operator";
import type { Transaction, TransactionState } from "@/lib/store";

function fmtCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function publicViewerUrl(txn: Transaction): string {
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || "https://ai-commerce-os.netlify.app";
  return `${origin}/transaction/${txn.id}?t=${txn.shareToken}`;
}

function autoReleaseHours(): number {
  return Math.max(1, Number(process.env.AUTO_RELEASE_HOURS ?? "168") || 168);
}

type EmailPlan = {
  to: string;
  subject: string;
  textBody: string;
} | null;

function buildEmailForTransition(
  txn: Transaction,
  newState: TransactionState,
): EmailPlan {
  const op = getOperator();
  const viewerUrl = publicViewerUrl(txn);
  const total = fmtCents(txn.productTotalCents);
  const sig = `\n\n— ${op.name}\n${op.title} · ${op.company}\n${op.email}`;

  switch (newState) {
    case "signed": {
      if (!txn.buyerEmail) return null;
      return {
        to: txn.buyerEmail,
        subject: `Contract signed — ${txn.productName} · pay to start escrow`,
        textBody:
          `Hi ${txn.buyerName},\n\n` +
          `Thanks for signing the purchase agreement for ${txn.productName} × ${txn.quantity.toLocaleString()} (${total}).\n\n` +
          `Next step: complete payment so funds move into AVYN's escrow.\n` +
          `Once paid, the supplier ships and we hold the funds until you confirm delivery.\n\n` +
          `Pay here: ${viewerUrl}\n\n` +
          `Payment terms: ${txn.paymentTerms}.\n` +
          `Estimated lead time: ${txn.leadTimeDays} days from payment.\n` +
          `Shipping terms: ${txn.shippingTerms}.\n` +
          sig,
      };
    }

    case "escrow_held": {
      if (!txn.buyerEmail) return null;
      return {
        to: txn.buyerEmail,
        subject: `Payment received — ${total} held in escrow for ${txn.productName}`,
        textBody:
          `Hi ${txn.buyerName},\n\n` +
          `Your payment of ${total} has been received and is now held in AVYN's escrow.\n\n` +
          `What happens next:\n` +
          `  1. The supplier prepares and ships your order (${txn.leadTimeDays}-day lead time).\n` +
          `  2. We send you a tracking number once the carrier picks it up.\n` +
          `  3. You confirm delivery once goods arrive — or we auto-release ${autoReleaseHours()} hours after delivery if there's no dispute.\n` +
          `  4. Funds release to the supplier; transaction closes.\n\n` +
          `Track this transaction: ${viewerUrl}\n` +
          sig,
      };
    }

    case "shipped": {
      if (!txn.buyerEmail) return null;
      const carrier = txn.carrierName ?? "the carrier";
      const tracking = txn.trackingNumber ? `Tracking #: ${txn.trackingNumber}\n` : "";
      return {
        to: txn.buyerEmail,
        subject: `Your order has shipped — ${txn.productName}`,
        textBody:
          `Hi ${txn.buyerName},\n\n` +
          `Good news — your ${txn.productName} × ${txn.quantity.toLocaleString()} order is on its way via ${carrier}.\n\n` +
          tracking +
          `Once it arrives, please inspect the goods and confirm delivery on the transaction page. ` +
          `If anything's wrong, you have ${autoReleaseHours()} hours after delivery to raise a dispute — ` +
          `funds stay in escrow until then.\n\n` +
          `Track this transaction: ${viewerUrl}\n` +
          sig,
      };
    }

    case "delivered": {
      if (!txn.buyerEmail) return null;
      return {
        to: txn.buyerEmail,
        subject: `Delivery confirmed — please inspect ${txn.productName}`,
        textBody:
          `Hi ${txn.buyerName},\n\n` +
          `${txn.productName} × ${txn.quantity.toLocaleString()} has been marked delivered.\n\n` +
          `IMPORTANT — please inspect the goods now:\n` +
          `  · If everything matches the order, no action needed. Funds auto-release ` +
          `to the supplier in ${autoReleaseHours()} hours.\n` +
          `  · If something's wrong (damaged, missing, wrong product) — raise a dispute on the transaction page within ${autoReleaseHours()} hours. ` +
          `Funds stay frozen in escrow until the dispute is resolved.\n\n` +
          `Inspect and confirm: ${viewerUrl}\n` +
          sig,
      };
    }

    case "released":
    case "completed": {
      // Send only on the released transition (skip the immediate completed
      // follow-up to avoid two emails for one settlement).
      if (newState === "completed") return null;
      if (!txn.buyerEmail) return null;
      return {
        to: txn.buyerEmail,
        subject: `Transaction complete — ${txn.productName}`,
        textBody:
          `Hi ${txn.buyerName},\n\n` +
          `Funds have released from escrow to the supplier. Your transaction for ` +
          `${txn.productName} × ${txn.quantity.toLocaleString()} (${total}) is complete.\n\n` +
          `Thanks for using AVYN. We've kept a complete audit trail of every step ` +
          `(signature, payment, shipping, delivery, release) at the link below for your records.\n\n` +
          `Receipt + audit trail: ${viewerUrl}\n` +
          sig,
      };
    }

    case "disputed": {
      // Operator gets the alert. Buyer already saw their dispute submitted in-flow.
      return {
        to: op.email,
        subject: `Dispute opened — ${txn.buyerCompany} · ${txn.productName}`,
        textBody:
          `A dispute was raised on transaction ${txn.id}.\n\n` +
          `Buyer:    ${txn.buyerName} (${txn.buyerCompany})\n` +
          `Product:  ${txn.productName} × ${txn.quantity.toLocaleString()}\n` +
          `Total:    ${total}\n` +
          `Reason:   ${txn.disputeReason ?? "(not provided)"}\n\n` +
          `Funds are frozen in escrow. Resolve via the operator dashboard:\n` +
          `${process.env.NEXT_PUBLIC_APP_ORIGIN ?? ""}/transactions\n\n` +
          `Buyer's view of this transaction:\n${viewerUrl}\n`,
      };
    }

    case "refunded": {
      if (!txn.buyerEmail) return null;
      const refundCents = (txn as any).refundCents ?? txn.productTotalCents;
      return {
        to: txn.buyerEmail,
        subject: `Refund processed — ${fmtCents(refundCents)} for ${txn.productName}`,
        textBody:
          `Hi ${txn.buyerName},\n\n` +
          `A refund of ${fmtCents(refundCents)} has been processed for your ${txn.productName} order.\n\n` +
          `Funds typically clear within 5–10 business days, depending on your bank.\n\n` +
          `Reference: ${txn.id}\n` +
          `Detail: ${viewerUrl}\n` +
          sig,
      };
    }

    case "cancelled": {
      if (!txn.buyerEmail) return null;
      return {
        to: txn.buyerEmail,
        subject: `Transaction cancelled — ${txn.productName}`,
        textBody:
          `Hi ${txn.buyerName},\n\n` +
          `Your ${txn.productName} transaction has been cancelled before payment was held.\n\n` +
          `If you'd intended to proceed, reply to this email and we'll re-issue the agreement.\n\n` +
          `Reference: ${txn.id}\n` +
          sig,
      };
    }

    default:
      return null;
  }
}

/**
 * Fire any state-change email for this transition. Best-effort: never throws;
 * logs failures to console. Caller (transitionTransaction) can `void` this.
 */
export async function sendTransitionEmail(
  txn: Transaction,
  newState: TransactionState,
): Promise<void> {
  const plan = buildEmailForTransition(txn, newState);
  if (!plan) return;
  try {
    const result = await sendEmail({
      to: plan.to,
      subject: plan.subject,
      textBody: plan.textBody,
      metadata: {
        transactionId: txn.id,
        transitionTo: newState,
      },
    });
    if (!result.ok) {
      console.warn(
        `[transactionEmails] send failed for ${txn.id} → ${newState}: ${result.errorMessage ?? "unknown"}`,
      );
    }
  } catch (e) {
    console.warn(
      `[transactionEmails] threw on ${txn.id} → ${newState}:`,
      e instanceof Error ? e.message : e,
    );
  }
}
