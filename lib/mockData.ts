export const KPIS = [
  { label: "Total Opportunities", value: "1,283", delta: "+28.5%", sub: "vs last 7 days", tone: "brand" },
  { label: "High Demand Products", value: "327", delta: "+18.4%", sub: "vs last 7 days", tone: "amber" },
  { label: "Buyers Contacted", value: "2,451", delta: "+36.7%", sub: "vs last 7 days", tone: "blue" },
  { label: "Responses Received", value: "654", delta: "+42.1%", sub: "14.9% reply rate", tone: "cyan" },
  { label: "Deals in Pipeline", value: "213", delta: "+24.6%", sub: "Total value $1.26M", tone: "green" },
  { label: "Est. Revenue", value: "$1.26M", delta: "+31.8%", sub: "Potential revenue", tone: "amber" },
] as const;

export const TOP_PRODUCTS = [
  { name: "Portable Blender Cup", category: "Home & Kitchen", score: 92, profit: "$18.45", competition: "Low", potential: "Very High" },
  { name: "Pet Hair Remover Roller", category: "Pet Supplies", score: 89, profit: "$16.72", competition: "Low", potential: "High" },
  { name: "LED Book Reading Light", category: "Home Decor", score: 88, profit: "$14.32", competition: "Medium", potential: "High" },
  { name: "Silicone Food Storage Bags", category: "Kitchen", score: 87, profit: "$15.21", competition: "Low", potential: "High" },
  { name: "Workout Resistance Bands", category: "Sports & Outdoors", score: 86, profit: "$17.65", competition: "Medium", potential: "High" },
];

export const TOP_BUYERS = [
  { company: "FitLife Stores", type: "Retail Chain", location: "New York, USA", score: 92 },
  { company: "ActiveGear Co.", type: "E-commerce Brand", location: "Los Angeles, USA", score: 88 },
  { company: "Global Wholesale Inc.", type: "Distributor", location: "Miami, USA", score: 85 },
  { company: "Urban Essentials", type: "Online Store", location: "Chicago, USA", score: 82 },
  { company: "Petopia Boutique", type: "Pet Store", location: "Austin, USA", score: 80 },
];

export const AGENT_FEED = [
  { agent: "Trend Hunter Agent", action: "Found 12 trending products", ago: "2m ago", tone: "brand" },
  { agent: "Demand Intelligence Agent", action: "Analyzed demand for 45 products", ago: "3m ago", tone: "amber" },
  { agent: "Supplier Finder Agent", action: "Found 18 new verified suppliers", ago: "4m ago", tone: "green" },
  { agent: "Buyer Discovery Agent", action: "Found 68 new buyer leads", ago: "5m ago", tone: "blue" },
  { agent: "Outreach Agent", action: "Sent 156 outreach messages", ago: "6m ago", tone: "cyan" },
  { agent: "Negotiation Agent", action: "Negotiating with 3 buyers", ago: "8m ago", tone: "red" },
];

export const ALERTS = [
  { title: "High Risk Supplier Detected", sub: "Shenzhen Unitop Tech", ago: "2m ago", tone: "red" },
  { title: "Trademark Alert", sub: "\"FlexiGlow\" may infringe existing trademark", ago: "1h ago", tone: "amber" },
  { title: "Demand Spike Detected", sub: "LED Book Reading Light", ago: "2h ago", tone: "green" },
  { title: "Low Stock Warning", sub: "Portable Blender Cup (Supplier: XYZ)", ago: "3h ago", tone: "amber" },
];

export const REVENUE_SERIES = [
  { d: "Apr 20", v: 22000 }, { d: "Apr 23", v: 28000 }, { d: "Apr 27", v: 35000 },
  { d: "May 01", v: 41000 }, { d: "May 04", v: 48000 }, { d: "May 08", v: 56000 },
  { d: "May 11", v: 63000 }, { d: "May 15", v: 72000 }, { d: "May 18", v: 82000 },
];

export const CATEGORY_SERIES = [
  { name: "Home & Kitchen", value: 359, fill: "#7c3aed" },
  { name: "Beauty & Personal Care", value: 282, fill: "#3b82f6" },
  { name: "Pet Supplies", value: 231, fill: "#f59e0b" },
  { name: "Sports & Outdoors", value: 192, fill: "#22c55e" },
  { name: "Electronics", value: 115, fill: "#06b6d4" },
  { name: "Other", value: 104, fill: "#6e6e85" },
];

export const RADAR_SERIES = [
  { axis: "Search Volume", you: 92, market: 70 },
  { axis: "Social Trends", you: 88, market: 65 },
  { axis: "Competition", you: 35, market: 60 },
  { axis: "Profit Margin", you: 85, market: 55 },
  { axis: "Market Potential", you: 91, market: 72 },
  { axis: "Seasonal Score", you: 78, market: 60 },
];

export const PIPELINE = [
  { stage: "Prospecting", count: 286, value: "$286K" },
  { stage: "Contacted", count: 154, value: "$432K" },
  { stage: "Negotiation", count: 67, value: "$321K" },
  { stage: "Quotation", count: 34, value: "$156K" },
  { stage: "Closed Won", count: 21, value: "$63K" },
];

export const TOP_AGENTS = [
  { name: "Demand Intelligence Agent", score: 98 },
  { name: "Buyer Discovery Agent", score: 96 },
  { name: "Outreach Agent", score: 94 },
  { name: "Trend Hunter Agent", score: 93 },
  { name: "Negotiation Agent", score: 91 },
];

export const CAMPAIGN_STATS = {
  total: 18, inProgress: 12, sent: 2451, replies: 654, meetings: 48, deals: 21,
  topCampaign: "Summer Fitness Products",
  openRate: "46.8%", replyRate: "14.9%", meetingRate: "3.1%",
};
