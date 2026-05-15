import { NextRequest, NextResponse } from "next/server";
import { runOutreach } from "@/lib/agents/outreach";
import { checkKillSwitch } from "@/lib/killSwitch";
import { gateAgentAccess } from "@/lib/teamPrefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const recent: number[] = [];

export async function POST(req: NextRequest) {
  // Slice 21: per-teammate agent allowlist (team-prefs). Owner +
  // teammates without onboarding-completed bypass automatically.
  const blocked = await gateAgentAccess(req, "outreach");
  if (blocked) return blocked;

  // Server-authoritative kill switch -- when active, every agent path
  // skips. Returns 503 so the client can show "agents paused" feedback.
  const ks = await checkKillSwitch();
  if (ks.killed) {
    return NextResponse.json(
      { error: `Agents paused: ${ks.state.reason ?? "kill switch active"}. Resume at /admin.` },
      { status: 503 },
    );
  }

  const now = Date.now();
  while (recent.length && now - recent[0] > RATE_WINDOW_MS) recent.shift();
  if (recent.length >= RATE_LIMIT) {
    return NextResponse.json(
      { error: "Rate limit exceeded — try again in a minute." },
      { status: 429 }
    );
  }
  recent.push(now);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const required = [
    "buyerId",
    "buyerCompany",
    "buyerName",
    "buyerTitle",
    "buyerIndustry",
    "buyerType",
    "buyerLocation",
    "productName",
    "productCategory",
  ];
  for (const k of required) {
    if (!body[k]) {
      return NextResponse.json({ error: `Missing field: ${k}` }, { status: 400 });
    }
  }

  try {
    const { run, draft } = await runOutreach({
      buyerId: body.buyerId,
      buyerCompany: body.buyerCompany,
      buyerName: body.buyerName,
      buyerTitle: body.buyerTitle,
      buyerIndustry: body.buyerIndustry,
      buyerType: body.buyerType,
      buyerLocation: body.buyerLocation,
      buyerRationale: body.buyerRationale,
      productName: body.productName,
      productCategory: body.productCategory,
      productNiche: body.productNiche || body.productCategory,
      productRationale: body.productRationale,
    });
    return NextResponse.json({ run, draft });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Agent run failed" },
      { status: 500 }
    );
  }
}
