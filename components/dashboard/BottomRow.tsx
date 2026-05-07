import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Briefcase,
  Megaphone,
  Search,
  ShoppingBag,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import {
  ALERTS,
  CAMPAIGN_STATS,
  PIPELINE,
  TOP_AGENTS,
} from "@/lib/mockData";

const alertTone: Record<string, { bg: string; text: string }> = {
  red: { bg: "bg-accent-red/10", text: "text-accent-red" },
  amber: { bg: "bg-accent-amber/10", text: "text-accent-amber" },
  green: { bg: "bg-accent-green/10", text: "text-accent-green" },
};

export function CampaignsCard() {
  return (
    <Card>
      <CardHeader
        title="Outreach Campaigns"
        icon={<Megaphone className="h-4 w-4 text-brand-300" />}
      />
      <div className="grid grid-cols-6 gap-2 border-b border-bg-border px-5 py-4 text-center">
        {[
          { label: "Total", v: CAMPAIGN_STATS.total },
          { label: "In Progress", v: CAMPAIGN_STATS.inProgress },
          { label: "Sent", v: CAMPAIGN_STATS.sent.toLocaleString() },
          { label: "Replies", v: CAMPAIGN_STATS.replies },
          { label: "Meetings", v: CAMPAIGN_STATS.meetings },
          { label: "Deals", v: CAMPAIGN_STATS.deals },
        ].map((s) => (
          <div key={s.label}>
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
              {s.label}
            </div>
            <div className="mt-1 text-lg font-bold">{s.v}</div>
          </div>
        ))}
      </div>
      <div className="px-5 py-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-secondary">Top Campaign:</span>
          <span className="flex items-center gap-1.5 text-accent-green">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-green" />
            Active
          </span>
        </div>
        <div className="mt-1 font-medium">{CAMPAIGN_STATS.topCampaign}</div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          {[
            { l: "Open Rate", v: CAMPAIGN_STATS.openRate },
            { l: "Reply Rate", v: CAMPAIGN_STATS.replyRate },
            { l: "Meeting Rate", v: CAMPAIGN_STATS.meetingRate },
          ].map((s) => (
            <div key={s.l} className="rounded-md bg-bg-hover/40 py-2">
              <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                {s.l}
              </div>
              <div className="text-sm font-semibold text-brand-200">{s.v}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-bg-border px-5 py-3 text-center">
        <button className="text-xs text-brand-300 hover:text-brand-200">
          View All Campaigns →
        </button>
      </div>
    </Card>
  );
}

export function PipelineCard() {
  return (
    <Card>
      <CardHeader
        title="Pipeline Overview"
        icon={<Briefcase className="h-4 w-4 text-brand-300" />}
        right={
          <select className="rounded-md border border-bg-border bg-bg-card px-2 py-1 text-xs text-ink-secondary">
            <option>This Month</option>
            <option>This Week</option>
            <option>This Quarter</option>
          </select>
        }
      />
      <div className="grid grid-cols-5 gap-2 px-5 py-5 text-center">
        {PIPELINE.map((s) => (
          <div key={s.stage}>
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
              {s.stage}
            </div>
            <div className="mt-1 text-lg font-bold">{s.count}</div>
            <div className="text-[11px] text-brand-300">{s.value}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-bg-border px-5 py-3 flex items-center justify-between">
        <span className="text-xs text-ink-secondary">
          Total Pipeline Value: <span className="font-semibold text-ink-primary">$1.26M</span>
        </span>
        <button className="text-xs text-brand-300 hover:text-brand-200">
          View Pipeline →
        </button>
      </div>
    </Card>
  );
}

export function TopAgentsCard() {
  return (
    <Card>
      <CardHeader
        title="Top Performing Agents"
        icon={<Bot className="h-4 w-4 text-brand-300" />}
      />
      <div className="space-y-3 px-5 py-4">
        {TOP_AGENTS.map((a) => (
          <div key={a.name}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-secondary">{a.name}</span>
              <span className="font-semibold text-brand-200">{a.score}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-hover">
              <div
                className="h-full bg-gradient-brand"
                style={{ width: `${a.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-bg-border px-5 py-3 text-center">
        <button className="text-xs text-brand-300 hover:text-brand-200">
          Manage All Agents →
        </button>
      </div>
    </Card>
  );
}

export function AlertsCard() {
  return (
    <Card>
      <CardHeader
        title="Alerts & Notifications"
        icon={<AlertTriangle className="h-4 w-4 text-accent-red" />}
        right={
          <button className="text-xs text-brand-300 hover:text-brand-200">
            View All
          </button>
        }
      />
      <div className="divide-y divide-bg-border">
        {ALERTS.map((a) => {
          const tone = alertTone[a.tone] ?? alertTone.amber;
          return (
            <div key={a.title + a.ago} className="flex items-start gap-3 px-5 py-3">
              <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${tone.bg}`}>
                <AlertTriangle className={`h-3.5 w-3.5 ${tone.text}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{a.title}</div>
                <div className="truncate text-[11px] text-ink-tertiary">{a.sub}</div>
              </div>
              <div className="text-[11px] text-ink-tertiary">{a.ago}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function QuickActionsCard() {
  const actions = [
    { label: "Find Trending Products", Icon: Search },
    { label: "Discover Buyers", Icon: Users },
    { label: "Find Suppliers", Icon: ShoppingBag },
    { label: "Create Campaign", Icon: Megaphone },
    { label: "Build Quote", Icon: Briefcase },
    { label: "Add New Deal", Icon: ArrowRight },
    { label: "Automation Rules", Icon: Zap },
    { label: "AI Agent Settings", Icon: Sparkles },
  ];
  return (
    <Card>
      <CardHeader
        title="Quick Actions"
        icon={<Zap className="h-4 w-4 text-brand-300" />}
      />
      <div className="grid grid-cols-2 gap-2 p-4">
        {actions.map((a) => (
          <button
            key={a.label}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-hover/40 px-3 py-2.5 text-left text-xs text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
          >
            <a.Icon className="h-3.5 w-3.5 text-brand-300" />
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
