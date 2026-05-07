"use client";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Plug,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";

type Source = {
  id: string;
  name: string;
  category: "Trends" | "Marketplaces" | "Buyers" | "Suppliers" | "Outreach" | "Comms";
  emoji: string;
  status: "Connected" | "Needs auth" | "Disabled" | "Error";
  recordsToday: number;
  lastSync: string;
  rateLimit: string;
  premium?: boolean;
};

const SOURCES: Source[] = [
  { id: "tt", name: "TikTok Hashtag API", category: "Trends", emoji: "🎵", status: "Connected", recordsToday: 18_412, lastSync: "1m ago", rateLimit: "5K/hr" },
  { id: "ig", name: "Instagram Reels", category: "Trends", emoji: "📸", status: "Connected", recordsToday: 9_201, lastSync: "3m ago", rateLimit: "2K/hr" },
  { id: "rd", name: "Reddit (32 subs)", category: "Trends", emoji: "👽", status: "Connected", recordsToday: 4_120, lastSync: "5m ago", rateLimit: "Unlimited" },
  { id: "yt", name: "YouTube Shorts", category: "Trends", emoji: "📺", status: "Connected", recordsToday: 6_881, lastSync: "8m ago", rateLimit: "1K/hr" },
  { id: "gt", name: "Google Trends", category: "Trends", emoji: "📈", status: "Connected", recordsToday: 12_004, lastSync: "12m ago", rateLimit: "Public" },
  { id: "fb", name: "Facebook Ads Library", category: "Trends", emoji: "📰", status: "Needs auth", recordsToday: 0, lastSync: "—", rateLimit: "—" },

  { id: "am", name: "Amazon BSR + Reviews", category: "Marketplaces", emoji: "📦", status: "Connected", recordsToday: 24_512, lastSync: "2m ago", rateLimit: "10K/hr" },
  { id: "et", name: "Etsy Marketplace", category: "Marketplaces", emoji: "🧶", status: "Connected", recordsToday: 3_402, lastSync: "15m ago", rateLimit: "1K/hr" },
  { id: "sh", name: "Shopify Polaris", category: "Marketplaces", emoji: "🛍️", status: "Connected", recordsToday: 8_412, lastSync: "9m ago", rateLimit: "5K/hr", premium: true },

  { id: "ali", name: "Alibaba / 1688", category: "Suppliers", emoji: "🏭", status: "Connected", recordsToday: 14_201, lastSync: "11m ago", rateLimit: "3K/hr" },
  { id: "mic", name: "Made-in-China", category: "Suppliers", emoji: "🇨🇳", status: "Connected", recordsToday: 5_801, lastSync: "1h ago", rateLimit: "1K/hr" },
  { id: "fa", name: "Faire (wholesale)", category: "Suppliers", emoji: "🤝", status: "Disabled", recordsToday: 0, lastSync: "—", rateLimit: "—" },

  { id: "ln", name: "LinkedIn Sales Nav", category: "Buyers", emoji: "💼", status: "Connected", recordsToday: 2_891, lastSync: "30m ago", rateLimit: "Seat-based", premium: true },
  { id: "ap", name: "Apollo.io", category: "Buyers", emoji: "🚀", status: "Connected", recordsToday: 4_404, lastSync: "8m ago", rateLimit: "Plan-based", premium: true },
  { id: "hu", name: "Hunter.io", category: "Buyers", emoji: "🎯", status: "Connected", recordsToday: 1_240, lastSync: "20m ago", rateLimit: "Plan-based" },
  { id: "cl", name: "Clay (enrichment)", category: "Buyers", emoji: "🪨", status: "Error", recordsToday: 0, lastSync: "Yesterday · token expired", rateLimit: "—" },

  { id: "gm", name: "Gmail / Workspace", category: "Outreach", emoji: "📧", status: "Connected", recordsToday: 891, lastSync: "1m ago", rateLimit: "OAuth" },
  { id: "ms", name: "Microsoft 365 Outlook", category: "Outreach", emoji: "🅰️", status: "Connected", recordsToday: 412, lastSync: "2m ago", rateLimit: "OAuth" },
  { id: "tw", name: "Twilio (SMS + voice)", category: "Outreach", emoji: "💬", status: "Connected", recordsToday: 142, lastSync: "5m ago", rateLimit: "Plan-based" },

  { id: "sl", name: "Slack", category: "Comms", emoji: "💼", status: "Connected", recordsToday: 24, lastSync: "Today", rateLimit: "OAuth" },
  { id: "cal", name: "Calendly / Cal.com", category: "Comms", emoji: "📅", status: "Connected", recordsToday: 11, lastSync: "1h ago", rateLimit: "OAuth" },
];

const STATUS_TONE: Record<string, { bg: string; text: string; Icon: React.ComponentType<{ className?: string }> }> = {
  Connected: { bg: "bg-accent-green/15", text: "text-accent-green", Icon: CheckCircle2 },
  "Needs auth": { bg: "bg-accent-amber/15", text: "text-accent-amber", Icon: AlertCircle },
  Disabled: { bg: "bg-bg-hover", text: "text-ink-tertiary", Icon: Plug },
  Error: { bg: "bg-accent-red/15", text: "text-accent-red", Icon: AlertCircle },
};

const CATEGORIES = ["All", "Trends", "Marketplaces", "Buyers", "Suppliers", "Outreach", "Comms"] as const;

export default function DataSourcesPage() {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("All");

  const list = SOURCES.filter((s) => cat === "All" || s.category === cat);
  const totals = SOURCES.reduce((s, src) => s + src.recordsToday, 0);

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
              {SOURCES.filter((s) => s.status === "Connected").length} of {SOURCES.length} connected · {totals.toLocaleString()} records ingested today
            </p>
          </div>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow">
          <Plus className="h-4 w-4" /> Connect new source
        </button>
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
                  <div className="text-sm font-semibold">{s.recordsToday.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Last sync</div>
                  <div className="text-sm font-semibold">{s.lastSync}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Limit</div>
                  <div className="text-sm font-semibold">{s.rateLimit}</div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-bg-border bg-bg-hover/40 py-1.5 text-xs hover:bg-bg-hover">
                  <RefreshCw className="h-3 w-3" /> Sync now
                </button>
                <button className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-bg-border bg-bg-hover/40 py-1.5 text-xs hover:bg-bg-hover">
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
