"use client";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Plug,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Source = {
  id: string;
  name: string;
  category: "Trends" | "Marketplaces" | "Buyers" | "Suppliers" | "Outreach" | "Comms";
  emoji: string;
  status: "Live" | "Coming soon" | "Needs auth" | "Disabled" | "Error";
  recordsToday: number | null;
  lastSync: string;
  rateLimit: string;
  premium?: boolean;
  scraperKey?: "reddit" | "hn";
};

const SOURCES: Source[] = [
  { id: "rd", name: "Reddit (6 product subs)", category: "Trends", emoji: "👽", status: "Live", recordsToday: null, lastSync: "live", rateLimit: "Unrestricted public", scraperKey: "reddit" },
  { id: "hn", name: "Hacker News", category: "Trends", emoji: "🔶", status: "Live", recordsToday: null, lastSync: "live", rateLimit: "Public", scraperKey: "hn" },

  { id: "tt", name: "TikTok Hashtag API", category: "Trends", emoji: "🎵", status: "Coming soon", recordsToday: null, lastSync: "—", rateLimit: "5K/hr (planned)" },
  { id: "ig", name: "Instagram Reels", category: "Trends", emoji: "📸", status: "Coming soon", recordsToday: null, lastSync: "—", rateLimit: "2K/hr (planned)" },
  { id: "yt", name: "YouTube Shorts", category: "Trends", emoji: "📺", status: "Coming soon", recordsToday: null, lastSync: "—", rateLimit: "1K/hr (planned)" },
  { id: "gt", name: "Google Trends", category: "Trends", emoji: "📈", status: "Coming soon", recordsToday: null, lastSync: "—", rateLimit: "Public (planned)" },
  { id: "fb", name: "Facebook Ads Library", category: "Trends", emoji: "📰", status: "Coming soon", recordsToday: null, lastSync: "—", rateLimit: "—" },

  { id: "am", name: "Amazon BSR + Reviews", category: "Marketplaces", emoji: "📦", status: "Coming soon", recordsToday: null, lastSync: "—", rateLimit: "10K/hr (planned)" },
  { id: "et", name: "Etsy Marketplace", category: "Marketplaces", emoji: "🧶", status: "Coming soon", recordsToday: null, lastSync: "—", rateLimit: "1K/hr (planned)" },
  { id: "sh", name: "Shopify Polaris", category: "Marketplaces", emoji: "🛍️", status: "Coming soon", recordsToday: null, lastSync: "—", rateLimit: "5K/hr (planned)", premium: true },

  { id: "ali", name: "Alibaba / 1688", category: "Suppliers", emoji: "🏭", status: "Coming soon", recordsToday: null, lastSync: "—", rateLimit: "3K/hr (planned)" },
  { id: "mic", name: "Made-in-China", category: "Suppliers", emoji: "🇨🇳", status: "Coming soon", recordsToday: null, lastSync: "—", rateLimit: "1K/hr (planned)" },
  { id: "fa", name: "Faire (wholesale)", category: "Suppliers", emoji: "🤝", status: "Coming soon", recordsToday: null, lastSync: "—", rateLimit: "—" },

  { id: "ln", name: "LinkedIn Sales Nav", category: "Buyers", emoji: "💼", status: "Coming soon", recordsToday: null, lastSync: "—", rateLimit: "Seat-based (planned)", premium: true },
  { id: "ap", name: "Apollo.io", category: "Buyers", emoji: "🚀", status: "Coming soon", recordsToday: null, lastSync: "—", rateLimit: "Plan-based (planned)", premium: true },
  { id: "hu", name: "Hunter.io", category: "Buyers", emoji: "🎯", status: "Coming soon", recordsToday: null, lastSync: "—", rateLimit: "Plan-based (planned)" },
  { id: "cl", name: "Clay (enrichment)", category: "Buyers", emoji: "🪨", status: "Coming soon", recordsToday: null, lastSync: "—", rateLimit: "—" },

  { id: "gm", name: "Gmail / Workspace", category: "Outreach", emoji: "📧", status: "Coming soon", recordsToday: null, lastSync: "—", rateLimit: "OAuth (planned)" },
  { id: "ms", name: "Microsoft 365 Outlook", category: "Outreach", emoji: "🅰️", status: "Coming soon", recordsToday: null, lastSync: "—", rateLimit: "OAuth (planned)" },
  { id: "tw", name: "Twilio (SMS + voice)", category: "Outreach", emoji: "💬", status: "Coming soon", recordsToday: null, lastSync: "—", rateLimit: "Plan-based (planned)" },

  { id: "sl", name: "Slack", category: "Comms", emoji: "💼", status: "Coming soon", recordsToday: null, lastSync: "—", rateLimit: "OAuth (planned)" },
  { id: "cal", name: "Calendly / Cal.com", category: "Comms", emoji: "📅", status: "Coming soon", recordsToday: null, lastSync: "—", rateLimit: "OAuth (planned)" },
];

