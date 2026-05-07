import { NextResponse } from "next/server";
import { findFollowupCandidates } from "@/lib/agents/followup";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Priority = "critical" | "high" | "medium" | "low";

type Suggestion = {
  id: string;
  source: "negotiation" | "engagement" | "followup" | "quote" | "risk";
  priority: Priority;
  ts: string;          // when the suggestion fires (newest computation time)
  title: string;
  detail: string;
  action: string;       // human-readable next step
  href?: string;        // deep link
  draftId?: string;
  quoteId?: string;
  riskId?: string;
};

const priorityWeight: Record<Priority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Aggregate AI-recommended actions across the system into one prioritized feed.
 *
 * Sources:
 *  - Negotiation Agent's `recommendedAction` on each thread message
 *  - Engagement signal: drafts with high view counts + no buyer reply
 *  - Auto-followup candidates (slice 34)
 *  - Quote lifecycle: draft quotes that need to be sent / decisions pending
 *  - Risk flags with severity Critical/High that haven't been actioned
 */
export async function GET() {
  const drafts = await store.getDrafts();
  const quotes = await store.getQuotes();
  const flags = await store.getRiskFlags();
  const now = Date.now();
  const suggestions: Suggestion[] = [];

  // 1. Negotiation recommendations on the latest agent message of each draft thread
  for (const d of drafts) {
    const lastAgent = (d.thread ?? [])
      .filter((m) => m.role === "agent" && m.recommendedAction)
      .at(-1);
    if (!lastAgent) continue;
    const action = lastAgent.recommendedAction!;
    const priority: Priority =
      action.includes("Escalate") || action.includes("pricing pressure")
        ? "high"
        : action.includes("Walk away")
        ? "medium"
        : action === "Send as-is"
        ? "high"
        : "medium";
    suggestions.push({
      id: `neg_${lastAgent.id}`,
      source: "negotiation",
      priority,
      ts: lastAgent.at,
      title: `Negotiation: ${action}`,
      detail: `${d.buyerCompany} · ${lastAgent.summary ?? "review the agent's counter-offer"}`,
      action: action.startsWith("Send")
        ? "Approve & send the counter"
        : action.startsWith("Escalate")
        ? "Take over manually"
        : action,
      href: `/outreach`,
      draftId: d.id,
    });
  }

  // 2. Hot engagement, no buyer reply yet — scorching leads
  for (const d of drafts) {
    if (d.status !== "sent" || !d.shareLinkToken || !d.pipelineId) continue;
    const buyerReplied = (d.thread ?? []).some((m) => m.role === "buyer");
    if (buyerReplied) continue;
    const run = await store.getPipelineRun(d.pipelineId);
    if (!run) continue;
    const views = (run.accessLog ?? []).filter((e) => e.linkToken === d.shareLinkToken);
    if (views.length < 3) continue;
    const last = views[0]?.ts ?? d.sentAt!;
    suggestions.push({
      id: `eng_${d.id}`,
      source: "engagement",
      priority: views.length >= 5 ? "critical" : "high",
      ts: last,
      title: `${d.buyerCompany} opened the proposal ${views.length}× — no reply yet`,
      detail: `Strong intent signal. They keep coming back. Consider a direct nudge or a phone call.`,
      action: `Send a quick "saw you're looking" follow-up`,
      href: `/outreach`,
      draftId: d.id,
    });
  }

  // 3. Auto-followup candidates (cold drafts)
  for (const c of await findFollowupCandidates()) {
    suggestions.push({
      id: `fup_${c.draft.id}`,
      source: "followup",
      priority: c.daysSinceSent > 7 ? "low" : "medium",
      ts: c.draft.sentAt!,
      title: `${c.draft.buyerCompany}: silent for ${c.daysSinceSent.toFixed(0)} days`,
      detail:
        c.views === 0
          ? "Never opened the proposal. Either the email missed or the angle didn't land."
          : `Opened ${c.views}× but no reply.`,
      action: "Generate a follow-up draft",
      href: `/outreach`,
      draftId: c.draft.id,
    });
  }

  // 4. Quote lifecycle
  for (const q of quotes) {
    if (q.status === "draft") {
      suggestions.push({
        id: `q_${q.id}_send`,
        source: "quote",
        priority: "medium",
        ts: q.createdAt,
        title: `Quote ready for ${q.buyerCompany}`,
        detail: `$${q.total.toLocaleString()} total. Draft created ${relTime(q.createdAt)}.`,
        action: "Review & send to buyer",
        href: `/quote/${q.id}?t=${q.shareToken}`,
        quoteId: q.id,
      });
    }
    if (q.status === "sent") {
      // Sent quotes that are about to expire
      const msUntilExpiry = new Date(q.shareExpiresAt).getTime() - now;
      const hoursLeft = msUntilExpiry / (3600 * 1000);
      if (hoursLeft > 0 && hoursLeft < 48) {
        suggestions.push({
          id: `q_${q.id}_expiring`,
          source: "quote",
          priority: hoursLeft < 12 ? "high" : "medium",
          ts: new Date(now).toISOString(),
          title: `Quote for ${q.buyerCompany} expires in ${hoursLeft.toFixed(0)}h`,
          detail: `$${q.total.toLocaleString()} pending decision. Consider a nudge.`,
          action: "Ping the buyer or extend validity",
          href: `/quote/${q.id}?t=${q.shareToken}`,
          quoteId: q.id,
        });
      }
    }
  }

  // 5. Unactioned high/critical risk flags
  for (const f of flags) {
    if (f.severity !== "Critical" && f.severity !== "High") continue;
    suggestions.push({
      id: `risk_${f.id}`,
      source: "risk",
      priority: f.severity === "Critical" ? "critical" : "high",
      ts: f.createdAt,
      title: `${f.severity}: ${f.title}`,
      detail: f.detail,
      action: f.recommended,
      href: `/risk`,
      riskId: f.id,
    });
  }

  // Sort: priority desc, then ts desc (newest within priority first)
  suggestions.sort((a, b) => {
    const dp = priorityWeight[b.priority] - priorityWeight[a.priority];
    if (dp !== 0) return dp;
    return new Date(b.ts).getTime() - new Date(a.ts).getTime();
  });

  return NextResponse.json({
    suggestions,
    counts: {
      total: suggestions.length,
      critical: suggestions.filter((s) => s.priority === "critical").length,
      high: suggestions.filter((s) => s.priority === "high").length,
      medium: suggestions.filter((s) => s.priority === "medium").length,
      low: suggestions.filter((s) => s.priority === "low").length,
      bySource: {
        negotiation: suggestions.filter((s) => s.source === "negotiation").length,
        engagement: suggestions.filter((s) => s.source === "engagement").length,
        followup: suggestions.filter((s) => s.source === "followup").length,
        quote: suggestions.filter((s) => s.source === "quote").length,
        risk: suggestions.filter((s) => s.source === "risk").length,
      },
    },
  });
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}
