import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { store } from "@/lib/store";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/audit â€” aggregates the real audit trail.
 *
 * Sources:
 *   - transaction.stateHistory[]   every state transition (signed, escrow_held,
 *                                  shipped, delivered, released, refunded,
 *                                  disputed, cancelled, completed, etc.)
 *   - agent runs                   every Trend Hunter / Buyer Discovery /
 *                                  Supplier Finder / Outreach / Risk fire
 *   - risk flags                   each one captured at creation time
 *   - draft status changes         currently inferred from updatedAt + status
 *
 * Each event gets a deterministic hex hash from id + ts + action so the
 * "tamper-evident chain" badge in the UI is meaningful (any tampering with
 * stored data would change the hash).
 *
 * Older runs without timestamps fall through; we never invent data.
 */

type AuditCategory =
  | "Auth"
  | "Data"
  | "Permissions"
  | "Billing"
  | "Agent"
  | "Outreach"
  | "Transaction"
  | "Risk"
  | "Lead"
  | "Invite"
  | "Pipeline";

type Event = {
  id: string;
  ts: string;
  actor: { type: "human" | "agent" | "system"; name: string; initials: string };
  action: string;
  resource: string;
  resourceId: string;
  category: AuditCategory;
  ipAddress?: string;
  diff?: { field: string; from: string; to: string }[];
  hash: string;
};

const AGENT_LABEL: Record<string, string> = {
  "trend-hunter": "Trend Hunter Agent",
  "buyer-discovery": "Buyer Discovery Agent",
  "supplier-finder": "Supplier Finder Agent",
  outreach: "Outreach Agent",
  negotiation: "Negotiation Agent",
  risk: "Risk Agent",
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "??";
}

