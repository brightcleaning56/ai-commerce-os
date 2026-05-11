import type { OutreachDraft } from "@/lib/store";

/**
 * Outreach Insights — surface what's actually working from real send + reply
 * data so the operator (and eventually the agent) can make decisions instead
 * of guessing. All numbers are derived from sent OutreachDraft records — no
 * SAMPLE rows, never any placeholder leaderboards.
 *
 * Aggregations are intentionally simple + transparent:
 *   - Reply = the draft's thread has at least one buyer message
 *   - Time-to-reply = first buyer message timestamp minus sentAt
 *   - Channel = which channel actually went out (sentAt → Email, smsSentAt → SMS, etc.)
 *
 * Cells with too few sends to be meaningful are flagged via `confident`
 * so the UI can grey them out instead of pretending 1/1 = 100%.
 */

const MIN_CONFIDENT_SENDS = 5;

export type LeaderboardRow = {
  label: string;
  sent: number;
  replied: number;
  replyRatePct: number;
  avgHoursToReply: number | null;     // null if no replies
  confident: boolean;                  // false if sent < MIN_CONFIDENT_SENDS
};

export type OutreachInsights = {
  hasAnyData: boolean;                 // false → UI shows "no data yet" empty state
  totalSent: number;
  totalReplied: number;
  overallReplyRatePct: number;
  byChannel: LeaderboardRow[];         // Email / SMS / LinkedIn
  byModel: LeaderboardRow[];           // sonnet vs haiku, etc.
  byDayOfWeek: LeaderboardRow[];       // Mon..Sun, ordered by reply rate
  bestSubjects: LeaderboardRow[];      // top 5 first-3-words signatures
  byTouchNumber: LeaderboardRow[];     // First / 2nd / 3rd+ touch reply rate
  // Cost-per-reply economics. Only counts drafts that actually had a Claude
  // call (estCostUsd present, usedFallback === false). Lets the operator see
  // whether the AI personalization is paying for itself.
  cost: {
    totalUsd: number;                  // sum of estCostUsd across sent drafts
    drafts: number;                    // how many drafts contributed cost
    repliedDrafts: number;             // how many of those got a reply
    costPerReplyUsd: number | null;    // null if no replies yet
    costPerSendUsd: number | null;     // null if no AI sends
  };
};

type Bucket = {
  sent: number;
  replied: number;
  totalReplyMs: number;
};

function newBucket(): Bucket {
  return { sent: 0, replied: 0, totalReplyMs: 0 };
}

function rowFromBucket(label: string, b: Bucket): LeaderboardRow {
  const replyRate = b.sent > 0 ? (b.replied / b.sent) * 100 : 0;
  const avgMs = b.replied > 0 ? b.totalReplyMs / b.replied : null;
  return {
    label,
    sent: b.sent,
    replied: b.replied,
    replyRatePct: Math.round(replyRate * 10) / 10,
    avgHoursToReply: avgMs === null ? null : Math.round((avgMs / 36e5) * 10) / 10,
    confident: b.sent >= MIN_CONFIDENT_SENDS,
  };
}

function firstBuyerMessage(d: OutreachDraft): { atMs: number } | null {
  const buyer = (d.thread ?? []).find((m) => m.role === "buyer");
  if (!buyer) return null;
  const ms = new Date(buyer.at).getTime();
  if (!Number.isFinite(ms)) return null;
  return { atMs: ms };
}

function classifyModel(modelId: string): string {
  if (!modelId) return "unknown";
  const m = modelId.toLowerCase();
  if (m.includes("haiku")) return "haiku";
  if (m.includes("sonnet")) return "sonnet";
  if (m.includes("opus")) return "opus";
  if (m.includes("gpt")) return "gpt";
  return modelId;
}

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Subject signature = lowercase, first 3 meaningful words. Lets us group
// "Fitness Q3 — buyer name" + "Fitness Q3 — other buyer" together when the
// AI is templating the same opener. Punctuation stripped.
function subjectSignature(subject: string): string {
  if (!subject) return "(no subject)";
  const tokens = subject
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
  return tokens.slice(0, 3).join(" ") || "(generic)";
}

const STOP = new Set([
  "the", "and", "for", "with", "from", "your", "you", "our", "we", "a", "an",
  "to", "of", "in", "at", "on", "by", "is", "it", "as", "be", "are", "or",
]);

