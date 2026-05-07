import { estimateCost, getAnthropicClient, MODEL_CHEAP } from "@/lib/anthropic";
import { scrapeAllSources, type ScrapeResult } from "@/lib/scrapers";
import { store, type AgentRun, type DiscoveredProduct } from "@/lib/store";

const PRODUCT_TOOL = {
  name: "report_trending_products",
  description:
    "Report a list of 4-6 products that are currently trending hard enough to be worth sourcing. Each product must include all listed fields.",
  input_schema: {
    type: "object" as const,
    properties: {
      products: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Product name as it would appear on a Shopify listing." },
            category: {
              type: "string",
              enum: [
                "Home & Kitchen",
                "Pet Supplies",
                "Beauty & Personal Care",
                "Sports & Outdoors",
                "Electronics",
                "Home Decor",
                "Baby",
                "Auto",
                "Office",
                "Toys & Games",
              ],
            },
            niche: { type: "string", description: "More specific niche, e.g. 'Cat Care', 'Hydration', 'Eco Storage'" },
            emoji: { type: "string", description: "A single emoji representing the product." },
            demandScore: { type: "integer", minimum: 50, maximum: 100 },
            costLow: { type: "number", description: "Plausible wholesale unit cost in USD." },
            retailPrice: { type: "number", description: "Plausible direct-to-consumer retail price in USD." },
            competition: { type: "string", enum: ["Low", "Medium", "High"] },
            potential: { type: "string", enum: ["Very High", "High", "Medium", "Low"] },
            trendVelocityPct: { type: "integer", minimum: 30, maximum: 500, description: "Estimated % growth over the last 14 days." },
            sources: {
              type: "array",
              items: { type: "string", enum: ["TikTok", "Instagram", "Reddit", "Amazon", "Etsy", "YouTube Shorts", "Google Trends", "Alibaba", "Facebook Ads"] },
              description: "Up to 4 platforms where this signal was strongest.",
            },
            hashtags: { type: "array", items: { type: "string" }, description: "3-5 relevant hashtags incl. the # prefix." },
            rationale: { type: "string", description: "1-2 sentence explanation of why this is trending RIGHT NOW (citing concrete signals)." },
          },
          required: [
            "name",
            "category",
            "niche",
            "emoji",
            "demandScore",
            "costLow",
            "retailPrice",
            "competition",
            "potential",
            "trendVelocityPct",
            "sources",
            "hashtags",
            "rationale",
          ],
        },
      },
    },
    required: ["products"],
  },
};

function formatSignals(scrape: ScrapeResult | null): string {
  if (!scrape || scrape.totalSignals === 0) return "";
  const parts: string[] = [];
  if (scrape.reddit.signals.length) {
    const reddit = scrape.reddit.signals
      .slice(0, 18)
      .map((s) => `  - [r/${s.subreddit}, ${s.score} upvotes, ${s.numComments} comments] ${s.title}`)
      .join("\n");
    parts.push(`### Reddit (${scrape.reddit.subsHit}/${scrape.reddit.subsTotal} subs hit)\n${reddit}`);
  }
  if (scrape.hn.signals.length) {
    const hn = scrape.hn.signals
      .slice(0, 8)
      .map((s) => `  - [HN, ${s.score} pts, ${s.numComments} comments] ${s.title}`)
      .join("\n");
    parts.push(`### Hacker News launches\n${hn}`);
  }
  return `\n\n## Live signals (scraped just now)\n\nThese are the actual posts trending RIGHT NOW. Ground your product picks in these — quote specific titles or themes when relevant.\n\n${parts.join("\n\n")}`;
}