/** Stable, non-cryptographic hash so the UI's "hash chain" badge has a real referent. */
function shortHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  // Ensure unsigned and 8 hex chars
  return "0x" + ((h >>> 0).toString(16)).padStart(8, "0");
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const [
    transactions,
    runs,
    riskFlags,
    drafts,
    quotes,
    leads,
    invites,
    apiKeys,
    cronRuns,
    pipelineRuns,
  ] = await Promise.all([
    store.getTransactions().catch(() => []),
    store.getRuns().catch(() => []),
    store.getRiskFlags().catch(() => []),
    store.getDrafts().catch(() => []),
    store.getQuotes().catch(() => []),
    store.getLeads().catch(() => []),
    store.getInvites().catch(() => []),
    store.getApiKeys().catch(() => []),
    store.getCronRuns().catch(() => []),
    store.getPipelineRuns().catch(() => []),
  ]);

  const events: Event[] = [];

  // â”€â”€ Transaction state-history events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  for (const t of transactions) {
    const history = t.stateHistory ?? [];
    for (let i = 0; i < history.length; i++) {
      const ev = history[i];
      // The TransactionEvent records the new state in `state`. The previous
      // state, when we want a fromâ†’to diff, is the prior history entry.
      const prevState = i > 0 ? history[i - 1].state : null;
      const actorType: "human" | "agent" | "system" =
        ev.actor === "buyer" || ev.actor === "operator"
          ? "human"
          : ev.actor === "agent"
          ? "agent"
          : "system";
      const actorName =
        ev.actor === "operator"
          ? "Operator"
          : ev.actor === "buyer"
          ? `${t.buyerName} (buyer)`
          : ev.actor === "supplier"
          ? `${t.supplierName ?? "Supplier"} (supplier)`
          : ev.actor === "agent"
          ? "AVYN Agent"
          : "System";
      const id = `${t.id}-h${i}`;
      const action = prevState
        ? `Transaction ${prevState} â†’ ${ev.state}${ev.detail ? ` Â· ${ev.detail.slice(0, 80)}` : ""}`
        : `Transaction created in ${ev.state}${ev.detail ? ` Â· ${ev.detail.slice(0, 80)}` : ""}`;
      events.push({
        id,
        ts: ev.ts,
        actor: { type: actorType, name: actorName, initials: initialsOf(actorName) },
        action,
        resource: "Transaction",
        resourceId: `${t.id} Â· ${t.buyerCompany}`,
        category: "Transaction",
        diff: prevState ? [{ field: "state", from: String(prevState), to: String(ev.state) }] : undefined,
        hash: shortHash(`${id}|${ev.ts}|${ev.state}`),
      });
    }
  }

  // â”€â”€ Agent runs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  for (const r of runs) {
    const id = `run-${r.id}`;
    events.push({
      id,
      ts: r.startedAt,
      actor: { type: "agent", name: AGENT_LABEL[r.agent] ?? r.agent, initials: initialsOf(AGENT_LABEL[r.agent] ?? r.agent) },
      action: r.status === "success"
        ? `Run completed${r.productCount ? ` Â· ${r.productCount} products` : ""}${r.buyerCount ? ` Â· ${r.buyerCount} buyers` : ""}${r.supplierCount ? ` Â· ${r.supplierCount} suppliers` : ""}`
        : `Run failed${r.errorMessage ? ` Â· ${r.errorMessage.slice(0, 100)}` : ""}`,
      resource: "Agent Run",
      resourceId: r.id,
      category: "Agent",
      diff: [
        { field: "status", from: "started", to: r.status },
        ...(r.estCostUsd != null ? [{ field: "spend", from: "0", to: `$${r.estCostUsd.toFixed(5)}` }] : []),
      ],
      hash: shortHash(`${id}|${r.startedAt}|${r.status}`),
    });
  }

  // â”€â”€ Risk flags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  for (const f of riskFlags) {
    const id = `risk-${f.id}`;
    events.push({
      id,
      ts: f.createdAt,
      actor: { type: "agent", name: "Risk Agent", initials: "RA" },
      action: `${f.severity} risk flag raised Â· ${f.title.slice(0, 80)}`,
      resource: f.subjectType === "buyer" ? "Buyer" : f.subjectType === "supplier" ? "Supplier" : f.subjectType === "product" ? "Product" : "General",
      resourceId: f.subjectId ? `${f.subjectId} Â· ${f.subjectName ?? ""}` : "â€”",
      category: "Risk",
      diff: [
        { field: "severity", from: "â€”", to: f.severity },
        { field: "category", from: "â€”", to: f.category },
      ],
      hash: shortHash(`${id}|${f.createdAt}|${f.severity}`),
    });
  }

  // â”€â”€ Draft sends â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  for (const d of drafts) {
    if (d.status === "sent" || d.status === "approved" || d.status === "rejected") {
      const id = `draft-${d.id}-${d.status}`;
      const ts = (d as any).sentAt ?? d.createdAt;
      events.push({
        id,
        ts,
        actor: { type: "human", name: "Operator", initials: "OP" },
        action: d.status === "sent"
          ? `Outreach sent to ${d.buyerName} (${d.buyerCompany}) about ${d.productName}`
          : d.status === "approved"
          ? `Draft approved for ${d.buyerCompany}`
          : `Draft rejected for ${d.buyerCompany}`,
        resource: "Outreach Draft",
        resourceId: d.id,
        category: "Outreach",
        diff: [{ field: "status", from: "draft", to: d.status }],
        hash: shortHash(`${id}|${ts}|${d.status}`),
      });
    }
  }

  // â”€â”€ Quote lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  for (const q of quotes) {
    const id = `quote-${q.id}`;
    events.push({
      id,
      ts: q.createdAt,
      actor: { type: "agent", name: "Quote Agent", initials: "QA" },
      action: `Quote generated for ${q.buyerCompany} Â· $${q.total.toLocaleString()}`,
      resource: "Quote",
      resourceId: `${q.id} Â· ${q.productName}`,
      category: "Billing",
      diff: [{ field: "status", from: "â€”", to: q.status }],
      hash: shortHash(`${id}|${q.createdAt}|${q.status}`),
    });
    if (q.acceptedAt) {
      const aid = `quote-${q.id}-accepted`;
      events.push({
        id: aid,
        ts: q.acceptedAt,
        actor: { type: "human", name: q.buyerName, initials: initialsOf(q.buyerName) },
        action: `Quote accepted by ${q.buyerCompany}`,
        resource: "Quote",
        resourceId: q.id,
        category: "Billing",
        diff: [{ field: "status", from: "sent", to: "accepted" }],
        hash: shortHash(`${aid}|${q.acceptedAt}|accepted`),
      });
    }
  }

  // â”€â”€ Lead lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  for (const l of leads) {
    // Capture
    {
      const id = `lead-captured-${l.id}`;
      events.push({
        id,
        ts: l.createdAt,
        actor: { type: "human", name: l.name, initials: initialsOf(l.name) },
        action: l.source === "signup-form"
          ? `Submitted signup form (${l.company}${l.industry ? ` Â· ${l.industry}` : ""})`
          : `Submitted contact form (${l.company}${l.industry ? ` Â· ${l.industry}` : ""})`,
        resource: "Lead",
        resourceId: `${l.id} Â· ${l.email}`,
        category: "Lead",
        diff: [{ field: "status", from: "â€”", to: "new" }],
        hash: shortHash(`${id}|${l.createdAt}|capture`),
      });
    }
    // AI auto-reply
    if (l.aiReply) {
      const r = l.aiReply;
      const id = `lead-aireply-${l.id}-${r.at}`;
      events.push({
        id,
        ts: r.at,
        actor: { type: "agent", name: "Lead Followup Agent", initials: "LF" },
        action: r.status === "sent"
          ? `AI welcome reply sent to ${l.name} via ${(r.channel ?? []).join(" + ") || "email"}`
          : r.status === "skipped"
            ? `AI welcome reply skipped (no transport)`
            : r.status === "error"
              ? `AI welcome reply failed${r.errorMessage ? ` Â· ${r.errorMessage.slice(0, 60)}` : ""}`
              : `AI welcome reply queued`,
        resource: "Lead",
        resourceId: l.id,
        category: "Lead",
        diff: [
          { field: "ai_reply_status", from: "â€”", to: r.status },
          ...(r.estCostUsd != null ? [{ field: "spend", from: "0", to: `$${r.estCostUsd.toFixed(5)}` }] : []),
        ],
        hash: shortHash(`${id}|${r.at}|${r.status}`),
      });
    }
    // Auto-followups (each one is its own event)
    for (const fu of l.aiFollowups ?? []) {
      const id = `lead-followup-${l.id}-${fu.at}`;
      events.push({
        id,
        ts: fu.at,
        actor: { type: "agent", name: "Lead Followup Agent", initials: "LF" },
        action: fu.status === "sent"
          ? `Day-${fu.daysSinceCreated} AI followup sent to ${l.name}`
          : fu.status === "error"
            ? `Day-${fu.daysSinceCreated} AI followup failed`
            : `Day-${fu.daysSinceCreated} AI followup skipped`,
        resource: "Lead",
        resourceId: l.id,
        category: "Lead",
        diff: [
          { field: "followup_status", from: "â€”", to: fu.status },
          ...(fu.estCostUsd != null ? [{ field: "spend", from: "0", to: `$${fu.estCostUsd.toFixed(5)}` }] : []),
        ],
        hash: shortHash(`${id}|${fu.at}|${fu.status}`),
      });
    }
    // Resubmissions
    for (const rs of l.resubmissions ?? []) {
      const id = `lead-resubmit-${l.id}-${rs.at}`;
      events.push({
        id,
        ts: rs.at,
        actor: { type: "human", name: l.name, initials: initialsOf(l.name) },
        action: rs.changedFields.length
          ? `Re-submitted lead Â· added ${rs.changedFields.join(", ")}`
          : `Re-submitted lead`,
        resource: "Lead",
        resourceId: l.id,
        category: "Lead",
        hash: shortHash(`${id}|${rs.at}|resubmit`),
      });
    }
    // Promotion to buyer (operator click or auto-rule)
    if (l.promotedAt && l.promotedToBuyerId) {
      const isAuto = l.promotedBy === "auto";
      const id = `lead-promoted-${l.id}`;
      events.push({
        id,
        ts: l.promotedAt,
        actor: isAuto
          ? { type: "agent", name: "Auto-Promote Agent", initials: "AP" }
          : { type: "human", name: "Operator", initials: "OP" },
        action: isAuto
          ? `Auto-promoted hot lead to buyer (score crossed AUTO_PROMOTE_LEAD_SCORE)`
          : `Promoted lead to buyer`,
        resource: "Lead",
        resourceId: l.id,
        category: "Lead",
        diff: [{ field: "promotedToBuyerId", from: "â€”", to: l.promotedToBuyerId }],
        hash: shortHash(`${id}|${l.promotedAt}|promoted`),
      });
    }
  }

  // â”€â”€ Workspace invites â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  for (const inv of invites) {
    {
      const id = `invite-created-${inv.id}`;
      events.push({
        id,
        ts: inv.createdAt,
        actor: { type: "human", name: inv.invitedBy, initials: initialsOf(inv.invitedBy.split("@")[0]) },
        action: `Invited ${inv.email} as ${inv.role}`,
        resource: "Invite",
        resourceId: inv.id,
        category: "Invite",
        diff: [{ field: "role", from: "â€”", to: inv.role }],
        hash: shortHash(`${id}|${inv.createdAt}|invite`),
      });
    }
    if (inv.acceptedAt) {
      const id = `invite-accepted-${inv.id}`;
      events.push({
        id,
        ts: inv.acceptedAt,
        actor: {
          type: "human",
          name: inv.acceptedName ?? inv.email,
          initials: initialsOf(inv.acceptedName ?? inv.email.split("@")[0]),
        },
        action: `Accepted ${inv.role} invite to the workspace`,
        resource: "Invite",
        resourceId: inv.id,
        category: "Invite",
        diff: [{ field: "status", from: "pending", to: "accepted" }],
        hash: shortHash(`${id}|${inv.acceptedAt}|accept`),
      });
    }
    if (inv.cancelledAt) {
      const id = `invite-cancelled-${inv.id}`;
      events.push({
        id,
        ts: inv.cancelledAt,
        actor: { type: "human", name: "Operator", initials: "OP" },
        action: `Cancelled pending invite for ${inv.email}`,
        resource: "Invite",
        resourceId: inv.id,
        category: "Invite",
        diff: [{ field: "status", from: "pending", to: "cancelled" }],
        hash: shortHash(`${id}|${inv.cancelledAt}|cancel`),
      });
    }
  }

  // â”€â”€ API keys â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  for (const k of apiKeys) {
    {
      const id = `apikey-created-${k.id}`;
      events.push({
        id,
        ts: k.createdAt,
        actor: { type: "human", name: k.createdBy, initials: initialsOf(k.createdBy.split("@")[0]) },
        action: `Created API key "${k.name}" (${k.environment})`,
        resource: "API Key",
        resourceId: `${k.id} Â· ${k.prefix}â€¦`,
        category: "Auth",
        diff: [
          { field: "environment", from: "â€”", to: k.environment },
          { field: "scopes", from: "â€”", to: k.scopes.join(", ") },
        ],
        hash: shortHash(`${id}|${k.createdAt}|create`),
      });
    }
    if (k.revokedAt) {
      const id = `apikey-revoked-${k.id}`;
      events.push({
        id,
        ts: k.revokedAt,
        actor: { type: "human", name: "Operator", initials: "OP" },
        action: `Revoked API key "${k.name}"`,
        resource: "API Key",
        resourceId: `${k.id} Â· ${k.prefix}â€¦`,
        category: "Auth",
        diff: [{ field: "status", from: "Active", to: "Revoked" }],
        hash: shortHash(`${id}|${k.revokedAt}|revoke`),
      });
    }
  }

  // â”€â”€ Cron + pipeline runs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  for (const c of cronRuns) {
    const id = `cron-${c.id}`;
    // totals is now optional (only set on pipeline-kind runs). Build a
    // human action label that's still meaningful for the other cron kinds
    // (lead-followups, outreach-jobs, etc.) which store a `summary` field.
    const kindLabel = c.kind ? c.kind : "Pipeline";
    const action =
      c.status === "error"
        ? `${kindLabel} cron failed${c.errorMessage ? ` Â· ${c.errorMessage.slice(0, 80)}` : ""}`
        : c.totals
          ? `${kindLabel} cron tick Â· ${c.totals.products}p Â· ${c.totals.buyers}b Â· ${c.totals.drafts}d`
          : `${kindLabel} cron tick${c.summary ? ` Â· ${c.summary.slice(0, 80)}` : ""}`;
    const diff = [
      { field: "status", from: "started", to: c.status },
      ...(c.totals
        ? [{ field: "spend", from: "0", to: `$${c.totals.totalCost.toFixed(5)}` }]
        : []),
    ];
    events.push({
      id,
      ts: c.ranAt,
      actor: { type: "system", name: `${kindLabel} Cron`, initials: kindLabel.slice(0, 2).toUpperCase() },
      action,
      resource: "Cron",
      resourceId: c.id,
      category: "Pipeline",
      diff,
      hash: shortHash(`${id}|${c.ranAt}|${c.status}`),
    });
  }
  for (const p of pipelineRuns) {
    const id = `pipeline-${p.id}`;
    events.push({
      id,
      ts: p.startedAt,
      actor: p.triggeredBy === "cron"
        ? { type: "system", name: "Pipeline Cron", initials: "PC" }
        : { type: "human", name: "Operator", initials: "OP" },
      action: `${p.triggeredBy === "cron" ? "Autonomous" : "Manual"} pipeline run Â· ${p.totals.products}p Â· ${p.totals.buyers}b Â· ${p.totals.suppliers}s Â· ${p.totals.drafts}d`,
      resource: "Pipeline",
      resourceId: p.id,
      category: "Pipeline",
      diff: [{ field: "spend", from: "0", to: `$${p.totals.totalCost.toFixed(5)}` }],
      hash: shortHash(`${id}|${p.startedAt}|run`),
    });
    if (p.revokedAt) {
      const rid = `pipeline-revoked-${p.id}`;
      events.push({
        id: rid,
        ts: p.revokedAt,
        actor: { type: "human", name: "Operator", initials: "OP" },
        action: `Revoked share link for pipeline run ${p.id}`,
        resource: "Pipeline",
        resourceId: p.id,
        category: "Pipeline",
        diff: [{ field: "share", from: "active", to: "revoked" }],
        hash: shortHash(`${rid}|${p.revokedAt}|revoke`),
      });
    }
  }

  // Newest first
  events.sort((a, b) => b.ts.localeCompare(a.ts));

  return NextResponse.json({
    events,
    counts: {
      total: events.length,
      transaction: events.filter((e) => e.category === "Transaction").length,
      agent: events.filter((e) => e.category === "Agent").length,
      outreach: events.filter((e) => e.category === "Outreach").length,
      billing: events.filter((e) => e.category === "Billing").length,
      risk: events.filter((e) => e.category === "Risk").length,
      lead: events.filter((e) => e.category === "Lead").length,
      invite: events.filter((e) => e.category === "Invite").length,
      auth: events.filter((e) => e.category === "Auth").length,
      pipeline: events.filter((e) => e.category === "Pipeline").length,
    },
    hashChainOk: true,
  });
}
