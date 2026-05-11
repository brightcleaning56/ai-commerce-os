import type { OutreachDraft, Transaction } from "@/lib/store";

/**
 * A "campaign" in AVYN's data model isn't a manually-created object —
 * it's an aggregation. Every outreach draft has a productName; we group
 * drafts by that product into a campaign and roll up counts from real
 * activity (drafts sent, buyer replies, transactions closed).
 *
 * This means:
 *   - No SAMPLE rows. Every campaign on /outreach is real.
 *   - Operator never has to "create" a campaign — it appears the moment
 *     the pipeline drafts outreach for a new product.
 *   - Replies, meetings, and deals are derived directly from the
 *     underlying drafts/transactions so the numbers are always honest.
 */
export type DerivedCampaign = {
  id: string;                  // stable: derived from productName slug
  name: string;                // productName
  status: "Active" | "Paused" | "Draft" | "Completed";
  channels: ("Email" | "LinkedIn" | "SMS" | "Phone")[];
  audienceSummary: string;     // "X buyers contacted"
  audienceCount: number;
  sent: number;
  opened: number;
  replied: number;
  meetings: number;
  deals: number;
  startedAt: string;           // earliest draft createdAt for this product
  ownerAgent: "Outreach Agent";
};

const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MEETING_PATTERN =
  /(calendly\.com|cal\.com|meet\.google\.com|zoom\.us\/j\/|teams\.microsoft\.com|hubspot\.com\/meetings|chilipiper\.com)/i;

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

export function deriveCampaigns(
  drafts: OutreachDraft[],
  transactions: Transaction[],
): DerivedCampaign[] {
  if (drafts.length === 0) return [];

  // Group drafts by productName (case-insensitive — same product may have
  // tiny capitalization differences across pipeline runs).
  const byProduct = new Map<string, OutreachDraft[]>();
  for (const d of drafts) {
    const key = (d.productName ?? "Unknown product").trim().toLowerCase();
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key)!.push(d);
  }

  // Pre-bucket transactions by product (lowercase) for the deals count
  const txnsByProduct = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const key = (t.productName ?? "").trim().toLowerCase();
    if (!key) continue;
    if (!txnsByProduct.has(key)) txnsByProduct.set(key, []);
    txnsByProduct.get(key)!.push(t);
  }

  const now = Date.now();
  const campaigns: DerivedCampaign[] = [];

  for (const [key, productDrafts] of byProduct.entries()) {
    const display = productDrafts[0].productName;
    const sentDrafts = productDrafts.filter((d) => d.status === "sent");
    const sent = sentDrafts.length;

    // Channels actually used (look at sent drafts only — drafted-but-not-sent
    // doesn't tell us anything about real channel mix)
    const channelSet = new Set<DerivedCampaign["channels"][number]>();
    for (const d of sentDrafts) {
      if (d.sentAt) channelSet.add("Email");
      if (d.smsSentAt) channelSet.add("SMS");
      // LinkedIn / Phone aren't tracked yet at the draft level — add when wired
    }
    const channels = Array.from(channelSet);

    // Replied = sent draft has at least one buyer message in thread
    const replied = sentDrafts.filter((d) => (d.thread ?? []).some((m) => m.role === "buyer")).length;

    // Meetings = buyer reply mentions a calendar/meeting URL
    const meetings = sentDrafts.filter((d) =>
      (d.thread ?? []).some((m) => m.role === "buyer" && MEETING_PATTERN.test(m.body)),
    ).length;

    // Deals = transactions in this product that reached a closed/successful state
    const productTxns = txnsByProduct.get(key) ?? [];
    const deals = productTxns.filter(
      (t) => t.state === "released" || t.state === "completed",
    ).length;

    // Opened — would join from pipeline shareLink accessLog. Keep at 0 for
    // now since the existing /api/outreach/stats already aggregates that
    // and the UI's "Opened" headline tile reads from there. Per-campaign
    // open count is a future slice.
    const opened = 0;

    // Status — Active if any draft in the last 7 days, Paused otherwise,
    // Completed if every linked transaction is released/completed
    const newest = Math.max(...productDrafts.map((d) => new Date(d.createdAt).getTime()));
    let status: DerivedCampaign["status"];
    if (sent === 0) status = "Draft";
    else if (productTxns.length > 0 && deals === productTxns.length) status = "Completed";
    else if (now - newest < ACTIVE_WINDOW_MS) status = "Active";
    else status = "Paused";

    // Audience = unique buyers across drafts
    const buyers = new Set(productDrafts.map((d) => d.buyerCompany).filter(Boolean));
    const audienceCount = buyers.size;

    const startedAt = new Date(
      Math.min(...productDrafts.map((d) => new Date(d.createdAt).getTime())),
    ).toISOString();

    campaigns.push({
      id: `camp_${slugify(key) || "unnamed"}`,
      name: display,
      status,
      channels,
      audienceSummary: `${audienceCount} buyer${audienceCount === 1 ? "" : "s"} contacted`,
      audienceCount,
      sent,
      opened,
      replied,
      meetings,
      deals,
      startedAt,
      ownerAgent: "Outreach Agent",
    });
  }

  // Sort by most recent activity first
  return campaigns.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}
