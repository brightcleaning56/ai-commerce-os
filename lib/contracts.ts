/**
 * Contracts / e-signature adapter.
 *
 * Modes:
 *   - "in-app" (default): buyer clicks "I agree" on the public /transaction
 *     page → we record the signature directly with their IP + name. Cheap,
 *     legally-binding-ish (clickwrap), no third party.
 *
 *   - "docusign" (when DOCUSIGN_INTEGRATION_KEY is set): we generate an
 *     envelope via DocuSign's API. Returns a URL the buyer is redirected to.
 *     Real legally binding signature with audit trail.
 *
 * Both modes write the same contract record to the transaction (signedAt,
 * signerName, signerIp, contractDocUrl). Operator UI is mode-agnostic.
 *
 * Env vars (DocuSign mode):
 *   DOCUSIGN_INTEGRATION_KEY
 *   DOCUSIGN_USER_ID
 *   DOCUSIGN_ACCOUNT_ID
 *   DOCUSIGN_PRIVATE_KEY      (RSA, JWT auth)
 *   DOCUSIGN_BASE_URL         default https://demo.docusign.net (sandbox)
 *
 * For now: in-app clickwrap is the MVP. DocuSign integration is the upgrade
 * path — same contract data shape, just a different signing surface.
 */

export type ContractMode = "in-app" | "docusign";

export function getContractMode(): ContractMode {
  return process.env.DOCUSIGN_INTEGRATION_KEY ? "docusign" : "in-app";
}

export type ContractRequest = {
  transactionId: string;
  buyerCompany: string;
  buyerName: string;
  buyerEmail?: string;
  productName: string;
  quantity: number;
  totalCents: number;
  currency: string;          // "usd"
  paymentTerms: string;
  shippingTerms: string;
  leadTimeDays: number;
  refundPolicy?: string;
  // The platform terms (operator name, company, address from operator profile)
  operatorName: string;
  operatorCompany: string;
  operatorEmail: string;
};

/**
 * Render the contract content as plain text (ready to be PDF'd or shown on
 * the public review page). Markdown-flavored for both readability and DocuSign
 * tab placement when we upgrade.
 */
export function renderContract(req: ContractRequest): string {
  const total = (req.totalCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: req.currency.toUpperCase(),
  });
  const ts = new Date().toISOString().slice(0, 10);

  return `WHOLESALE PURCHASE AGREEMENT

Effective date: ${ts}
Agreement ID: ${req.transactionId}

BETWEEN
${req.operatorCompany}
${req.operatorName}, ${req.operatorEmail}
(hereafter "Seller")

AND
${req.buyerCompany}
${req.buyerName}${req.buyerEmail ? `, ${req.buyerEmail}` : ""}
(hereafter "Buyer")

1. PRODUCT & QUANTITY
Buyer agrees to purchase ${req.quantity.toLocaleString()} units of "${req.productName}" at the
agreed terms below.

2. TOTAL PRICE
${total} ${req.currency.toUpperCase()}

3. PAYMENT TERMS
${req.paymentTerms}

Funds are held in escrow by the Seller's payment platform from the moment of
charge until delivery is confirmed (or 14 days after expected delivery,
whichever is earlier). Platform fees are deducted on release; the supplier
payout is the remainder.

4. SHIPPING TERMS
${req.shippingTerms}
Estimated lead time: ${req.leadTimeDays} days from signed agreement to dispatch.

5. REFUND POLICY
${req.refundPolicy ?? "Full refund available before shipment. After dispatch, refunds are subject to inspection and dispute resolution per Section 7."}

6. DELIVERY CONFIRMATION
Buyer has 7 days from delivery to inspect goods. Silence after 7 days is
deemed acceptance and authorizes escrow release. Buyer may raise a dispute
within those 7 days via the dashboard or by emailing the Seller directly.

7. DISPUTES
Disputes pause escrow release. The Seller, Buyer, and platform mediator
will resolve in good faith. Resolutions: full refund to Buyer, full release
to Seller, or split — recorded in the agreement audit log.

8. ELECTRONIC SIGNATURE
By clicking "I agree and sign" on the agreement page, Buyer consents to be
legally bound by these terms under the U.S. ESIGN Act. Buyer's IP address,
timestamp, and full name are recorded as proof of signing.

9. LIMITATION OF LIABILITY
Seller's liability is capped at the total agreement value (${total}).
Neither party is liable for indirect or consequential damages.

10. GOVERNING LAW
This agreement is governed by the laws of the United States. Disputes are
resolved by binding arbitration in the Seller's jurisdiction.

— END OF AGREEMENT —`;
}

/**
 * In-app signature — called when the buyer clicks "I agree" on the public
 * /transaction/[id] page. Returns the recorded signature metadata.
 */
export function recordInAppSignature(args: {
  signerName: string;
  signerIp?: string;
  userAgent?: string;
}): {
  signedAt: string;
  signerName: string;
  signerIp?: string;
  signerUserAgent?: string;
  method: "clickwrap";
} {
  return {
    signedAt: new Date().toISOString(),
    signerName: args.signerName.trim().slice(0, 100),
    signerIp: args.signerIp,
    signerUserAgent: args.userAgent?.slice(0, 200),
    method: "clickwrap",
  };
}

/**
 * Stub for DocuSign envelope creation. When DOCUSIGN_* env vars are set,
 * this would:
 *   1. JWT-auth with DocuSign
 *   2. Create envelope from the rendered contract text
 *   3. Add Sign Here tab for buyer
 *   4. Return the envelope URL
 *
 * Right now: returns a placeholder. To wire: swap this function's body
 * for the real DocuSign API calls. The transaction record fields don't change.
 */
export async function createDocuSignEnvelope(_req: ContractRequest): Promise<{
  ok: boolean;
  envelopeId?: string;
  signingUrl?: string;
  errorMessage?: string;
}> {
  if (!process.env.DOCUSIGN_INTEGRATION_KEY) {
    return { ok: false, errorMessage: "DOCUSIGN_INTEGRATION_KEY not configured" };
  }
  // Real implementation would go here. Out of scope for the MVP slice.
  return {
    ok: false,
    errorMessage: "DocuSign integration scaffold present but not implemented. Use in-app clickwrap mode for now.",
  };
}
