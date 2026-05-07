export type RedditSignal = {
  source: "reddit";
  title: string;
  subreddit: string;
  score: number;
  numComments: number;
  permalink: string;
  url: string;
  createdAt: string;
  author: string;
};

const SUBREDDITS = [
  "INEEEEDIT",
  "shutupandtakemymoney",
  "BuyItForLife",
  "ProductPorn",
  "Dropshipping",
  "ecommerce",
];

const UA = "Mozilla/5.0 (compatible; AICommerceOS-TrendHunter/1.0)";
const TIMEOUT_MS = 6000;

async function fetchSubreddit(sub: string, limit = 12): Promise<RedditSignal[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://www.reddit.com/r/${sub}/hot.json?limit=${limit}`,
      { signal: ctrl.signal, headers: { "User-Agent": UA }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: { children?: Array<{ data: any }> };
    };
    const children = data.data?.children ?? [];
    return children
      .map((c) => c.data)
      .filter((d) => d && !d.stickied && d.title)
      .map<RedditSignal>((d) => ({
        source: "reddit",
        title: String(d.title),
        subreddit: String(d.subreddit),
        score: Number(d.score) || 0,
        numComments: Number(d.num_comments) || 0,
        permalink: `https://www.reddit.com${d.permalink}`,
        url: String(d.url || d.url_overridden_by_dest || ""),
        createdAt: new Date((Number(d.created_utc) || 0) * 1000).toISOString(),
        author: String(d.author ?? "unknown"),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRedditSignals(): Promise<{
  signals: RedditSignal[];
  subsHit: number;
  subsTotal: number;
  errors: number;
}> {
  const results = await Promise.allSettled(SUBREDDITS.map((s) => fetchSubreddit(s)));
  const signals: RedditSignal[] = [];
  let subsHit = 0;
  let errors = 0;
  for (const r of results) {
    if (r.status === "fulfilled") {
      if (r.value.length) subsHit++;
      signals.push(...r.value);
    } else {
      errors++;
    }
  }
  // Sort by score across all subs
  signals.sort((a, b) => b.score - a.score);
  return {
    signals: signals.slice(0, 30),
    subsHit,
    subsTotal: SUBREDDITS.length,
    errors,
  };
}
