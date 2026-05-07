import { runNegotiation } from "@/lib/agents/negotiation";
import { store, type OutreachDraft } from "@/lib/store";

export type InboundMatch = {
  draft: OutreachDraft;
  matchedBy: "message-id" | "from-and-subject" | "from-only";
};

export type InboundResult = {
  ok: boolean;
  match: InboundMatch | null;
  reason?: string;
  negotiation?: {
    runId: string;
    durationMs: number;
    sentiment: string;
    recommendedAction: string;
    counterSubject: string;
    engagement?: {
      viewCount: number;
      warmth: "cold" | "warm" | "hot" | "scorching" | "unknown";
      lastViewedAt?: string;
      daysSinceLastView?: number;
      daysSinceFirstView?: number;
    };
  };
};

/**
 * Strip "Re:", "RE:", "Fwd:" prefixes and normalize whitespace
 * for fuzzy subject matching.
 */
function normalizeSubject(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/^(\s*(re|fwd|fw)\s*:\s*)+/i, "").trim().toLowerCase();
}

function extractEmail(addr: string | null | undefined): string {
  if (!addr) return "";
  const m = addr.match(/<([^>]+)>/);
  return (m ? m[1] : addr).trim().toLowerCase();
}

/**
 * Find the draft that this inbound email is replying to.
 *
 * Strategy (most→least confident):
 *   1. `In-Reply-To` header matches a stored draft.messageId
 *   2. From-address matches a known buyer email + subject matches (after Re:)
 *   3. From-address matches a buyer + only one open draft to that buyer
 */
export async function matchInboundToDraft(input: {
  fromEmail: string;
  subject: string;
  inReplyToMessageId?: string;
}): Promise<InboundMatch | null> {
  const drafts = await store.getDrafts();
  const fromEmail = extractEmail(input.fromEmail);
  const subj = normalizeSubject(input.subject);

  // 1. Strong match on stored messageId
  if (input.inReplyToMessageId) {
    const cleanId = input.inReplyToMessageId.replace(/^[<\s]+|[>\s]+$/g, "");
    const direct = drafts.find((d) => d.messageId && cleanId.includes(d.messageId));
    if (direct) return { draft: direct, matchedBy: "message-id" };
  }

  // 2. From + subject (the original draft.email.subject normalized to lowercase)
  const candidatesByFrom = drafts.filter(
    (d) =>
      d.sentToEmail?.toLowerCase() === fromEmail ||
      // Also match when send was redirected — match by buyer email
      (d.redirectedFromEmail?.toLowerCase() === fromEmail)
  );
  if (candidatesByFrom.length > 0 && subj) {
    const subjectMatch = candidatesByFrom.find(
      (d) => normalizeSubject(d.email.subject) === subj
    );
    if (subjectMatch) return { draft: subjectMatch, matchedBy: "from-and-subject" };
  }

  // 3. Just the most recent open draft sent to that address
  if (candidatesByFrom.length === 1) {
    return { draft: candidatesByFrom[0], matchedBy: "from-only" };
  }
  if (candidatesByFrom.length > 1) {
    // Pick the most-recently-sent one
    const sorted = [...candidatesByFrom].sort(
      (a, b) => (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt)
    );
    return { draft: sorted[0], matchedBy: "from-only" };
  }

  return null;
}

export type ProcessInput = {
  fromEmail: string;
  fromName?: string;
  subject: string;
  textBody: string;
  inReplyToMessageId?: string;
};

/**
 * Process an inbound email end-to-end:
 *   - Match to a draft
 *   - If matched, fire Negotiation Agent on the body
 *   - Persist thread updates
 */
export async function processInbound(input: ProcessInput): Promise<InboundResult> {
  const match = await matchInboundToDraft({
    fromEmail: input.fromEmail,
    subject: input.subject,
    inReplyToMessageId: input.inReplyToMessageId,
  });

  if (!match) {
    return {
      ok: false,
      match: null,
      reason: `No draft matched ${input.fromEmail} / "${input.subject}"`,
    };
  }

  // Strip common email tail (signature, quoted reply chain)
  const cleaned = stripQuotedReply(input.textBody).trim();
  if (cleaned.length < 5) {
    return {
      ok: false,
      match,
      reason: "Reply body too short to negotiate on",
    };
  }

  try {
    const result = await runNegotiation({
      draftId: match.draft.id,
      buyerReply: cleaned,
    });
    const counter = result.thread.find((m) => m.role === "agent" && m.runId === result.run.id);
    return {
      ok: true,
      match,
      negotiation: {
        runId: result.run.id,
        durationMs: result.run.durationMs,
        sentiment: result.sentiment,
        recommendedAction: result.recommendedAction,
        counterSubject: counter?.subject ?? "",
        engagement: result.engagement,
      },
    };
  } catch (e) {
    return {
      ok: false,
      match,
      reason: e instanceof Error ? e.message : "Negotiation failed",
    };
  }
}

/**
 * Trim the quoted-reply chain from a message body.
 * Handles common patterns: "On … wrote:", "From: …", lines starting with ">".
 */
function stripQuotedReply(body: string): string {
  const lines = body.split(/\r?\n/);
  const cutPatterns = [
    /^On .+ wrote:\s*$/i,
    /^From: .+/i,
    /^-----Original Message-----/i,
    /^Sent from my (iPhone|iPad|Android)/i,
  ];
  let cutAt = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (cutPatterns.some((p) => p.test(l.trim()))) {
      cutAt = i;
      break;
    }
  }
  // Also drop trailing > quote blocks
  let end = cutAt;
  while (end > 0 && lines[end - 1].trim().startsWith(">")) end--;
  return lines.slice(0, end).join("\n").trim();
}
