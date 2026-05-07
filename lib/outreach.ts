export type Campaign = {
  id: string;
  name: string;
  status: "Active" | "Paused" | "Draft" | "Completed";
  channel: ("Email" | "LinkedIn" | "SMS" | "Phone")[];
  audience: string;
  audienceCount: number;
  sent: number;
  opened: number;
  replied: number;
  meetings: number;
  deals: number;
  startedAt: string;
  ownerAgent: string;
};

export const CAMPAIGNS: Campaign[] = [
  {
    id: "c1",
    name: "Summer Fitness Products",
    status: "Active",
    channel: ["Email", "LinkedIn"],
    audience: "Sports & Outdoors retailers",
    audienceCount: 412,
    sent: 287,
    opened: 134,
    replied: 43,
    meetings: 11,
    deals: 4,
    startedAt: "May 12, 2024",
    ownerAgent: "Outreach Agent",
  },
  {
    id: "c2",
    name: "Pet Supply Q2 Push",
    status: "Active",
    channel: ["Email"],
    audience: "Pet specialty stores · USA + CA",
    audienceCount: 198,
    sent: 198,
    opened: 91,
    replied: 28,
    meetings: 7,
    deals: 2,
    startedAt: "May 03, 2024",
    ownerAgent: "Outreach Agent",
  },
  {
    id: "c3",
    name: "Beauty Boutique LinkedIn Wave",
    status: "Paused",
    channel: ["LinkedIn"],
    audience: "Beauty boutiques · LinkedIn 1st-degree",
    audienceCount: 76,
    sent: 41,
    opened: 27,
    replied: 9,
    meetings: 3,
    deals: 1,
    startedAt: "Apr 28, 2024",
    ownerAgent: "Outreach Agent",
  },
  {
    id: "c4",
    name: "Home Decor Wholesale Cold",
    status: "Active",
    channel: ["Email", "Phone"],
    audience: "Home decor distributors · $10M+",
    audienceCount: 132,
    sent: 132,
    opened: 58,
    replied: 14,
    meetings: 5,
    deals: 1,
    startedAt: "Apr 22, 2024",
    ownerAgent: "Outreach Agent",
  },
  {
    id: "c5",
    name: "Pet Boutique LinkedIn Re-engage",
    status: "Draft",
    channel: ["LinkedIn", "Email"],
    audience: "Cold pet boutiques · 90+ days no reply",
    audienceCount: 64,
    sent: 0,
    opened: 0,
    replied: 0,
    meetings: 0,
    deals: 0,
    startedAt: "—",
    ownerAgent: "Outreach Agent",
  },
  {
    id: "c6",
    name: "Q1 Closed-Won Cross-sell",
    status: "Completed",
    channel: ["Email"],
    audience: "Q1 closed-won customers",
    audienceCount: 21,
    sent: 21,
    opened: 19,
    replied: 12,
    meetings: 8,
    deals: 5,
    startedAt: "Mar 15, 2024",
    ownerAgent: "Outreach Agent",
  },
];

export type SequenceStep = {
  day: number;
  channel: "Email" | "LinkedIn" | "SMS" | "Phone";
  subject?: string;
  body: string;
};

export const SAMPLE_SEQUENCE: SequenceStep[] = [
  {
    day: 0,
    channel: "Email",
    subject: "Quick idea for {{Company}}",
    body: "Hi {{FirstName}} — saw {{Company}} recently expanded {{Category}} SKUs. We've got {{Product}} trending +{{TrendVelocity}}% on TikTok with {{Margin}} margin. Worth 15 min next week?",
  },
  {
    day: 3,
    channel: "LinkedIn",
    body: "Hi {{FirstName}} — followed up by email on {{Product}}. Sending the deck here in case the inbox missed it. Open to a quick chat?",
  },
  {
    day: 7,
    channel: "Email",
    subject: "Following up · {{Product}} pricing",
    body: "Hi {{FirstName}} — circling back. We've onboarded {{SimilarBuyer}} on similar terms last month. Want me to pull together a custom quote for {{Company}}?",
  },
  {
    day: 14,
    channel: "Email",
    subject: "Last note before I close out",
    body: "Hi {{FirstName}} — closing this thread out unless I hear back. If you'd like me to keep {{Company}} on the watchlist for future drops, just reply 'yes'.",
  },
];
