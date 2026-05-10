"use client";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Briefcase,
  FileText,
  Megaphone,
  Search,
  ShoppingBag,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";

type DashboardStats = {
  hasAnyData: boolean;
  campaign: {
    total: number;
    inProgress: number;
    sent: number;
    replies: number;
    meetings: number;
    deals: number;
    openRate: string;
    replyRate: string;
    meetingRate: string;
    topCampaign: string;
  };
  pipeline: {
    stages: Array<{ stage: string; count: number; valueCents: number }>;
    totalValueCents: number;
  };
  topAgents: Array<{ name: string; agent: string; score: number; runs: number }>;
  alerts: Array<{ title: string; sub: string; ago: string; tone: "red" | "amber" | "green" }>;
};

// Cache shared across all bottom-row cards on the same render — they all
// mount together so we de-dupe one /api/dashboard/stats fetch instead of four.
let inflight: Promise<DashboardStats | null> | null = null;
let lastFetched = 0;

async function fetchStats(): Promise<DashboardStats | null> {
  const now = Date.now();
  if (inflight && now - lastFetched < 5000) return inflight;
  lastFetched = now;
  inflight = fetch("/api/dashboard/stats", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return inflight;
}

function useStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchStats().then((d) => {
      if (!cancelled) setStats(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return stats;
}

function fmtCents(cents: number) {
  if (cents >= 1_000_000_00) return `$${(cents / 1_000_000_00).toFixed(2)}M`;
  if (cents >= 1_000_00) return `$${(cents / 1_000_00).toFixed(1)}K`;
  return `$${(cents / 100).toFixed(0)}`;
}

function relTime(iso: string) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const alertTone: Record<string, { bg: string; text: string }> = {
  red: { bg: "bg-accent-red/10", text: "text-accent-red" },
  amber: { bg: "bg-accent-amber/10", text: "text-accent-amber" },
  green: { bg: "bg-accent-green/10", text: "text-accent-green" },
};

// ─────────────────────────────────────────────────────────────────────────────

export function CampaignsCard() {
  const stats = useStats();
  const c = stats?.campaign;
  const hasNone = stats && c && c.total === 0;

  return (
    <Card>
      <CardHeader title="Outreach Campaigns" icon={<Megaphone className="h-4 w-4 text-brand-300" />} />
      {hasNone ? (
        <div className="px-5 py-8 text-center">
          <div className="text-sm font-medium">No campaigns yet</div>
          <div className="mt-1 text-[11px] text-ink-tertiary">Send a draft from /outreach to start tracking responses.</div>
          <Link
            href="/outreach"
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow"
          >
            <Megaphone className="h-3 w-3" /> Open Outreach
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-6 gap-2 border-b border-bg-border px-5 py-4 text-center">
            {[
              { label: "Total", v: c?.total ?? "—" },
              { label: "In Progress", v: c?.inProgress ?? "—" },
              { label: "Sent", v: c?.sent?.toLocaleString() ?? "—" },
              { label: "Replies", v: c?.replies ?? "—" },
              { label: "Meetings", v: c?.meetings ?? "—" },
              { label: "Deals", v: c?.deals ?? "—" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{s.label}</div>
                <div className="mt-1 text-lg font-bold">{s.v}</div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-secondary">Top campaign</span>
              <span className="flex items-center gap-1.5 text-accent-green">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-green" />
                Active
              </span>
            </div>
            <div className="mt-1 truncate font-medium">{c?.topCampaign ?? "—"}</div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              {[
                { l: "Open Rate", v: c?.openRate ?? "—" },
                { l: "Reply Rate", v: c?.replyRate ?? "—" },
                { l: "Meeting Rate", v: c?.meetingRate ?? "—" },
              ].map((s) => (
                <div key={s.l} className="rounded-md bg-bg-hover/40 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{s.l}</div>
                  <div className="text-sm font-semibold text-brand-200">{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="border-t border-bg-border px-5 py-3 text-center">
        <Link href="/outreach" className="text-xs text-brand-300 hover:text-brand-200">
          View All Campaigns →
        </Link>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function PipelineCard() {
  const stats = useStats();
  const p = stats?.pipeline;
  const hasNone = stats && p && p.stages.every((s) => s.count === 0);

  return (
    <Card>
      <CardHeader
        title="Pipeline Overview"
        icon={<Briefcase className="h-4 w-4 text-brand-300" />}
        right={
          <Link href="/transactions" className="text-xs text-brand-300 hover:text-brand-200">
            View →
          </Link>
        }
      />
      {hasNone ? (
        <div className="px-5 py-8 text-center">
          <div className="text-sm font-medium">No deals in pipeline yet</div>
          <div className="mt-1 text-[11px] text-ink-tertiary">
            Accept a quote from /deals to create a transaction. The funnel below tracks every stage.
          </div>
          <Link
            href="/deals"
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow"
          >
            <Briefcase className="h-3 w-3" /> Open Deals
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-2 px-5 py-5 text-center">
            {(p?.stages ?? []).map((s) => (
              <div key={s.stage}>
                <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{s.stage}</div>
                <div className="mt-1 text-lg font-bold">{s.count}</div>
                <div className="text-[11px] text-brand-300">{s.valueCents > 0 ? fmtCents(s.valueCents) : ""}</div>
              </div>
            ))}
          </div>
          <div className="border-t border-bg-border px-5 py-3 flex items-center justify-between">
            <span className="text-xs text-ink-secondary">
              Total Pipeline Value:{" "}
              <span className="font-semibold text-ink-primary">{fmtCents(p?.totalValueCents ?? 0)}</span>
            </span>
            <Link href="/transactions" className="text-xs text-brand-300 hover:text-brand-200">
              View Pipeline →
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function TopAgentsCard() {
  const stats = useStats();
  const agents = stats?.topAgents ?? [];
  const hasNone = stats && agents.length === 0;

  return (
    <Card>
      <CardHeader title="Top Performing Agents" icon={<Bot className="h-4 w-4 text-brand-300" />} />
      {hasNone ? (
        <div className="px-5 py-8 text-center">
          <div className="text-sm font-medium">No agent runs yet</div>
          <div className="mt-1 text-[11px] text-ink-tertiary">Run a pipeline and the leaderboard fills in.</div>
        </div>
      ) : (
        <div className="space-y-3 px-5 py-4">
          {agents.length === 0 &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 animate-pulse rounded bg-bg-hover/40" />
                <div className="h-1.5 animate-pulse rounded bg-bg-hover/40" />
              </div>
            ))}
          {agents.map((a) => (
            <div key={a.agent}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-secondary">
                  {a.name} <span className="text-ink-tertiary">· {a.runs} runs</span>
                </span>
                <span className="font-semibold text-brand-200">{a.score}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-hover">
                <div className="h-full bg-gradient-brand" style={{ width: `${a.score}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-bg-border px-5 py-3 text-center">
        <Link href="/agents" className="text-xs text-brand-300 hover:text-brand-200">
          Manage All Agents →
        </Link>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function AlertsCard() {
  const stats = useStats();
  const alerts = stats?.alerts ?? [];
  const hasNone = stats && alerts.length === 0;

  return (
    <Card>
      <CardHeader
        title="Alerts & Notifications"
        icon={<AlertTriangle className="h-4 w-4 text-accent-red" />}
        right={
          <Link href="/risk" className="text-xs text-brand-300 hover:text-brand-200">
            View All
          </Link>
        }
      />
      {hasNone ? (
        <div className="px-5 py-8 text-center">
          <div className="text-sm font-medium text-accent-green">All clear</div>
          <div className="mt-1 text-[11px] text-ink-tertiary">
            No risk flags or failed agent runs. Risk Agent surfaces issues here.
          </div>
        </div>
      ) : (
        <div className="divide-y divide-bg-border">
          {alerts.map((a, i) => {
            const tone = alertTone[a.tone] ?? alertTone.amber;
            return (
              <div key={i} className="flex items-start gap-3 px-5 py-3">
                <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${tone.bg}`}>
                  <AlertTriangle className={`h-3.5 w-3.5 ${tone.text}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="truncate text-[11px] text-ink-tertiary">{a.sub}</div>
                </div>
                <div className="text-[11px] text-ink-tertiary">{relTime(a.ago)}</div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function QuickActionsCard() {
  const actions = [
    { label: "Find Trending Products", Icon: Search, href: "/products" },
    { label: "Discover Buyers", Icon: Users, href: "/buyers" },
    { label: "Find Suppliers", Icon: ShoppingBag, href: "/suppliers" },
    { label: "Run Pipeline", Icon: Sparkles, href: "/pipeline" },
    { label: "Build Quote", Icon: FileText, href: "/deals" },
    { label: "Open Transactions", Icon: ArrowRight, href: "/transactions" },
    { label: "Automation Rules", Icon: Zap, href: "/automations" },
    { label: "AI Agent Settings", Icon: Bot, href: "/agents" },
  ];
  return (
    <Card>
      <CardHeader title="Quick Actions" icon={<Zap className="h-4 w-4 text-brand-300" />} />
      <div className="grid grid-cols-2 gap-2 p-4">
        {actions.map((a) => (
          <Link
            key={a.label}
            href={a.href}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-hover/40 px-3 py-2.5 text-left text-xs text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
          >
            <a.Icon className="h-3.5 w-3.5 text-brand-300" />
            <span>{a.label}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
