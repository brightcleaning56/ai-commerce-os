import { fetchHNSignals, type HNSignal } from "./hackernews";
import { fetchRedditSignals, type RedditSignal } from "./reddit";

export type Signal = RedditSignal | HNSignal;

export type ScrapeResult = {
  scrapedAt: string;
  durationMs: number;
  reddit: {
    signals: RedditSignal[];
    subsHit: number;
    subsTotal: number;
    errors: number;
  };
  hn: { signals: HNSignal[]; totalScanned: number; errors: number };
  totalSignals: number;
};

export async function scrapeAllSources(): Promise<ScrapeResult> {
  const start = Date.now();
  const [reddit, hn] = await Promise.all([fetchRedditSignals(), fetchHNSignals()]);
  return {
    scrapedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    reddit,
    hn,
    totalSignals: reddit.signals.length + hn.signals.length,
  };
}
