import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_LABELS: Record<string, string> = {
  "trend-hunter": "Trend Hunter",
  "buyer-discovery": "Buyer Discovery",
  "supplier-finder": "Supplier Finder",
  outreach: "Outreach Agent",
  negotiation: "Negotiation Agent",
  risk: "Risk Agent",
};

const AGENT_COLORS: Record<string, string> = {
  "trend-hunter": "#a78bfa",
  "buyer-discovery": "#f59e0b",
  "supplier-finder": "#22d3ee",
  outreach: "#22c55e",
  negotiation: "#f472b6",
  risk: "#ef4444",
};

function fmtAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export async function GET() {
  try {
    const [runs, drafts, buyers, signals, quotes] = await Promise.all([
      store.getRuns(),
      store.getDrafts(),
      store.getDiscoveredBuyers(),
      store.getSignals(),
      store.getQuotes(),
    ]);

    // ── Stat 1: New opportunities (trend signals found) ────────────────────
    const signalCount = signals?.totalSignals ?? 0;

    // ── Stat 2: Buyers replied (drafts with at least one buyer reply) ───────
    const repliedCount = drafts.filter(
      (d) => d.thread?.some((m) => m.role === "buyer")
    ).length;

    // ── Stat 3: Quotes accepted ────────────────────────────────────────────
    const acceptedQuotes = quotes.filter((q) => q.status === "accepted");
    const acceptedCount = acceptedQuotes.length;

    // ── Stat 4: New pipeline value (sent + accepted quotes) ────────────────
    const pipelineValue = quotes
      .filter((q) => q.status === "sent" || q.status === "accepted")
      .reduce((sum, q) => sum + q.total, 0);
    const pipelineFmt =
      pipelineValue >= 1_000_000
        ? `$${(pipelineValue / 1_000_000).toFixed(1)}M`
        : pipelineValue >= 1_000
        ? `$${Math.round(pipelineValue / 1_000)}K`
        : `$${pipelineValue}`;

    // ── Activity feed: 4 most recent successful agent runs ─────────────────
    const recent = [...runs]
      .filter((r) => r.status === "success")
      .sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime())
      .slice(0, 4);

    const activity = recent.map((r) => {
      const label = AGENT_LABELS[r.agent] ?? r.agent;
      let msg = "";
      if (r.agent === "trend-hunter") {
        msg = `Scanned ${r.productCount} trending product${r.productCount !== 1 ? "s" : ""}${r.inputCategory ? ` in ${r.inputCategory}` : ""}`;
      } else if (r.agent === "buyer-discovery") {
        msg = `Added ${r.buyerCount ?? r.productCount} new qualified prospect${(r.buyerCount ?? r.productCount) !== 1 ? "s" : ""}`;
      } else if (r.agent === "supplier-finder") {
        msg = `Found ${r.supplierCount ?? r.productCount} supplier${(r.supplierCount ?? r.productCount) !== 1 ? "s" : ""}`;
      } else if (r.agent === "outreach") {
        const sent = drafts.filter((d) => d.runId === r.id && d.status === "sent").length;
        msg = sent > 0 ? `Sent ${sent} personalized outreach email${sent !== 1 ? "s" : ""}` : `Generated ${r.productCount} outreach draft${r.productCount !== 1 ? "s" : ""}`;
      } else if (r.agent === "negotiation") {
        msg = `Processed ${r.productCount} negotiation${r.productCount !== 1 ? "s" : ""}`;
      } else if (r.agent === "risk") {
        msg = `Completed risk scan`;
      } else {
        msg = `Completed run`;
      }
      return {
        agent: label,
        msg,
        ago: fmtAgo(r.finishedAt),
        color: AGENT_COLORS[r.agent] ?? "#a78bfa",
      };
    });

    // Latest run per agent for the "ago" labels on stat cards
    const latestByAgent = (agentKey: string) => {
      const r = [...runs]
        .filter((r) => r.agent === agentKey && r.status === "success")
        .sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime())[0];
      return r ? fmtAgo(r.finishedAt) : null;
    };

    const trendAgo = latestByAgent("trend-hunter");
    const outreachAgo = latestByAgent("outreach");

    const whileAway = [
      {
        v: String(signalCount || buyers.length),
        l: "New opportunities",
        d: `Trend Hunter${trendAgo ? ` · ${trendAgo} ago` : ""}`,
      },
      {
        v: String(repliedCount),
        l: "Buyers replied",
        d: `Outreach Agent${outreachAgo ? ` · ${outreachAgo} ago` : ""}`,
      },
      {
        v: String(acceptedCount),
        l: "Quotes accepted",
        d: "Negotiation Agent · today",
      },
      {
        v: pipelineFmt || "$0",
        l: "New pipeline",
        d: "Negotiation Agent · today",
      },
    ];

    return NextResponse.json({ whileAway, activity });
  } catch (err) {
    console.error("[signin-summary]", err);
    // Return null so client falls back to static placeholders
    return NextResponse.json({ whileAway: null, activity: null });
  }
}
