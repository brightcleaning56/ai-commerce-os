"use client";
import {
  Activity,
  ArrowRight,
  Eye,
  Flame,
  Globe,
  Loader2,
  RefreshCw,
  Repeat,
  Send,
  ShieldCheck,
  TrendingUp,
  Users,
  Webhook,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";

type ActivityEntry = {
  ts: string;
  pipelineId: string;
  pipelineStartedAt: string;
  linkLabel: string;
  linkToken?: string;
  scope: "full" | "recipient";
  ip?: string;
  userAgent?: string;
  referer?: string;
  viewIndex: number;
};

type FeedResponse = {
  activities: ActivityEntry[];
  totals: {
    totalViews: number;
    uniqueRecipients: number;
    last24h: number;
    reEngagements: number;
    pipelineRuns: number;
  };
};

type WebhookConfig = { configured: boolean; signed: boolean; host: string | null };

export default function ShareActivityPage() {
  const { toast } = useToast();
  const [data, setData] = useState<FeedResponse | null>(null);
  const [config, setConfig] = useState<WebhookConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState("");
  const [testingWebhook, setTestingWebhook] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/share-activity?limit=200");
      if (res.ok) setData(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function loadConfig() {
    try {
      const res = await fetch("/api/share-activity/config");
      if (res.ok) setConfig(await res.json());
    } catch {
      // ignore
    }
  }

  async function fireTestWebhook() {
    setTestingWebhook(true);
    try {
      const res = await fetch("/api/share-activity/test-webhook", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Test webhook failed");
      toast(`Test webhook fired to ${config?.host ?? "configured URL"}${json.signed ? " (signed)" : ""}`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Test webhook failed", "error");
    } finally {
      setTestingWebhook(false);
    }
  }

  useEffect(() => {
    load();
    loadConfig();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return data.activities;
    return data.activities.filter(
      (a) =>
        a.linkLabel.toLowerCase().includes(q) ||
        a.pipelineId.toLowerCase().includes(q) ||
        a.ip?.toLowerCase().includes(q),
    );
  }, [data, filter]);

  // Group by recipient (linkLabel) for "hot leads" panel
  const hotLeads = useMemo(() => {
    if (!data) return [];
    const byLabel = new Map<
      string,
      { label: string; views: number; lastTs: string; pipelineId: string }
    >();
    for (const a of data.activities) {
      const cur = byLabel.get(a.linkLabel);
      if (cur) {
        cur.views++;
        if (a.ts > cur.lastTs) cur.lastTs = a.ts;
      } else {
        byLabel.set(a.linkLabel, {
          label: a.linkLabel,
          views: 1,
          lastTs: a.ts,
          pipelineId: a.pipelineId,
        });
      }
    }
    return Array.from(byLabel.values())
      .sort((a, b) => b.views - a.views)
      .slice(0, 8);
  }, [data]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Share activity</h1>
            <p className="text-xs text-ink-secondary">
              Every share-link open across every pipeline run, in real time
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${
              autoRefresh
                ? "border-accent-green/30 bg-accent-green/5 text-accent-green"
                : "border-bg-border bg-bg-card text-ink-secondary"
            } hover:bg-bg-hover`}
            title="Toggle 15s auto-refresh"
          >
            <Repeat className={`h-3 w-3 ${autoRefresh ? "" : ""}`} />
            {autoRefresh ? "Live" : "Paused"}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card px-2.5 py-1.5 text-xs hover:bg-bg-hover disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </button>
        </div>
      </div>

      {/* Top-line stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total views" v={data?.totals.totalViews ?? "—"} Icon={Eye} />
        <Stat label="Last 24h" v={data?.totals.last24h ?? "—"} Icon={TrendingUp} />
        <Stat label="Recipients" v={data?.totals.uniqueRecipients ?? "—"} Icon={Users} />
        <Stat label="Re-engagements" v={data?.totals.reEngagements ?? "—"} Icon={Flame} />
      </div>

      {/* First-view webhook status */}
      <div className="rounded-xl border border-bg-border bg-bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div
              className={`grid h-9 w-9 place-items-center rounded-lg ${
                config?.configured ? "bg-accent-green/15" : "bg-bg-hover"
              }`}
            >
              <Webhook
                className={`h-4 w-4 ${
                  config?.configured ? "text-accent-green" : "text-ink-tertiary"
                }`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                First-view webhook
                {config?.configured ? (
                  <span className="rounded bg-accent-green/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-green">
                    Active
                  </span>
                ) : (
                  <span className="rounded bg-bg-hover px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">
                    Off
                  </span>
                )}
                {config?.signed && (
                  <span
                    className="flex items-center gap-1 rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-200"
                    title="Body is HMAC-SHA256 signed via X-AICOS-Signature header"
                  >
                    <ShieldCheck className="h-2.5 w-2.5" /> Signed
                  </span>
                )}
              </div>
              <div className="text-[11px] text-ink-tertiary">
                {config?.configured ? (
                  <>
                    POSTs to <span className="font-mono text-ink-secondary">{config.host}</span>{" "}
                    on each recipient's first open
                  </>
                ) : (
                  <>
                    Set <code className="rounded bg-bg-hover px-1 text-[10px]">SHARE_FIRSTVIEW_WEBHOOK_URL</code>{" "}
                    in <code className="rounded bg-bg-hover px-1 text-[10px]">.env.local</code> to
                    enable
                  </>
                )}
              </div>
            </div>
          </div>
          {config?.configured && (
            <button
              onClick={fireTestWebhook}
              disabled={testingWebhook}
              className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-hover px-2.5 py-1.5 text-xs hover:bg-bg-card disabled:opacity-60"
            >
              {testingWebhook ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Fire test webhook
            </button>
          )}
        </div>
      </div>

      {/* Hot leads */}
      {hotLeads.length > 0 && (
        <div className="rounded-xl border border-bg-border bg-bg-card">
          <div className="border-b border-bg-border px-5 py-3 text-sm font-semibold">
            Most-engaged recipients
          </div>
          <ul className="divide-y divide-bg-border">
            {hotLeads.map((h) => (
              <li key={h.label} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-gradient-brand text-[10px] font-bold">
                  {h.label
                    .split(" ")
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{h.label}</div>
                  <div className="text-[11px] text-ink-tertiary">
                    last opened {relativeTime(h.lastTs)} · pipeline{" "}
                    <span className="font-mono text-[10px]">{h.pipelineId}</span>
                  </div>
                </div>
                <span className="rounded-md bg-accent-green/15 px-2 py-0.5 text-[11px] font-semibold text-accent-green">
                  {h.views} view{h.views === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Search filter */}
      <div className="rounded-xl border border-bg-border bg-bg-card px-4 py-3">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by recipient label, pipeline ID, or IP…"
          className="w-full rounded-md border border-bg-border bg-bg-panel px-3 py-2 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
        />
      </div>

      {/* Activity feed */}
      <div className="rounded-xl border border-bg-border bg-bg-card">
        <div className="flex items-center justify-between border-b border-bg-border px-5 py-3 text-sm font-semibold">
          <span>Activity feed ({filtered.length})</span>
          <span className="text-[11px] font-normal text-ink-tertiary">newest first</span>
        </div>
        {filtered.length === 0 && !loading && (
          <div className="px-5 py-12 text-center text-sm text-ink-tertiary">
            No activity yet. Run a pipeline, send some outreach drafts, and watch the
            buyers' opens roll in.
          </div>
        )}
        <ul className="divide-y divide-bg-border">
          {filtered.map((a, i) => (
            <li key={i} className="flex items-start gap-3 px-5 py-3">
              <div
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${
                  a.viewIndex === 1
                    ? "bg-accent-green/15 text-accent-green"
                    : a.viewIndex >= 3
                    ? "bg-accent-amber/15 text-accent-amber"
                    : "bg-brand-500/15 text-brand-300"
                }`}
              >
                <Eye className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink-primary">{a.linkLabel}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                      a.scope === "full"
                        ? "bg-accent-amber/15 text-accent-amber"
                        : "bg-brand-500/15 text-brand-200"
                    }`}
                  >
                    {a.scope}
                  </span>
                  {a.viewIndex === 1 ? (
                    <span className="rounded bg-accent-green/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-green">
                      First open
                    </span>
                  ) : a.viewIndex >= 3 ? (
                    <span className="flex items-center gap-1 rounded bg-accent-amber/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-amber">
                      <Flame className="h-2.5 w-2.5" /> Re-open #{a.viewIndex}
                    </span>
                  ) : (
                    <span className="rounded bg-bg-hover px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-ink-secondary">
                      Open #{a.viewIndex}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-ink-tertiary">
                  pipeline{" "}
                  <Link
                    href="/pipeline"
                    className="font-mono hover:text-brand-200"
                  >
                    {a.pipelineId}
                  </Link>
                  {a.ip && <> · {a.ip}</>}
                  {a.userAgent && (
                    <>
                      {" · "}
                      <Globe className="inline h-2.5 w-2.5" />{" "}
                      {a.userAgent.length > 60 ? a.userAgent.slice(0, 60) + "…" : a.userAgent}
                    </>
                  )}
                  {a.referer && (
                    <>
                      {" · from "}
                      <span className="text-ink-secondary">{safeHost(a.referer)}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 text-right">
                <div className="text-[11px] text-ink-secondary">{relativeTime(a.ts)}</div>
                <ArrowRight className="h-3 w-3 text-ink-tertiary" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function safeHost(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return "unknown";
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) {
    const f = -ms;
    if (f < 60_000) return `in ${Math.max(1, Math.floor(f / 1000))}s`;
    if (f < 3_600_000) return `in ${Math.floor(f / 60_000)}m`;
    if (f < 86_400_000) return `in ${Math.floor(f / 3_600_000)}h`;
    return `in ${Math.floor(f / 86_400_000)}d`;
  }
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function Stat({
  label,
  v,
  Icon,
}: {
  label: string;
  v: string | number;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <Icon className="h-4 w-4 text-brand-300" />
      <div className="mt-2 text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className="mt-1 text-2xl font-bold">{v}</div>
    </div>
  );
}
