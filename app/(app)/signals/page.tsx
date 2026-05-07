"use client";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MessageSquare,
  Radio,
  RefreshCw,
  Sparkles,
  ThumbsUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ScrapeResult } from "@/lib/scrapers";
import type { HNSignal } from "@/lib/scrapers/hackernews";
import type { RedditSignal } from "@/lib/scrapers/reddit";

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function SignalsPage() {
  const [data, setData] = useState<ScrapeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "reddit" | "hn">("all");

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/signals", { cache: "no-store" });
      const d = await r.json();
      setData(d.signals);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load signals");
    } finally {
      setLoading(false);
    }
  }

  async function scrape() {
    setScraping(true);
    setError(null);
    try {
      const r = await fetch("/api/signals/scrape", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Scrape failed");
      setData(d.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scrape failed");
    } finally {
      setScraping(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const all = data
    ? [...data.reddit.signals, ...data.hn.signals].sort((a, b) => b.score - a.score)
    : [];
  const visible =
    tab === "all"
      ? all
      : tab === "reddit"
      ? data?.reddit.signals ?? []
      : data?.hn.signals ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Live Signals</h1>
            <p className="text-xs text-ink-secondary">
              Real-time scrape from Reddit + Hacker News · these feed directly into Trend Hunter
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh cache
          </button>
          <button
            onClick={scrape}
            disabled={scraping}
            className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow disabled:opacity-60"
          >
            {scraping ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Scraping…</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Scrape now</>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Last scrape"
          v={data ? relativeTime(data.scrapedAt) : "—"}
          hint={data ? `${(data.durationMs / 1000).toFixed(2)}s` : ""}
        />
        <Stat
          label="Reddit signals"
          v={data?.reddit.signals.length ?? 0}
          hint={data ? `${data.reddit.subsHit}/${data.reddit.subsTotal} subs` : "—"}
        />
        <Stat
          label="HN launches"
          v={data?.hn.signals.length ?? 0}
          hint={data ? `${data.hn.totalScanned} top stories scanned` : "—"}
        />
        <Stat
          label="Total"
          v={data?.totalSignals ?? 0}
          hint="active signals"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-accent-red/30 bg-accent-red/5 p-3 text-xs text-accent-red">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </div>
      )}

      {!data && !loading && !error && (
        <div className="rounded-xl border border-bg-border bg-bg-card p-12 text-center">
          <Radio className="mx-auto h-8 w-8 text-brand-300" />
          <div className="mt-3 text-base font-semibold">No signals scraped yet</div>
          <p className="mt-1 text-xs text-ink-tertiary">
            Click &ldquo;Scrape now&rdquo; to pull live posts from Reddit and Hacker News.
          </p>
        </div>
      )}

      {data && (
        <>
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-bg-border bg-bg-card p-1 text-xs w-fit">
            {(
              [
                ["all", "All", all.length],
                ["reddit", "Reddit", data.reddit.signals.length],
                ["hn", "Hacker News", data.hn.signals.length],
              ] as const
            ).map(([k, label, n]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 ${
                  tab === k
                    ? "bg-brand-500/15 text-brand-200"
                    : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
                }`}
              >
                {label}
                <span
                  className={`rounded ${
                    tab === k ? "bg-brand-500/20" : "bg-bg-hover"
                  } px-1.5 text-[10px]`}
                >
                  {n}
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {visible.length === 0 ? (
              <div className="rounded-xl border border-bg-border bg-bg-card p-8 text-center text-xs text-ink-tertiary">
                No signals from this source.
              </div>
            ) : (
              visible.map((s, i) => <SignalRow key={`${s.source}-${i}`} s={s} />)
            )}
          </div>

          <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-5">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/20">
                <Sparkles className="h-5 w-5 text-brand-200" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">How signals feed Trend Hunter</div>
                <p className="mt-1 text-xs text-ink-secondary">
                  Every &ldquo;Run Trend Scan&rdquo; first scrapes these sources, then injects the top
                  posts into the Claude prompt as concrete context. Claude is instructed to
                  cite at least one specific signal in each product&apos;s rationale — so the
                  output is grounded in what people are actually posting <em>right now</em>.
                </p>
                <a
                  href="/products"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-300 hover:text-brand-200"
                >
                  Run a Trend Scan with these signals <ArrowRight className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SignalRow({ s }: { s: RedditSignal | HNSignal }) {
  const isReddit = s.source === "reddit";
  return (
    <a
      href={isReddit ? (s as RedditSignal).permalink : (s as HNSignal).hnUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 rounded-xl border border-bg-border bg-bg-card p-4 transition hover:border-brand-500/40 hover:shadow-glow"
    >
      <div
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-lg ${
          isReddit ? "bg-orange-500/20 text-orange-400" : "bg-amber-500/20 text-amber-400"
        }`}
      >
        {isReddit ? "👽" : "Y"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] text-ink-tertiary">
          <span className="rounded bg-bg-hover/60 px-1.5 py-0.5 font-medium">
            {isReddit ? `r/${(s as RedditSignal).subreddit}` : "Hacker News"}
          </span>
          <span>·</span>
          <span>{s.author}</span>
          <span>·</span>
          <span>{relativeTime(s.createdAt)}</span>
        </div>
        <div className="mt-1 line-clamp-2 text-sm font-medium group-hover:text-brand-200">
          {s.title}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-tertiary">
          <span className="flex items-center gap-1">
            <ThumbsUp className="h-3 w-3" />
            {s.score.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {s.numComments.toLocaleString()}
          </span>
          {!isReddit && (s as HNSignal).url && (
            <span className="flex items-center gap-1 truncate">
              <ExternalLink className="h-3 w-3" />
              {(() => {
                try {
                  return new URL((s as HNSignal).url).hostname;
                } catch {
                  return "";
                }
              })()}
            </span>
          )}
        </div>
      </div>
      <CheckCircle2 className="hidden h-4 w-4 text-accent-green opacity-0 group-hover:opacity-100 sm:block" />
    </a>
  );
}

function Stat({ label, v, hint }: { label: string; v: string | number; hint: string }) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className="mt-1 text-2xl font-bold">{v}</div>
      <div className="text-[11px] text-ink-tertiary">{hint || "—"}</div>
    </div>
  );
}