function buildPrompt(category: string | null, scrape: ScrapeResult | null) {
  const focus = category
    ? `Focus on the ${category} category specifically.`
    : `Mix across categories — surface 4-6 products that are clearly hot RIGHT NOW.`;
  const signalsBlock = formatSignals(scrape);
  return `You are the Trend Hunter Agent in an AI commerce operating system. Your job is to surface products that are trending hard enough that a buyer should consider sourcing them this week.

${focus}

For each product, infer a plausible demand score (50-100), the platforms where the signal would be strongest, hashtags, and a SHORT rationale grounded in CONCRETE signals. When live signals are provided below, your rationale MUST cite at least one specific signal (e.g. "Reddit r/INEEEEDIT thread with 8.4K upvotes about X" or "Show HN launch for Y at 312 pts"). Avoid vague phrases like "going viral".

The wholesale cost (costLow) and retail price should be realistic — a 2.5-4× markup is typical at wholesale-to-retail. Use Low/Medium/High for competition and the corresponding potential. Avoid duplicating SKUs that are already widely-flooded markets (basic LED strip lights, generic phone cases) unless there's a unique angle.${signalsBlock}

Call the report_trending_products tool with your findings.`;
}

type AgentToolPayload = {
  products: Array<{
    name: string;
    category: string;
    niche: string;
    emoji: string;
    demandScore: number;
    costLow: number;
    retailPrice: number;
    competition: "Low" | "Medium" | "High";
    potential: "Very High" | "High" | "Medium" | "Low";
    trendVelocityPct: number;
    sources: string[];
    hashtags: string[];
    rationale: string;
  }>;
};

function fakeResults(category: string | null): AgentToolPayload {
  const ideas = [
    { name: "Magnetic Phone Charger", category: "Electronics", niche: "Phone Accessories", emoji: "📱", demandScore: 88, costLow: 3.2, retailPrice: 24.99, competition: "Medium", potential: "High", trendVelocityPct: 180, sources: ["TikTok", "Amazon"], hashtags: ["#magsafe", "#phoneaccessories", "#tiktokmademebuyit"], rationale: "Apple's MagSafe accessory ecosystem widening; third-party chargers seeing 5-7x review velocity vs Q1." },
    { name: "Heated Eye Mask USB", category: "Beauty & Personal Care", niche: "Sleep", emoji: "😴", demandScore: 84, costLow: 4.1, retailPrice: 29.99, competition: "Low", potential: "High", trendVelocityPct: 215, sources: ["Reels", "Reddit"], hashtags: ["#sleeptok", "#wellness", "#selfcare"], rationale: "Sleep wellness segment breakout — 6 mid-tier influencers picked up SKUs in 30 days." },
    { name: "Smart Plant Sensor", category: "Home Decor", niche: "Garden Tech", emoji: "🌱", demandScore: 79, costLow: 6.8, retailPrice: 32.0, competition: "Low", potential: "High", trendVelocityPct: 145, sources: ["Pinterest", "Etsy", "Google Trends"], hashtags: ["#planttok", "#smartgarden", "#indoorjungle"], rationale: "Indoor-gardening searches up 8 weeks straight; Pinterest saves for plant tech +230%." },
    { name: "Pet Grooming Vacuum", category: "Pet Supplies", niche: "Dog Care", emoji: "🐶", demandScore: 86, costLow: 18.0, retailPrice: 79.99, competition: "Medium", potential: "High", trendVelocityPct: 122, sources: ["TikTok", "Reddit", "Amazon"], hashtags: ["#dogtok", "#petproducts", "#sheddingseason"], rationale: "Shedding-season search peak landing earlier this year due to warmer May; 14 viral demos in 21d." },
    { name: "Reusable Beeswax Wraps", category: "Home & Kitchen", niche: "Eco Storage", emoji: "🐝", demandScore: 75, costLow: 2.9, retailPrice: 14.99, competition: "Low", potential: "Medium", trendVelocityPct: 95, sources: ["Etsy", "Instagram"], hashtags: ["#zerowaste", "#sustainableliving"], rationale: "Sustainability hashtag clusters resurfaced post-Earth-Day; mid-tier creators converting at 3.2%." },
  ];
  const filtered = category
    ? ideas.filter((i) => i.category === category)
    : ideas;
  return { products: (filtered.length ? filtered : ideas).slice(0, 5) as AgentToolPayload["products"] };
}

