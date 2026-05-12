import type { Buyer } from "@/lib/buyers";
import type { DiscoveredBuyer, Lead } from "@/lib/store";
import { scoreLead } from "@/lib/leadScore";

/**
 * Map an inbound Lead (from /contact or /signup) to a DiscoveredBuyer
 * record so the Outreach Agent can start drafting for them automatically.
 *
 * The lead form captures less than the buyer schema needs, so we infer
 * sensible defaults from what we have. Anything we genuinely don't know
 * is left as a placeholder ("—" / empty string) rather than guessed,
 * so the operator can spot fields to enrich later.
 */

// Best-effort buyer.type inference from the industry the operator picked
// on the form. This isn't load-bearing — the Outreach Agent uses email +
// company more than `type` for personalization — but it makes the buyer
// row look right in the discovered-buyers table.
const INDUSTRY_TO_TYPE: Record<string, Buyer["type"]> = {
  "Wholesale / B2B": "Wholesaler",
  "Brand / Manufacturer": "E-commerce Brand",
  "Brand": "E-commerce Brand",
  "Retail Chain": "Retail Chain",
  "E-commerce / DTC": "E-commerce Brand",
  "E-commerce Brand": "E-commerce Brand",
  "Marketplace Seller": "Marketplace Seller",
  "Logistics / 3PL": "Distributor",
  "Boutique": "Boutique",
  "Pet Store": "Pet Store",
  "Online Store": "Online Store",
};

// Map company-size band → revenue band. Crude but better than blank.
function inferRevenue(companySize?: string): string {
  if (!companySize) return "—";
  const s = companySize.trim();
  if (s.startsWith("1-10") || s.startsWith("1–10")) return "$0-2M";
  if (s.startsWith("11-50") || s.startsWith("11–50")) return "$2-5M";
  if (s.startsWith("51-200") || s.startsWith("51–200")) return "$5-25M";
  if (s.startsWith("201")) return "$25-100M";
  if (s.startsWith("1,000")) return "$100M+";
  return "—";
}

// Pull the website domain out of the email address. Strips generic personal
// providers because their domain isn't actually the lead's company website.
const GENERIC_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
]);
function inferWebsite(email: string): string {
  const d = (email.split("@")[1] || "").trim().toLowerCase();
  if (!d) return "";
  if (GENERIC_DOMAINS.has(d)) return "";
  return d;
}

// USE_CASE id → product category we'd reasonably draft outreach for.
// Outreach Agent will narrow these to actual catalog items at draft time;
// this is just a starting set so the buyer doesn't look "matchedProducts: []".
const USECASE_TO_PRODUCT_HINTS: Record<string, string[]> = {
  "find-buyers": ["Wholesale catalog"],
  "automate-outbound": ["Outreach automation"],
  "scale-revenue": ["Wholesale catalog"],
  "find-products": ["Trending products"],
  "trends": ["Trending products"],
  "outreach": ["Outreach automation"],
  "suppliers": ["Sourcing"],
  "pipeline": ["Sales pipeline"],
  "custom": ["Custom integration"],
  "whitelabel": ["White-label"],
};

export function leadToDiscoveredBuyer(
  lead: Lead,
  opts: { runId?: string; agent?: string } = {},
): DiscoveredBuyer {
  const score = scoreLead(lead);

  const inferredType: Buyer["type"] =
    (lead.industry && INDUSTRY_TO_TYPE[lead.industry.trim()]) || "Online Store";

  const matchedProducts = Array.from(
    new Set((lead.useCases ?? []).flatMap((uc) => USECASE_TO_PRODUCT_HINTS[uc] ?? [])),
  );

  // Stable id derived from the lead id so re-promoting the same lead doesn't
  // create twin buyer records. (UI prevents re-promotion via `promotedToBuyerId`,
  // but defense in depth.)
  const buyerId = `b_lead_${lead.id}`;

  return {
    id: buyerId,
    company: lead.company || "—",
    type: inferredType,
    industry: lead.industry?.trim() || "Multi-category",
    location: "—",          // Lead form doesn't capture location yet
    country: "USA",          // Reasonable default; operator can edit
    intentScore: score.total,
    revenue: inferRevenue(lead.companySize),
    employees: lead.companySize?.trim() || "—",
    website: inferWebsite(lead.email),
    decisionMaker: lead.name || "—",
    decisionMakerTitle: "Operator",  // Lead form doesn't capture title
    email: lead.email,
    // Carry lead.phone through so click-to-call works on the buyer record
    // and on any phone task spawned from it. Was silently dropped before.
    phone: lead.phone,
    linkedin: "",
    lastActivity: "Just promoted",
    status: "New",
    fit: score.total,
    matchedProducts,
    // DiscoveredBuyer extension fields
    source: "agent",
    agent: opts.agent ?? "lead-promotion",
    discoveredAt: new Date().toISOString(),
    runId: opts.runId ?? `lead-promote-${lead.id}`,
    rationale: buildRationale(lead, score.tier, score.total),
    forProduct: matchedProducts[0] ?? "Wholesale catalog",
  };
}

function buildRationale(
  lead: Lead,
  tier: "hot" | "warm" | "cold",
  total: number,
): string {
  const bits: string[] = [];
  bits.push(`Promoted from ${lead.source} (score ${total}, ${tier})`);
  if (lead.timeline) bits.push(`timeline: ${lead.timeline}`);
  if (lead.budget) bits.push(`budget: ${lead.budget}`);
  if (lead.useCases?.length) bits.push(`goals: ${lead.useCases.join(", ")}`);
  return bits.join(" · ");
}
