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

// SAMPLE DEALS array removed — no more "Sarah Chen / Marcus Brooks / Priya
// Patel / Aiko Tanaka" 15-deal seed mixed into the operator's CRM. Real
// deals are derived per-request by /api/crm/deals from sent OutreachDrafts
// that have dealStage / dealValue / dealUnits set (operator-marked or
// Negotiation-Agent-set). The /crm page renders only those.
//
// Do NOT re-add a hardcoded DEALS array here.

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