export async function runTrendHunter(
  category: string | null,
  options: { useLiveSignals?: boolean } = { useLiveSignals: true }
): Promise<AgentRun> {
  const startedAt = new Date();
  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const client = getAnthropicClient();
  const usedFallback = !client;

  // Scrape live signals (best-effort — failure is non-fatal)
  let scrape: ScrapeResult | null = null;
  if (options.useLiveSignals !== false) {
    try {
      scrape = await scrapeAllSources();
      store.saveSignals(scrape);
    } catch (e) {
      console.error("[trendHunter] scrape failed:", e);
    }
  }

  let payload: AgentToolPayload;
  let inputTokens = 0;
  let outputTokens = 0;
  let errorMessage: string | undefined;
  let status: "success" | "error" = "success";

  try {
    if (!client) {
      payload = fakeResults(category);
    } else {
      const res = await client.messages.create({
        model: MODEL_CHEAP,
        max_tokens: 2000,
        tools: [PRODUCT_TOOL],
        tool_choice: { type: "tool", name: PRODUCT_TOOL.name },
        messages: [{ role: "user", content: buildPrompt(category, scrape) }],
      });

      inputTokens = res.usage.input_tokens;
      outputTokens = res.usage.output_tokens;

      const toolUse = res.content.find((b) => b.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Model did not return a tool_use block");
      }
      payload = toolUse.input as AgentToolPayload;
    }
  } catch (e) {
    status = "error";
    errorMessage = e instanceof Error ? e.message : String(e);
    payload = fakeResults(category);
  }

  const finishedAt = new Date();
  const discoveredAt = finishedAt.toISOString();

  const products: DiscoveredProduct[] = payload.products.map((p, i) => ({
    id: `${runId}_p${i + 1}`,
    name: p.name,
    category: p.category,
    niche: p.niche,
    emoji: p.emoji,
    demandScore: p.demandScore,
    profit: +(p.retailPrice - p.costLow - 1.5).toFixed(2),
    cost: p.costLow,
    retail: p.retailPrice,
    competition: p.competition,
    potential: p.potential,
    trendVelocity: p.trendVelocityPct,
    searchVolume: 5000 + Math.round(Math.random() * 60000),
    socialScore: 60 + Math.round(Math.random() * 35),
    saturation: 25 + Math.round(Math.random() * 50),
    countryOrigin: "Unknown",
    moq: 100,
    shippingDays: 14,
    trend14d: Array.from({ length: 14 }, (_, k) =>
      Math.round(40 + Math.sin(k / 1.6 + i) * 14 + k * (1 + (i % 3) * 0.4))
    ),
    hashtags: p.hashtags,
    sources: p.sources as string[],
    saved: false,
    source: "agent",
    agent: "trend-hunter",
    discoveredAt,
    runId,
    rationale: p.rationale,
  }));

  if (status === "success") {
    store.saveProducts(products);
  }

  const signalSources: string[] = [];
  if (scrape && scrape.reddit.signals.length) signalSources.push("Reddit");
  if (scrape && scrape.hn.signals.length) signalSources.push("Hacker News");

  const run: AgentRun = {
    id: runId,
    agent: "trend-hunter",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    status,
    inputCategory: category,
    productCount: products.length,
    modelUsed: usedFallback ? "fallback (no API key)" : MODEL_CHEAP,
    inputTokens: usedFallback ? undefined : inputTokens,
    outputTokens: usedFallback ? undefined : outputTokens,
    estCostUsd: usedFallback ? undefined : estimateCost(MODEL_CHEAP, inputTokens, outputTokens),
    usedFallback,
    errorMessage,
    signalsUsed: scrape?.totalSignals ?? 0,
    signalSources,
  };
  store.saveRun(run);
  return run;
}
