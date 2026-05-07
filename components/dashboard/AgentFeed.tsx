import { Activity, Bot } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { AGENT_FEED } from "@/lib/mockData";

const dot: Record<string, string> = {
  brand: "bg-brand-400",
  amber: "bg-accent-amber",
  green: "bg-accent-green",
  blue: "bg-accent-blue",
  cyan: "bg-accent-cyan",
  red: "bg-accent-red",
};

export default function AgentFeed() {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="AI Agent Activity Feed"
        icon={<Activity className="h-4 w-4 text-brand-300" />}
        right={
          <span className="flex items-center gap-1.5 text-[11px] text-accent-green">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-green shadow-[0_0_8px_#22c55e]" />
            Live
          </span>
        }
      />
      <div className="flex-1 divide-y divide-bg-border">
        {AGENT_FEED.map((a) => (
          <div key={a.agent + a.ago} className="flex items-start gap-3 px-5 py-3">
            <div
              className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md ${dot[a.tone] ?? "bg-brand-400"}/20`}
            >
              <Bot className="h-3.5 w-3.5 text-ink-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{a.agent}</div>
              <div className="text-xs text-ink-secondary">{a.action}</div>
            </div>
            <div className="text-[11px] text-ink-tertiary">{a.ago}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-bg-border px-5 py-3 text-center">
        <button className="text-xs text-brand-300 hover:text-brand-200">
          View All Activity →
        </button>
      </div>
    </Card>
  );
}
