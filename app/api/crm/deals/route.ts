import { NextRequest, NextResponse } from "next/server";
import { store, type OutreachDraft } from "@/lib/store";
import type { Deal, DealStage } from "@/lib/deals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deriveStage(d: OutreachDraft): DealStage {
  if (d.dealStage) return d.dealStage;
  if (d.status === "rejected") return "Closed Lost";
  if (d.status === "draft") return "Prospecting";
  if (d.status === "approved") return "Prospecting";
  if (d.status === "sent") {
    const buyerReplied = (d.thread ?? []).some((m) => m.role === "buyer");
    return buyerReplied ? "Negotiation" : "Contacted";
  }
  return "Prospecting";
}

function probability(stage: DealStage): number {
  switch (stage) {
    case "Prospecting": return 10;
    case "Contacted": return 25;
    case "Negotiation": return 55;
    case "Quotation": return 75;
    case "Closed Won": return 100;
    case "Closed Lost": return 0;
  }
}

function relTouch(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function initials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export async function GET() {
  const drafts = await store.getDrafts();
  // Drop follow-ups — they show up under their parent's "deal" not as separate ones.
  const root = drafts.filter((d) => !d.parentDraftId);
  const live: Deal[] = root.map((d) => {
    const stage = deriveStage(d);
    const lastThreadAt = (d.thread ?? []).at(-1)?.at;
    const lastTouch = lastThreadAt ?? d.sentAt ?? d.createdAt;
    return {
      id: `live_${d.id}`,
      company: d.buyerCompany,
      product: d.productName,
      // Default value heuristic: $5K placeholder × probability when no quote yet
      value: d.dealValue ?? Math.round(5000 * (probability(stage) / 100) + 1000),
      units: d.dealUnits ?? 500,
      stage,
      owner: "Outreach Agent",
      ownerInitials: "AI",
      closeDate: "—",
      probability: probability(stage),
      lastTouch: relTouch(lastTouch),
      source: "Outreach Agent",
      // Carry the underlying draft id for stage updates
      draftId: d.id,
    } as Deal & { draftId: string };
  });

  return NextResponse.json({ deals: live });
}

export async function PATCH(req: NextRequest) {
  let body: { draftId?: string; stage?: DealStage; value?: number; units?: number } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.draftId) {
    return NextResponse.json({ error: "Missing draftId" }, { status: 400 });
  }
  const allowed: DealStage[] = [
    "Prospecting",
    "Contacted",
    "Negotiation",
    "Quotation",
    "Closed Won",
    "Closed Lost",
  ];
  if (body.stage && !allowed.includes(body.stage)) {
    return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (body.stage) patch.dealStage = body.stage;
  if (typeof body.value === "number" && body.value >= 0) patch.dealValue = body.value;
  if (typeof body.units === "number" && body.units >= 0) patch.dealUnits = body.units;
  const updated = await store.patchDraft(body.draftId, patch);
  if (!updated) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  return NextResponse.json({ ok: true, draft: updated });
}
