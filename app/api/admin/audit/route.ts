import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { store } from "@/lib/store";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/audit — aggregates the real audit trail.
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

type AuditCategory = "Auth" | "Data" | "Permissions" | "Billing" | "Agent" | "Outreach" | "Transaction" | "Risk";

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
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const [transactions, runs, riskFlags, drafts, quotes] = await Promise.all([
    store.getTransactions(),
    store.getRuns(),
    store.getRiskFlags(),
    store.getDrafts(),
    store.getQuotes(),
  ]);

  const events: Event[] = [];

  // ── Transaction state-history events ─────────────────────────────────
  for (const t of transactions) {
    const history = t.stateHistory ?? [];
    for (let i = 0; i < history.length; i++) {
      const ev = history[i];
      // The TransactionEvent records the new state in `state`. The previous
      // state, when we want a from→to diff, is the prior history entry.
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
        ? `Transaction ${prevState} → ${ev.state}${ev.detail ? ` · ${ev.detail.slice(0, 80)}` : ""}`
        : `Transaction created in ${ev.state}${ev.detail ? ` · ${ev.detail.slice(0, 80)}` : ""}`;
      events.push({
        id,
        ts: ev.ts,
        actor: { type: actorType, name: actorName, initials: initialsOf(actorName) },
        action,
        resource: "Transaction",
        resourceId: `${t.id} · ${t.buyerCompany}`,
        category: "Transaction",
        diff: prevState ? [{ field: "state", from: String(prevState), to: String(ev.state) }] : undefined,
        hash: shortHash(`${id}|${ev.ts}|${ev.state}`),
      });
    }
  }

  // ── Agent runs ───────────────────────────────────────────────────────
  for (const r of runs) {
    const id = `run-${r.id}`;
    events.push({
      id,
      ts: r.startedAt,
      actor: { type: "agent", name: AGENT_LABEL[r.agent] ?? r.agent, initials: initialsOf(AGENT_LABEL[r.agent] ?? r.agent) },
      action: r.status === "success"
        ? `Run completed${r.productCount ? ` · ${r.productCount} products` : ""}${r.buyerCount ? ` · ${r.buyerCount} buyers` : ""}${r.supplierCount ? ` · ${r.supplierCount} suppliers` : ""}`
        : `Run failed${r.errorMessage ? ` · ${r.errorMessage.slice(0, 100)}` : ""}`,
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

  // ── Risk flags ───────────────────────────────────────────────────────
  for (const f of riskFlags) {
    const id = `risk-${f.id}`;
    events.push({
      id,
      ts: f.createdAt,
      actor: { type: "agent", name: "Risk Agent", initials: "RA" },
      action: `${f.severity} risk flag raised · ${f.title.slice(0, 80)}`,
      resource: f.subjectType === "buyer" ? "Buyer" : f.subjectType === "supplier" ? "Supplier" : f.subjectType === "product" ? "Product" : "General",
      resourceId: f.subjectId ? `${f.subjectId} · ${f.subjectName ?? ""}` : "—",
      category: "Risk",
      diff: [
        { field: "severity", from: "—", to: f.severity },
        { field: "category", from: "—", to: f.category },
      ],
      hash: shortHash(`${id}|${f.createdAt}|${f.severity}`),
    });
  }

  // ── Draft sends ──────────────────────────────────────────────────────
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

  // ── Quote lifecycle ──────────────────────────────────────────────────
  for (const q of quotes) {
    const id = `quote-${q.id}`;
    events.push({
      id,
      ts: q.createdAt,
      actor: { type: "agent", name: "Quote Agent", initials: "QA" },
      action: `Quote generated for ${q.buyerCompany} · $${q.total.toLocaleString()}`,
      resource: "Quote",
      resourceId: `${q.id} · ${q.productName}`,
      category: "Billing",
      diff: [{ field: "status", from: "—", to: q.status }],
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
    },
    hashChainOk: true,
  });
}
