export type DealStage =
  | "Prospecting"
  | "Contacted"
  | "Negotiation"
  | "Quotation"
  | "Closed Won"
  | "Closed Lost";

export type Deal = {
  id: string;
  company: string;
  product: string;
  value: number;
  units: number;
  stage: DealStage;
  owner: string;
  ownerInitials: string;
  closeDate: string;
  probability: number;
  lastTouch: string;
  source: "Outreach Agent" | "LinkedIn" | "Referral" | "Inbound";
};

export const DEALS: Deal[] = [
  { id: "d1", company: "FitLife Stores", product: "Workout Resistance Bands", value: 24500, units: 1500, stage: "Negotiation", owner: "Sarah Chen", ownerInitials: "SC", closeDate: "May 24", probability: 65, lastTouch: "1h ago", source: "Outreach Agent" },
  { id: "d2", company: "ActiveGear Co.", product: "Smart Water Bottle", value: 18200, units: 1200, stage: "Quotation", owner: "Marcus Brooks", ownerInitials: "MB", closeDate: "May 21", probability: 80, lastTouch: "3h ago", source: "Outreach Agent" },
  { id: "d3", company: "Petopia Boutique", product: "Pet Hair Remover Roller", value: 9800, units: 800, stage: "Contacted", owner: "Priya Patel", ownerInitials: "PP", closeDate: "Jun 02", probability: 30, lastTouch: "Yesterday", source: "LinkedIn" },
  { id: "d4", company: "Urban Essentials", product: "LED Strip Lights", value: 14200, units: 950, stage: "Negotiation", owner: "Sarah Chen", ownerInitials: "SC", closeDate: "May 28", probability: 55, lastTouch: "2h ago", source: "Outreach Agent" },
  { id: "d5", company: "GlowUp Beauty", product: "Heated Eye Mask", value: 22500, units: 1500, stage: "Quotation", owner: "Aiko Tanaka", ownerInitials: "AT", closeDate: "May 19", probability: 75, lastTouch: "30m ago", source: "Inbound" },
  { id: "d6", company: "NorthPaw Pets", product: "Dog Training Clicker Set", value: 6400, units: 450, stage: "Prospecting", owner: "Priya Patel", ownerInitials: "PP", closeDate: "Jun 10", probability: 15, lastTouch: "2 days ago", source: "Outreach Agent" },
  { id: "d7", company: "TechWorld Hub", product: "Wireless Earbuds Pro", value: 41000, units: 1200, stage: "Negotiation", owner: "Daniel Brooks", ownerInitials: "DB", closeDate: "Jun 04", probability: 60, lastTouch: "Yesterday", source: "Outreach Agent" },
  { id: "d8", company: "Outback Gear", product: "Foldable Bike Helmet", value: 12800, units: 600, stage: "Contacted", owner: "Marcus Brooks", ownerInitials: "MB", closeDate: "Jun 08", probability: 25, lastTouch: "5h ago", source: "Outreach Agent" },
  { id: "d9", company: "MamaBear Co.", product: "Baby White Noise Machine", value: 8900, units: 600, stage: "Closed Won", owner: "Sarah Chen", ownerInitials: "SC", closeDate: "May 14", probability: 100, lastTouch: "2 days ago", source: "Referral" },
  { id: "d10", company: "Wellness Tribe", product: "Massage Gun", value: 16200, units: 400, stage: "Closed Won", owner: "Aiko Tanaka", ownerInitials: "AT", closeDate: "May 12", probability: 100, lastTouch: "5 days ago", source: "Outreach Agent" },
  { id: "d11", company: "Lumen Living", product: "Smart Plant Sensor", value: 5400, units: 300, stage: "Closed Lost", owner: "Priya Patel", ownerInitials: "PP", closeDate: "May 09", probability: 0, lastTouch: "1 week ago", source: "Outreach Agent" },
  { id: "d12", company: "Hydra Bottle Co.", product: "Smart Water Bottle", value: 11600, units: 800, stage: "Prospecting", owner: "Marcus Brooks", ownerInitials: "MB", closeDate: "Jun 12", probability: 10, lastTouch: "3 days ago", source: "Outreach Agent" },
  { id: "d13", company: "Aurora Cosmetics", product: "Magnetic Eyelashes Kit", value: 19800, units: 1100, stage: "Negotiation", owner: "Aiko Tanaka", ownerInitials: "AT", closeDate: "May 30", probability: 50, lastTouch: "1h ago", source: "LinkedIn" },
  { id: "d14", company: "BrightHome Living", product: "LED Book Reading Light", value: 7200, units: 500, stage: "Contacted", owner: "Sarah Chen", ownerInitials: "SC", closeDate: "Jun 05", probability: 20, lastTouch: "Yesterday", source: "Outreach Agent" },
  { id: "d15", company: "Cobalt Office Supply", product: "Standing Desk Converter", value: 28400, units: 200, stage: "Quotation", owner: "Daniel Brooks", ownerInitials: "DB", closeDate: "May 25", probability: 70, lastTouch: "4h ago", source: "Inbound" },
];

export const STAGES: DealStage[] = [
  "Prospecting",
  "Contacted",
  "Negotiation",
  "Quotation",
  "Closed Won",
  "Closed Lost",
];

export const STAGE_TONE: Record<DealStage, string> = {
  Prospecting: "border-ink-tertiary/30 bg-bg-hover/30",
  Contacted: "border-accent-blue/30 bg-accent-blue/5",
  Negotiation: "border-accent-amber/30 bg-accent-amber/5",
  Quotation: "border-brand-500/30 bg-brand-500/5",
  "Closed Won": "border-accent-green/30 bg-accent-green/5",
  "Closed Lost": "border-accent-red/30 bg-accent-red/5",
};

export const STAGE_DOT: Record<DealStage, string> = {
  Prospecting: "bg-ink-tertiary",
  Contacted: "bg-accent-blue",
  Negotiation: "bg-accent-amber",
  Quotation: "bg-brand-400",
  "Closed Won": "bg-accent-green",
  "Closed Lost": "bg-accent-red",
};
