export type Forecast = {
  id: string;
  product: string;
  category: string;
  emoji: string;
  predictedLift: number;
  horizonDays: number;
  confidence: number;
  basedOn: string[];
  series: { d: number; v: number; predicted?: number }[];
  riseDate: string;
  rationale: string;
  tier: "Free" | "Pro" | "Enterprise";
};

function genSeries(seed: number, predict = false) {
  return Array.from({ length: 30 }, (_, i) => {
    const base = 30 + Math.sin(i / 3 + seed) * 10 + i * (1 + (seed % 3) * 0.3);
    if (predict && i >= 18) {
      return {
        d: i,
        v: i === 18 ? base : NaN,
        predicted: base * (1 + (i - 18) * 0.06 + (seed % 4) * 0.01),
      };
    }
    return { d: i, v: base };
  });
}

export const FORECASTS: Forecast[] = [
  {
    id: "f1",
    product: "Portable Ice Maker",
    category: "Home & Kitchen",
    emoji: "🧊",
    predictedLift: 340,
    horizonDays: 90,
    confidence: 87,
    basedOn: ["TikTok velocity", "Google Trends", "Amazon BSR", "Reddit mentions"],
    series: genSeries(1, true),
    riseDate: "Jul 12, 2024",
    rationale:
      "Hashtag velocity on #icemaker tripled in 14 days while Amazon BSR for the top 5 SKUs improved by 42 ranks. Heatwave forecasts for July across Texas + Southwest historically correlate with +280% category lift.",
    tier: "Pro",
  },
  {
    id: "f2",
    product: "Heated Eye Mask",
    category: "Beauty & Personal Care",
    emoji: "😴",
    predictedLift: 215,
    horizonDays: 60,
    confidence: 79,
    basedOn: ["Reels engagement", "Search growth", "Influencer mentions"],
    series: genSeries(2, true),
    riseDate: "Aug 04, 2024",
    rationale: "Sleep wellness segment is breaking out — 6 mid-tier influencers picked up the SKU in 30 days. Search volume up 58% MoM with low ad-CPM in target ZIPs.",
    tier: "Pro",
  },
  {
    id: "f3",
    product: "Magnetic Phone Charger",
    category: "Electronics",
    emoji: "📱",
    predictedLift: 180,
    horizonDays: 45,
    confidence: 84,
    basedOn: ["YouTube Shorts", "TikTok velocity", "Amazon reviews"],
    series: genSeries(3, true),
    riseDate: "Jun 22, 2024",
    rationale: "Apple's MagSafe accessory ecosystem is widening — third-party chargers are seeing 5–7x review velocity vs Q1 baseline.",
    tier: "Free",
  },
  {
    id: "f4",
    product: "Smart Plant Sensor",
    category: "Home Decor",
    emoji: "🌱",
    predictedLift: 145,
    horizonDays: 120,
    confidence: 71,
    basedOn: ["Google Trends", "Etsy growth", "Pinterest saves"],
    series: genSeries(4, true),
    riseDate: "Sep 08, 2024",
    rationale: "Indoor gardening searches climbing for 8 weeks straight. Pinterest saves for plant-tech up 230%. Price point ($32) sits well below market average ($58).",
    tier: "Pro",
  },
  {
    id: "f5",
    product: "Pet Grooming Vacuum",
    category: "Pet Supplies",
    emoji: "🐶",
    predictedLift: 122,
    horizonDays: 60,
    confidence: 76,
    basedOn: ["TikTok velocity", "Reddit r/dogs", "Amazon BSR"],
    series: genSeries(5, true),
    riseDate: "Jul 28, 2024",
    rationale: "Shedding-season search peak landing earlier this year due to warmer May. 14 viral demo videos in last 21 days — historical correlation to +110% category lift.",
    tier: "Pro",
  },
  {
    id: "f6",
    product: "Yoga Wheel",
    category: "Sports & Outdoors",
    emoji: "🧘‍♀️",
    predictedLift: 95,
    horizonDays: 90,
    confidence: 68,
    basedOn: ["Instagram Reels", "Google Trends"],
    series: genSeries(6, true),
    riseDate: "Aug 15, 2024",
    rationale: "Yoga + back-pain hybrid content is breaking out on Reels. Slower lift but durable demand once established.",
    tier: "Free",
  },
];

export type IntentReport = {
  id: string;
  title: string;
  category: string;
  buyerCount: number;
  signal: string;
  region: string;
  industry: string;
  freshness: string;
  sample: { company: string; trigger: string; score: number }[];
  price: number;
  format: ("CSV" | "API" | "PDF")[];
  tier: "Free" | "Pro" | "Enterprise";
};

