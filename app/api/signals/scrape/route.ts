import { NextResponse } from "next/server";
import { scrapeAllSources } from "@/lib/scrapers";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const recent: number[] = [];

export async function POST() {
  const now = Date.now();
  while (recent.length && now - recent[0] > RATE_WINDOW_MS) recent.shift();
  if (recent.length >= RATE_LIMIT) {
    return NextResponse.json(
      { error: "Rate limit exceeded — try again in a minute." },
      { status: 429 }
    );
  }
  recent.push(now);

  try {
    const result = await scrapeAllSources();
    store.saveSignals(result);
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Scrape failed" },
      { status: 500 }
    );
  }
}
