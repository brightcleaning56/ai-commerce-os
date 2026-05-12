/**
 * Real commission tiers used on the /earnings page. These are real
 * product configuration — the rates AVYN actually charges per deal-size
 * bucket — so they stay as a static export.
 *
 * Removed in the earnings-real slice (do NOT re-add):
 *   - EARNINGS:         50 fake "deals" with fake company names + amounts
 *   - MONTHLY_EARNINGS: 6 hardcoded "Dec '23 → May '24" rows
 *   - PAYOUTS:          5 fake "ACH-44291"-style payout records
 *   - totals():         returned aggregates over the SAMPLE EARNINGS array
 *                       and pretended the operator had earned thousands
 *   - commissionFor():  computed against fake DEALS
 *
 * Real earnings data is now derived per-request from /api/transactions
 * and /api/transactions/stats, both of which read the live transaction
 * + revenue ledger stores. No SAMPLE rows ever leak into the operator
 * dashboard.
 */
export const COMMISSION_TIERS = [
  { dealMin: 0, dealMax: 9_999, rate: 0.1, label: "Small (<$10K)" },
  { dealMin: 10_000, dealMax: 49_999, rate: 0.07, label: "Mid ($10K-$50K)" },
  { dealMin: 50_000, dealMax: 249_999, rate: 0.05, label: "Large ($50K-$250K)" },
  { dealMin: 250_000, dealMax: Infinity, rate: 0.02, label: "Enterprise ($250K+)" },
];
