import { NextRequest, NextResponse } from "next/server";
import { runTrendHunter } from "@/lib/agents/trendHunter";
import { checkKillSwitch } from "@/lib/killSwitch";
import { gateAgentAccess } from "@/lib/teamPrefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Simple in-memory rate limit: max 10 runs / minute per process.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const recentRuns: number[] = [];

export async function POST(req: NextRequest) {
  const blocked = await gateAgentAccess(req, "trend-hunter");
  if (blocked) return blocked;

  const ks = await checkKillSwitch();
  if (ks.killed) {
    return NextResponse.json(
      { error: `Agents paused: ${ks.state.reason ?? "kill switch active"}. Resume at /admin.` },
      { status: 503 },
    );
  }

  const now = Date.now();
  while (recentRuns.length && now - recentRuns[0] > RATE_WINDOW_MS) recentRuns.shift();
  if (recentRuns.length >= RATE_LIMIT) {
    return NextResponse.json(
      { error: "Rate limit exceeded — try again in a minute." },
      { status: 429 }
    );
  }
  recentRuns.push(now);

  let body: { category?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }
  const category =
    typeof body.category === "string" && body.category.trim() ? body.category.trim() : null;

  try {
    const run = await runTrendHunter(category);
    return NextResponse.json({ run });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Agent run failed" },
      { status: 500 }
    );
  }
}
