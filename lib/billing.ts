export type Plan = {
  id: "starter" | "growth" | "enterprise";
  name: string;
  tagline: string;
  monthly: number;
  annual: number;
  highlight?: boolean;
  badge?: string;
  caps: {
    products: number | null;
    buyers: number | null;
    suppliers: number | null;
    outreachSends: number | null;
    aiTokens: number | null;
    seats: number | string;
    apiCalls: number | string;
  };
  commissionRate: number;
  features: { label: string; included: boolean }[];
  cta: string;
};

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Solo sellers + side hustlers",
    monthly: 79,
    annual: 790,
    caps: {
      products: 250,
      buyers: 100,
      suppliers: 25,
      outreachSends: 500,
      aiTokens: 250_000,
      seats: 1,
      apiCalls: "—",
    },
    commissionRate: 0.025,
    features: [
      { label: "Trend Hunter Agent", included: true },
      { label: "Demand Intelligence Agent", included: true },
      { label: "Buyer Discovery (capped)", included: true },
      { label: "AI outreach (capped)", included: true },
      { label: "CRM Pipeline", included: true },
      { label: "Quote Builder", included: true },
      { label: "Risk Center", included: false },
      { label: "API access", included: false },
      { label: "White-label", included: false },
    ],
    cta: "Start free 14-day trial",
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "Brands + agencies scaling outbound",
    monthly: 499,
    annual: 4990,
    highlight: true,
    badge: "Most Popular",
    caps: {
      products: null,
      buyers: 5000,
      suppliers: 500,
      outreachSends: 25_000,
      aiTokens: 10_000_000,
      seats: 10,
      apiCalls: 100_000,
    },
    commissionRate: 0.015,
    features: [
      { label: "Unlimited product research", included: true },
      { label: "All 9 AI agents", included: true },
      { label: "Advanced buyer enrichment", included: true },
      { label: "Multi-step outreach sequences", included: true },
      { label: "Negotiation Agent", included: true },
      { label: "Supplier risk + compliance", included: true },
      { label: "Risk Center", included: true },
      { label: "API access", included: true },
      { label: "White-label", included: false },
    ],
    cta: "Upgrade to Growth",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Wholesalers, distributors, large teams",
    monthly: 5000,
    annual: 50_000,
    badge: "Custom",
    caps: {
      products: null,
      buyers: null,
      suppliers: null,
      outreachSends: null,
      aiTokens: null,
      seats: "Unlimited",
      apiCalls: "Unlimited",
    },
    commissionRate: 0.005,
    features: [
      { label: "Everything in Growth", included: true },
      { label: "Custom AI agents", included: true },
      { label: "Dedicated infrastructure", included: true },
      { label: "SSO + SCIM", included: true },
      { label: "Advanced analytics & data export", included: true },
      { label: "White-label + custom domain", included: true },
      { label: "Dedicated CSM + onboarding", included: true },
      { label: "SLA: 99.95% uptime", included: true },
      { label: "Volume API discounts", included: true },
    ],
    cta: "Talk to sales",
  },
];

// Removed in the billing-real slice:
//   - CURRENT_PLAN_ID: hardcoded "growth" lied that the operator was on
//     a paid plan when no Stripe subscription exists.
//   - USAGE: hardcoded "9,812 outreach sends · 4.12M AI tokens"
//     numbers that had no relationship to the real spend ledger or
//     drafts table.
//   - INVOICES: 5 hardcoded "Jan-May 2024" rows that pretended past
//     billing happened.
//
// Real usage is now derived per-request in /api/admin/billing from
// the live stores (drafts, buyers, suppliers, products, spend
// ledger, api-keys usageWindow). Real invoices ship when Stripe
// Subscription is wired — until then /api/admin/billing returns [].
//
// Do NOT re-add hardcoded usage / invoice arrays here.
