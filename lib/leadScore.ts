import type { Lead } from "@/lib/store";

export type LeadTier = "hot" | "warm" | "cold";

export type LeadScore = {
  total: number;          // 0..100
  tier: LeadTier;          // hot/warm/cold bucket
  factors: { label: string; weight: number }[]; // explanation breakdown
};

/**
 * Score an inbound lead 0..100 based on the signals captured from /contact
 * or /signup forms. Tier:
 *   hot   ≥ 70 → act today, AI auto-reply already sent, follow up personally
 *   warm  ≥ 40 → act within 48h
 *   cold  <  40 → trickle / sequence / dedupe
 *
 * Algorithm is intentionally simple + transparent — the operator can read
 * the factors[] explanation and trust the ranking. Tune via the constants
 * below; do NOT add ML until there's at least 100 closed-won leads to
 * train on.
 */

// Company size buckets — larger = higher buying authority + budget
const SIZE_WEIGHTS: Record<string, number> = {
  "1-10": 5, "1–10": 5,
  "11-50": 12, "11–50": 12,
  "51-200": 20, "51–200": 20,
  "201-1,000": 25, "201–1,000": 25,
  "1,000+": 30,
};

// Industry fit — higher = closer to AVYN's wholesale B2B sweet spot
const INDUSTRY_WEIGHTS: Record<string, number> = {
  "Wholesale / B2B": 15,
  "Brand / Manufacturer": 13,
  "Retail Chain": 12,
  "E-commerce / DTC": 10,
  "Marketplace Seller": 9,
  "Logistics / 3PL": 6,
  "Agency / Consultancy": 5,
  "E-commerce Brand": 10,
  "Brand": 10,
  "Other": 2,
};

// Timeline urgency — sooner = higher
const TIMELINE_WEIGHTS: Record<string, number> = {
  "ASAP": 15,
  "Within 1 month": 12,
  "1-3 months": 8, "1–3 months": 8,
  "Exploring options": 3,
};

// Use-case alignment — these are the goals AVYN delivers best on
const USECASE_WEIGHTS: Record<string, number> = {
  "find-buyers": 8,
  "automate-outbound": 8,
  "scale-revenue": 7,
  "find-products": 5,
  "trends": 3,
  "outreach": 8,
  "suppliers": 4,
  "pipeline": 5,
  "custom": 6,
  "whitelabel": 5,
};

// Generic personal-email domains — slight negative because business email
// signals an established company. Not a dealbreaker.
const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
]);

export function scoreLead(lead: Lead): LeadScore {
  const factors: { label: string; weight: number }[] = [];
  let total = 0;

  // Company size (0-30)
  if (lead.companySize) {
    const w = SIZE_WEIGHTS[lead.companySize.trim()] ?? 0;
    if (w > 0) {
      total += w;
      factors.push({ label: `Size: ${lead.companySize}`, weight: w });
    }
  }

  // Industry fit (0-15)
  if (lead.industry) {
    const w = INDUSTRY_WEIGHTS[lead.industry.trim()] ?? 4;
    total += w;
    factors.push({ label: `Industry: ${lead.industry}`, weight: w });
  }

  // Timeline urgency (0-15)
  if (lead.timeline) {
    const w = TIMELINE_WEIGHTS[lead.timeline.trim()] ?? 0;
    if (w > 0) {
      total += w;
      factors.push({ label: `Timeline: ${lead.timeline}`, weight: w });
    }
  }

  // Use cases (0-16, capped — more goals = higher signal but diminishing)
  if (lead.useCases && lead.useCases.length > 0) {
    const ucScore = Math.min(
      16,
      lead.useCases.reduce((sum, uc) => sum + (USECASE_WEIGHTS[uc] ?? 2), 0),
    );
    total += ucScore;
    factors.push({ label: `${lead.useCases.length} stated goal${lead.useCases.length === 1 ? "" : "s"}`, weight: ucScore });
  }

  // Budget signal — any value at all means they thought about it (0-10)
  if (lead.budget && lead.budget.trim() && lead.budget.trim() !== "—") {
    let w = 6;
    // Larger budget bands score higher
    const b = lead.budget.toLowerCase();
    if (/1m|million/.test(b)) w = 10;
    else if (/200k|500k/.test(b)) w = 9;
    else if (/50k|100k/.test(b)) w = 8;
    else if (/10k/.test(b)) w = 7;
    total += w;
    factors.push({ label: `Budget signal: ${lead.budget}`, weight: w });
  }

  // Phone provided (0-6) — willing to be called = high intent
  if (lead.phone && lead.phone.trim().length >= 7) {
    total += 6;
    factors.push({ label: "Phone provided", weight: 6 });
  }

  // Custom message length (0-8) — more thought = higher signal
  if (lead.message) {
    const len = lead.message.trim().length;
    let w = 0;
    if (len >= 200) w = 8;
    else if (len >= 80) w = 5;
    else if (len >= 20) w = 2;
    if (w > 0) {
      total += w;
      factors.push({ label: `Wrote ${len}-char message`, weight: w });
    }
  }

  // Email domain (-3 to +5) — business domain is a stronger signal
  const emailDomain = (lead.email.split("@")[1] || "").toLowerCase();
  if (emailDomain && !GENERIC_EMAIL_DOMAINS.has(emailDomain)) {
    total += 5;
    factors.push({ label: `Business email (${emailDomain})`, weight: 5 });
  } else if (GENERIC_EMAIL_DOMAINS.has(emailDomain)) {
    total -= 3;
    factors.push({ label: `Personal email (${emailDomain})`, weight: -3 });
  }

  // Source — /signup is generally higher intent than /contact (asking to get in vs general inquiry)
  if (lead.source === "signup-form") {
    total += 3;
    factors.push({ label: "Source: signup-form", weight: 3 });
  }

  // Clamp 0..100
  total = Math.max(0, Math.min(100, total));

  const tier: LeadTier = total >= 70 ? "hot" : total >= 40 ? "warm" : "cold";

  return { total, tier, factors };
}