const STATUS_TONE: Record<Source["status"], { bg: string; text: string; Icon: React.ComponentType<{ className?: string }> }> = {
  Live: { bg: "bg-accent-green/15", text: "text-accent-green", Icon: CheckCircle2 },
  "Coming soon": { bg: "bg-bg-hover", text: "text-ink-tertiary", Icon: Sparkles },
  "Needs auth": { bg: "bg-accent-amber/15", text: "text-accent-amber", Icon: AlertCircle },
  Disabled: { bg: "bg-bg-hover", text: "text-ink-tertiary", Icon: Plug },
  Error: { bg: "bg-accent-red/15", text: "text-accent-red", Icon: AlertCircle },
};

const CATEGORIES = ["All", "Trends", "Marketplaces", "Buyers", "Suppliers", "Outreach", "Comms"] as const;

type SignalsResponse = {
  signals: {
    scrapedAt: string;
    reddit: { signals: unknown[] };
    hn: { signals: unknown[] };
    totalSignals: number;
  } | null;
};

function formatLastSync(iso: string | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DataSourcesPage() {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("All");
  const [signals, setSignals] = useState<SignalsResponse["signals"]>(null);

  useEffect(() => {
    fetch("/api/signals")
      .then((r) => r.json())
      .then((d: SignalsResponse) => setSignals(d.signals))
      .catch(() => {});
  }, []);

  const liveCounts = useMemo<Record<"reddit" | "hn", number>>(
    () => ({
      reddit: signals?.reddit.signals.length ?? 0,
      hn: signals?.hn.signals.length ?? 0,
    }),
    [signals]
  );
  const lastSyncLabel = formatLastSync(signals?.scrapedAt);

  const list = SOURCES.filter((s) => cat === "All" || s.category === cat);
  const liveSourceCount = SOURCES.filter((s) => s.status === "Live").length;
  const totalLiveRecords = (signals?.totalSignals ?? 0).toLocaleString();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Data Sources</h1>
            <p className="text-xs text-ink-secondary">
              {liveSourceCount} live signal source{liveSourceCount === 1 ? "" : "s"} · {totalLiveRecords} records ingested today · last sync {lastSyncLabel}
            </p>
          </div>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow">
          <Plus className="h-4 w-4" /> Connect new source
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-bg-border bg-bg-card p-3 text-xs text-ink-secondary">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-200" />
        <div>
          <span className="font-semibold text-ink-primary">Live</span> sources are actually firing today (see <code className="rounded bg-bg-hover px-1">lib/scrapers/</code>). Everything labelled <span className="font-semibold text-ink-primary">Coming soon</span> is roadmap UI — counts and limits are aspirational, not real. We do this on purpose so you can see what&apos;s shipped vs planned.
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-bg-border bg-bg-card p-1 text-xs w-fit">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-md px-3 py-1.5 ${
              cat === c
                ? "bg-brand-500/15 text-brand-200"
                : "text-ink-secondary hover:bg-bg-hover"
            }`}
          >
            {c}
            {c !== "All" && (
              <span className="ml-1.5 text-[10px] text-ink-tertiary">
                {SOURCES.filter((s) => s.category === c).length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((s) => {
          const tone = STATUS_TONE[s.status];
          const Icon = tone.Icon;
          const liveRecords = s.scraperKey ? liveCounts[s.scraperKey] : null;
          const recordsLabel =
            liveRecords !== null
              ? liveRecords.toLocaleString()
              : s.recordsToday !== null
                ? s.recordsToday.toLocaleString()
                : "—";
          const syncLabel = s.scraperKey ? lastSyncLabel : s.lastSync;
          return (
            <div
              key={s.id}
              className="rounded-xl border border-bg-border bg-bg-card p-4 transition hover:border-brand-500/40"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-gradient-card text-2xl">
                    {s.emoji}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold">{s.name}</span>
                      {s.premium && (
                        <span className="rounded-md bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-200">
                          PRO
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-ink-tertiary">{s.category}</div>
                  </div>
                </div>
                <span className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${tone.bg} ${tone.text}`}>
                  <Icon className="h-3 w-3" /> {s.status}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Records</div>
                  <div className="text-sm font-semibold">{recordsLabel}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Last sync</div>
                  <div className="text-sm font-semibold">{syncLabel}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Limit</div>
                  <div className="text-sm font-semibold">{s.rateLimit}</div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  disabled={s.status !== "Live"}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-bg-border bg-bg-hover/40 py-1.5 text-xs hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RefreshCw className="h-3 w-3" /> Sync now
                </button>
                <button
                  disabled={s.status !== "Live"}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-bg-border bg-bg-hover/40 py-1.5 text-xs hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Configure
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
