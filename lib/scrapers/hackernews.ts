export type HNSignal = {
  source: "hackernews";
  title: string;
  score: number;
  numComments: number;
  url: string;
  hnUrl: string;
  createdAt: string;
  author: string;
};

const TIMEOUT_MS = 6000;

async function withTimeout<T>(p: Promise<T>): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await p;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJSON<T>(url: string): Promise<T | null> {
  return withTimeout(
    (async () => {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as T;
    })()
  );
}

export async function fetchHNSignals(): Promise<{
  signals: HNSignal[];
  totalScanned: number;
  errors: number;
}> {
  const ids = await fetchJSON<number[]>("https://hacker-news.firebaseio.com/v0/topstories.json");
  if (!ids) return { signals: [], totalScanned: 0, errors: 1 };

  // Pull top 30 to find Show HN / Launch HN posts
  const top = ids.slice(0, 30);
  let errors = 0;
  const items = await Promise.all(
    top.map(async (id) => {
      const s = await fetchJSON<{
        id: number;
        title: string;
        score: number;
        descendants?: number;
        url?: string;
        by?: string;
        time?: number;
      }>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      if (!s) {
        errors++;
        return null;
      }
      return s;
    })
  );

  const signals: HNSignal[] = items
    .filter((s): s is NonNullable<typeof s> => !!s && !!s.title)
    .filter((s) => /(?:^show hn:|^launch hn:|introducing|launched)/i.test(s.title))
    .map<HNSignal>((s) => ({
      source: "hackernews",
      title: s.title,
      score: s.score || 0,
      numComments: s.descendants || 0,
      url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
      hnUrl: `https://news.ycombinator.com/item?id=${s.id}`,
      createdAt: new Date((s.time || 0) * 1000).toISOString(),
      author: s.by || "unknown",
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  return { signals, totalScanned: top.length, errors };
}
