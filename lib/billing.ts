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

export type UsageBucket = {
  label: string;
  used: number;
  cap: number | null;
  hint?: string;
  tone?: string;
};

export const CURRENT_PLAN_ID: Plan["id"] = "growth";

export const USAGE: UsageBucket[] = [
  { label: "Products scanned this month", used: 1283, cap: null, hint: "Unlimited" },
  { label: "Buyers contacted", used: 2451, cap: 5000 },
  { label: "Suppliers tracked", used: 142, cap: 500 },
  { label: "Outreach sends", used: 9_812, cap: 25_000 },
  { label: "AI tokens", used: 4_120_000, cap: 10_000_000, hint: "Sonnet 4.6 + Haiku 4.5" },
  { label: "API calls", used: 38_400, cap: 100_000 },
];

export type Invoice = {
  id: string;
  date: string;
  amount: number;
  status: "Paid" | "Pending" | "Failed";
  description: string;
};

export const INVOICES: Invoice[] = [
  { id: "INV-2024-05", date: "May 01, 2024", amount: 499, status: "Paid", description: "Growth · monthly" },
  { id: "INV-2024-04", date: "Apr 01, 2024", amount: 499, status: "Paid", description: "Growth · monthly" },
  { id: "INV-2024-03", date: "Mar 01, 2024", amount: 499, status: "Paid", description: "Growth · monthly" },
  { id: "INV-2024-02", date: "Feb 01, 2024", amount: 79, status: "Paid", description: "Starter · monthly" },
  { id: "INV-2024-01", date: "Jan 01, 2024", amount: 79, status: "Paid", description: "Starter · monthly" },
];