export function deriveInsights(drafts: OutreachDraft[]): OutreachInsights {
  // We only count sent drafts in the success math. Drafted-but-not-sent
  // tells us nothing about reply behaviour.
  const sent = drafts.filter((d) => d.status === "sent");

  if (sent.length === 0) {
    return {
      hasAnyData: false,
      totalSent: 0,
      totalReplied: 0,
      overallReplyRatePct: 0,
      byChannel: [],
      byModel: [],
      byDayOfWeek: [],
      bestSubjects: [],
      byTouchNumber: [],
      cost: {
        totalUsd: 0,
        drafts: 0,
        repliedDrafts: 0,
        costPerReplyUsd: null,
        costPerSendUsd: null,
      },
    };
  }

  const channelBuckets: Record<"Email" | "SMS" | "LinkedIn", Bucket> = {
    Email: newBucket(),
    SMS: newBucket(),
    LinkedIn: newBucket(),
  };
  const modelBuckets = new Map<string, Bucket>();
  const dowBuckets = new Map<number, Bucket>();
  const subjectBuckets = new Map<string, Bucket>();
  const touchBuckets: Record<"First" | "2nd" | "3rd+", Bucket> = {
    "First": newBucket(),
    "2nd": newBucket(),
    "3rd+": newBucket(),
  };

  // Cost tally — only count drafts where we have a real Claude cost
  // (estCostUsd present, usedFallback false). Fallback drafts are free
  // and would distort cost-per-reply downward.
  let costTotalUsd = 0;
  let costDrafts = 0;
  let costRepliedDrafts = 0;

  let totalReplied = 0;

  for (const d of sent) {
    const reply = firstBuyerMessage(d);
    const replied = reply !== null;
    if (replied) totalReplied += 1;

    // For per-channel stats, count each channel that actually went out
    // separately. A draft sent on both Email + SMS counts in both buckets,
    // because a reply to either is attributed to that channel.
    const channels: Array<{ key: "Email" | "SMS" | "LinkedIn"; sentAt?: string }> = [];
    if (d.sentAt) channels.push({ key: "Email", sentAt: d.sentAt });
    if (d.smsSentAt) channels.push({ key: "SMS", sentAt: d.smsSentAt });
    if (d.linkedinSentAt) channels.push({ key: "LinkedIn", sentAt: d.linkedinSentAt });
    if (channels.length === 0 && d.sentAt) channels.push({ key: "Email", sentAt: d.sentAt });

    for (const ch of channels) {
      const b = channelBuckets[ch.key];
      b.sent += 1;
      if (replied && reply) {
        const sentMs = ch.sentAt ? new Date(ch.sentAt).getTime() : NaN;
        if (Number.isFinite(sentMs) && reply.atMs > sentMs) {
          b.replied += 1;
          b.totalReplyMs += reply.atMs - sentMs;
        } else {
          // reply but no clean elapsed (timestamp missing) — still count the reply
          b.replied += 1;
        }
      }
    }

    // Model bucket — keyed by family (haiku/sonnet/opus) so we get statistically
    // meaningful groups instead of one row per model snapshot id.
    const modelKey = classifyModel(d.modelUsed);
    if (!modelBuckets.has(modelKey)) modelBuckets.set(modelKey, newBucket());
    const mb = modelBuckets.get(modelKey)!;
    mb.sent += 1;
    if (replied && reply) {
      mb.replied += 1;
      const baseSent = d.sentAt ?? d.smsSentAt ?? d.linkedinSentAt;
      const sentMs = baseSent ? new Date(baseSent).getTime() : NaN;
      if (Number.isFinite(sentMs) && reply.atMs > sentMs) mb.totalReplyMs += reply.atMs - sentMs;
    }

    // Day-of-week — based on the actual send timestamp (whichever channel)
    const baseSent = d.sentAt ?? d.smsSentAt ?? d.linkedinSentAt ?? d.createdAt;
    const dow = new Date(baseSent).getDay();
    if (!Number.isNaN(dow)) {
      if (!dowBuckets.has(dow)) dowBuckets.set(dow, newBucket());
      const db = dowBuckets.get(dow)!;
      db.sent += 1;
      if (replied && reply) {
        db.replied += 1;
        const sentMs = new Date(baseSent).getTime();
        if (Number.isFinite(sentMs) && reply.atMs > sentMs) db.totalReplyMs += reply.atMs - sentMs;
      }
    }

    // Subject signature — only counts emails that actually sent
    if (d.sentAt && d.email?.subject) {
      const sig = subjectSignature(d.email.subject);
      if (!subjectBuckets.has(sig)) subjectBuckets.set(sig, newBucket());
      const sb = subjectBuckets.get(sig)!;
      sb.sent += 1;
      if (replied && reply) {
        sb.replied += 1;
        const sentMs = new Date(d.sentAt).getTime();
        if (Number.isFinite(sentMs) && reply.atMs > sentMs) sb.totalReplyMs += reply.atMs - sentMs;
      }
    }

    // Touch number — first touch (no parent) vs 2nd vs 3rd+. Reveals whether
    // the auto-followup cron is paying off relative to first-touch sends.
    const touchKey: "First" | "2nd" | "3rd+" =
      !d.parentDraftId ? "First" : (d.followupNumber ?? 1) === 1 ? "2nd" : "3rd+";
    const tb = touchBuckets[touchKey];
    tb.sent += 1;
    if (replied && reply) {
      tb.replied += 1;
      const baseSentForTouch = d.sentAt ?? d.smsSentAt ?? d.linkedinSentAt;
      const sentMs = baseSentForTouch ? new Date(baseSentForTouch).getTime() : NaN;
      if (Number.isFinite(sentMs) && reply.atMs > sentMs) tb.totalReplyMs += reply.atMs - sentMs;
    }

    // Cost — only count drafts that actually called Anthropic (i.e. have a
    // real estCostUsd and didn't fall back to the deterministic template).
    if (typeof d.estCostUsd === "number" && d.estCostUsd > 0 && !d.usedFallback) {
      costTotalUsd += d.estCostUsd;
      costDrafts += 1;
      if (replied) costRepliedDrafts += 1;
    }
  }

  const byChannel = (["Email", "SMS", "LinkedIn"] as const)
    .map((k) => rowFromBucket(k, channelBuckets[k]))
    .filter((r) => r.sent > 0)
    .sort((a, b) => b.replyRatePct - a.replyRatePct);

  const byModel = Array.from(modelBuckets.entries())
    .map(([k, b]) => rowFromBucket(k, b))
    .sort((a, b) => b.replyRatePct - a.replyRatePct);

  const byDayOfWeek = Array.from(dowBuckets.entries())
    .map(([dow, b]) => rowFromBucket(DOW_NAMES[dow], b))
    .sort((a, b) => b.replyRatePct - a.replyRatePct);

  // Best subjects — only show signatures with >=3 sends to avoid noise from
  // one-off subjects, and cap at top 5 to keep the panel readable.
  const bestSubjects = Array.from(subjectBuckets.entries())
    .filter(([, b]) => b.sent >= 3)
    .map(([k, b]) => rowFromBucket(k, b))
    .sort((a, b) => b.replyRatePct - a.replyRatePct || b.sent - a.sent)
    .slice(0, 5);

  // Touch-number leaderboard — fixed order so the UI reads First → 2nd → 3rd+
  // (don't sort by reply rate; the temporal narrative is the whole point)
  const byTouchNumber = (["First", "2nd", "3rd+"] as const)
    .map((k) => rowFromBucket(k, touchBuckets[k]))
    .filter((r) => r.sent > 0);

  const totalSent = sent.length;
  const overallReplyRatePct =
    totalSent > 0 ? Math.round(((totalReplied / totalSent) * 100) * 10) / 10 : 0;

  // Round cost outputs to 4 decimals (cent fractions matter for haiku usage)
  const costPerReplyUsd =
    costRepliedDrafts > 0 ? Math.round((costTotalUsd / costRepliedDrafts) * 10000) / 10000 : null;
  const costPerSendUsd =
    costDrafts > 0 ? Math.round((costTotalUsd / costDrafts) * 10000) / 10000 : null;

  return {
    hasAnyData: true,
    totalSent,
    totalReplied,
    overallReplyRatePct,
    byChannel,
    byModel,
    byDayOfWeek,
    bestSubjects,
    byTouchNumber,
    cost: {
      totalUsd: Math.round(costTotalUsd * 10000) / 10000,
      drafts: costDrafts,
      repliedDrafts: costRepliedDrafts,
      costPerReplyUsd,
      costPerSendUsd,
    },
  };
}
