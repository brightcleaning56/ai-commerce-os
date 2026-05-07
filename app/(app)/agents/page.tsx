import { Bot, Brain, Factory, MessageSquare, Search, Send, ShieldAlert, TrendingUp, Users, Workflow } from "lucide-react";
import { Card } from "@/components/ui/Card";

const AGENTS = [
  { name: "Trend Hunter Agent", desc: "Scans TikTok, Reddit, Amazon, Alibaba 24/7", status: "Running", Icon: Search, tasks: 142 },
  { name: "Demand Intelligence Agent", desc: "Scores demand 0-100 from multi-source signal", status: "Running", Icon: TrendingUp, tasks: 87 },
  { name: "Supplier Finder Agent", desc: "Surfaces verified manufacturers and dropshippers", status: "Running", Icon: Factory, tasks: 53 },
  { name: "Buyer Discovery Agent", desc: "Finds retailers + decision-makers", status: "Running", Icon: Users, tasks: 211 },
  { name: "Outreach Agent", desc: "Sends personalized email/SMS/LinkedIn", status: "Running", Icon: Send, tasks: 156 },
  { name: "Negotiation Agent", desc: "Replies, handles objections, books calls", status: "Idle", Icon: MessageSquare, tasks: 3 },
  { name: "CRM Intelligence Agent", desc: "Routes leads, updates stages, predicts churn", status: "Running", Icon: Workflow, tasks: 41 },
  { name: "Risk Agent", desc: "Detects scam suppliers, fake buyers, trademark hits", status: "Running", Icon: ShieldAlert, tasks: 12 },
  { name: "Learning Agent", desc: "Optimizes prompts, lead sources, pricing", status: "Running", Icon: Brain, tasks: 7 },
];

export default function AgentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-brand shadow-glow">
          <Bot className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">AI Agents</h1>
          <p className="text-sm text-ink-secondary">
            Control room for the autonomous agent network — one card per agent.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {AGENTS.map((a) => (
          <Card key={a.name} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/15">
                  <a.Icon className="h-5 w-5 text-brand-300" />
                </div>
                <div>
                  <div className="font-semibold">{a.name}</div>
                  <div className="text-[11px] text-ink-tertiary">{a.desc}</div>
                </div>
              </div>
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                  a.status === "Running"
                    ? "bg-accent-green/10 text-accent-green"
                    : "bg-bg-hover text-ink-tertiary"
                }`}
              >
                {a.status}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-bg-hover/40 py-2">
                <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                  Tasks 24h
                </div>
                <div className="mt-0.5 text-sm font-semibold">{a.tasks}</div>
              </div>
              <div className="rounded-md bg-bg-hover/40 py-2">
                <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                  Mode
                </div>
                <div className="mt-0.5 text-sm font-semibold text-brand-200">Auto</div>
              </div>
              <div className="rounded-md bg-bg-hover/40 py-2">
                <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                  Confidence
                </div>
                <div className="mt-0.5 text-sm font-semibold text-accent-green">94%</div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button className="flex-1 rounded-md border border-bg-border bg-bg-hover/40 py-1.5 text-xs hover:bg-bg-hover">
                View Logs
              </button>
              <button className="flex-1 rounded-md border border-bg-border bg-bg-hover/40 py-1.5 text-xs hover:bg-bg-hover">
                Configure
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
