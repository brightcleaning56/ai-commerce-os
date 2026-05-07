import { DEALS, type Deal } from "@/lib/deals";
import { PLANS, CURRENT_PLAN_ID } from "@/lib/billing";

export const COMMISSION_TIERS = [
  { dealMin: 0, dealMax: 9_999, rate: 0.1, label: "Small (<$10K)" },
  { dealMin: 10_000, dealMax: 49_999, rate: 0.07, label: "Mid ($10K-$50K)" },
  { dealMin: 50_000, dealMax: 249_999, rate: 0.05, label: "Large ($50K-$250K)" },
  { dealMin: 250_000, dealMax: Infinity, rate: 0.02, label: "Enterprise ($250K+)" },
];

export function commissionFor(deal: Deal) {
  const tier = COMMISSION_TIERS.find(
    (t) => deal.value >= t.dealMin && deal.value <= t.dealMax
  )!;
  return { tier, amount: +(deal.value * tier.rate).toFixed(2) };
}

export type Earning = {
  id: string;
  deal: Deal;
  rate: number;
  amount: number;
  status: "Earned" | "Pending Payout" | "Paid";
  earnedAt: string;
  source: "Outreach Agent" | "LinkedIn" | "Referral" | "Inbound";
};

export const EARNINGS: Earning[] = DEALS.filter(
  (d) => d.stage === "Closed Won" || d.stage === "Negotiation" || d.stage === "Quotation"
).map((d, i) => {
  const { tier, amount } = commissionFor(d);
  const earned = d.stage === "Closed Won";
  return {
    id: `e${i + 1}`,
    deal: d,
    rate: tier.rate,
    amount,
    status: earned ? (i % 3 === 0 ? "Paid" : "Pending Payout") : "Earned",
    earnedAt: d.closeDate,
    source: d.source,
  };
});

export const MONTHLY_EARNINGS = [
  { m: "Dec '23", earned: 1240, paid: 1240 },
  { m: "Jan '24", earned: 1875, paid: 1875 },
  { m: "Feb '24", earned: 2980, paid: 2980 },
  { m: "Mar '24", earned: 4210, paid: 4210 },
  { m: "Apr '24", earned: 5130, paid: 5130 },
  { m: "May '24", earned: 7480, paid: 4920 },
];

export type Payout = {
  id: string;
  date: string;
  amount: number;
  method: "ACH" | "Wire" | "Stripe Express";
  status: "Paid" | "Processing";
  ref: string;
};

export const PAYOUTS: Payout[] = [
  { id: "po1", date: "May 02, 2024", amount: 4920, method: "ACH", status: "Paid", ref: "ACH-44291" },
  { id: "po2", date: "Apr 02, 2024", amount: 5130, method: "ACH", status: "Paid", ref: "ACH-43117" },
  { id: "po3", date: "Mar 02, 2024", amount: 4210, method: "ACH", status: "Paid", ref: "ACH-41980" },
  { id: "po4", date: "Feb 02, 2024", amount: 2980, method: "ACH", status: "Paid", ref: "ACH-40655" },
  { id: "po5", date: "Jun 02, 2024", amount: 2560, method: "ACH", status: "Processing", ref: "ACH-45402" },
];

export function totals() {
  const earned = EARNINGS.reduce((s, e) => s + e.amount, 0);
  const paid = EARNINGS.filter((e) => e.status === "Paid").reduce((s, e) => s + e.amount, 0);
  const pending = EARNINGS.filter((e) => e.status === "Pending Payout").reduce(
    (s, e) => s + e.amount,
    0
  );
  const inFlight = EARNINGS.filter((e) => e.status === "Earned").reduce(
    (s, e) => s + e.amount,
    0
  );

  // Forecast: take negotiation+quotation deals weighted by probability * tier rate
  const forecast = DEALS.filter(
    (d) => d.stage === "Negotiation" || d.stage === "Quotation"
  ).reduce((s, d) => {
    const { tier } = commissionFor(d);
    return s + d.value * tier.rate * (d.probability / 100);
  }, 0);

  return {
    earned,
    paid,
    pending,
    inFlight,
    forecast: +forecast.toFixed(0),
    plan: PLANS.find((p) => p.id === CURRENT_PLAN_ID)!,
  };
}