export const INTENT_REPORTS: IntentReport[] = [
  {
    id: "i1",
    title: "Top 500 retailers expanding fitness inventory in Q3",
    category: "Buyer Intent",
    buyerCount: 487,
    signal: "Job postings + LinkedIn category expansion",
    region: "USA + Canada",
    industry: "Sports & Outdoors",
    freshness: "Refreshed daily",
    sample: [
      { company: "FitLife Stores", trigger: "Hired 3 buyers in May", score: 94 },
      { company: "Ridgeline Outdoors", trigger: "New SKU range posted", score: 91 },
      { company: "Trailhead Supply", trigger: "Distribution expanded TX→AZ", score: 88 },
    ],
    price: 1200,
    format: ["CSV", "API"],
    tier: "Pro",
  },
  {
    id: "i2",
    title: "Beauty boutiques in Texas testing new shelf SKUs",
    category: "Buyer Intent",
    buyerCount: 92,
    signal: "Shopify Polaris signals + Instagram product tags",
    region: "Texas + Oklahoma",
    industry: "Beauty & Personal Care",
    freshness: "Refreshed weekly",
    sample: [
      { company: "GlowUp Beauty TX", trigger: "5 new SKUs in May", score: 89 },
      { company: "Vibrant Skin Co.", trigger: "Tagged 8 indie brands on IG", score: 85 },
    ],
    price: 600,
    format: ["CSV", "PDF"],
    tier: "Pro",
  },
  {
    id: "i3",
    title: "Pet retailers adding inventory before back-to-school",
    category: "Buyer Intent",
    buyerCount: 312,
    signal: "PO frequency on Faire + Bulletin",
    region: "USA",
    industry: "Pet Supplies",
    freshness: "Refreshed daily",
    sample: [
      { company: "Petopia Boutique", trigger: "+18% reorder velocity", score: 92 },
      { company: "Pawfect Pantry", trigger: "Hiring inventory buyer", score: 87 },
    ],
    price: 900,
    format: ["CSV", "API"],
    tier: "Pro",
  },
  {
    id: "i4",
    title: "Sample: Distributors expanding home goods (Q1 2024)",
    category: "Buyer Intent",
    buyerCount: 24,
    signal: "Trade show attendance + LinkedIn",
    region: "USA",
    industry: "Home & Kitchen",
    freshness: "Q1 2024 archive",
    sample: [
      { company: "FoxRiver Wholesale", trigger: "Booth at NY Now", score: 82 },
      { company: "KitchenCraft Direct", trigger: "Hiring category lead", score: 78 },
    ],
    price: 0,
    format: ["PDF"],
    tier: "Free",
  },
  {
    id: "i5",
    title: "Procurement managers actively sourcing electronics (live)",
    category: "Buyer Intent",
    buyerCount: 1820,
    signal: "RFP filings + LinkedIn intent + email signals",
    region: "Global",
    industry: "Electronics",
    freshness: "Live (refreshed hourly)",
    sample: [
      { company: "TechWorld Hub Japan", trigger: "Active RFP for audio", score: 96 },
      { company: "Plug-and-Play Tech", trigger: "Hired procurement VP", score: 93 },
      { company: "Aether Audio", trigger: "Q2 budget unlocked", score: 90 },
    ],
    price: 4500,
    format: ["API", "CSV"],
    tier: "Enterprise",
  },
];

export type MarketSnapshot = {
  category: string;
  emoji: string;
  growth30d: number;
  buyerActivity: number;
  competition: "Low" | "Medium" | "High";
  topRegion: string;
};

export const MARKETS: MarketSnapshot[] = [
  { category: "Home & Kitchen", emoji: "🥤", growth30d: 28.5, buyerActivity: 91, competition: "Medium", topRegion: "USA" },
  { category: "Pet Supplies", emoji: "🐾", growth30d: 42.1, buyerActivity: 84, competition: "Low", topRegion: "USA + CA" },
  { category: "Beauty & Personal Care", emoji: "💆", growth30d: 18.4, buyerActivity: 76, competition: "High", topRegion: "USA + UK" },
  { category: "Sports & Outdoors", emoji: "💪", growth30d: 31.2, buyerActivity: 88, competition: "Medium", topRegion: "USA" },
  { category: "Electronics", emoji: "📱", growth30d: 14.6, buyerActivity: 72, competition: "High", topRegion: "Global" },
  { category: "Home Decor", emoji: "🌱", growth30d: 22.8, buyerActivity: 79, competition: "Low", topRegion: "USA + EU" },
];

export const CURRENT_TIER: "Free" | "Pro" | "Enterprise" = "Pro";
