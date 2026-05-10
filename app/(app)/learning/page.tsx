"use client";
import {
  Brain,
  ChevronRight,
  ChevronUp,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

const PROMPT_VERSIONS = [
  { v: "v2.4", deployed: "May 18", replyRate: 14.9, change: "+2.1pp", winner: true, samples: 412 },
  { v: "v2.3", deployed: "May 04", replyRate: 12.8, change: "+0.8pp", samples: 380 },
  { v: "v2.2", deployed: "Apr 18", replyRate: 12.0, change: "−0.4pp", samples: 297 },
  { v: "v2.1", deployed: "Apr 02", replyRate: 12.4, change: "+1.2pp", samples: 311 },
  { v: "v2.0", deployed: "Mar 14", replyRate: 11.2, change: "—", samples: 248 },
];

const WINNERS = [
  { product: "Pet Hair Remover Roller", reason: "Right buyer match · low competition", lift: "+38% reply" },
  { product: "Workout Resistance Bands", reason: "Volume discount played well", lift: "+22% close" },
  { product: "Smart Water Bottle", reason: "Technical buyer industry · long sequences win", lift: "+18% reply" },
];

const LOSERS = [
  { product: "Magnetic Eyelashes", reason: "Saturated · no margin room", lift: "−14% reply" },
  { product: "Standing Desk Converter", reason: "Buyer cycle too long for current sequences", lift: "−9% close" },
];

const RECOMMENDATIONS = [
  {
    t: "Switch outreach send time to 7:30am ET",
    d: "Replies arriving from US East 30% earlier when sent before market open. Projected +1.6pp reply rate.",
    confidence: 87,
  },
  {
    t: "Drop Day-14 follow-up step entirely",
    d: "Last 240 sends at Day-14 produced 0 replies and 6 unsubs. Removing it improves domain reputation.",
    confidence: 92,
  },
  {
    t: "Use Haiku 4.5 for first-touch drafts",
    d: "Quality matched Sonnet 4.6 within 2pp on first-touch only. Saves $0.0006/email × 25K sends = $15/mo per agent.",
    confidence: 78,
  },
];

export default function LearningPage() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Learning Engine</h1>
            <p className="text-xs text-ink-secondary">
              Self-tuning: prompt experiments, source ROI, pricing curves
            </p>
          </div>
        </div>
      </div>

      {/* Preview banner */}
      <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/5 px-4 py-3">
        <div className="flex items-start gap-3 text-[12px]">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-amber/15">
            <Brain className="h-3.5 w-3.5 text-accent-amber" />
          </div>
          <div className="flex-1">
            <span className="font-semibold text-accent-amber">Showcase — every number on this page is illustrative</span>
            <span className="text-ink-secondary">
              {" "}
              — Prompt versioning + auto-tuning is in the roadmap. Today the agents use fixed
              system prompts (see <code className="rounded bg-bg-hover px-1 text-[10px]">lib/agents/*.ts</code>).
              Real per-agent token spend and success rates already land on{" "}
              <a href="/agents" className="text-brand-300 hover:text-brand-200 underline">/agents</a>{" "}
              and{" "}
              <a href="/reports" className="text-brand-300 hover:text-brand-200 underline">/reports</a>.
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Prompt versions tested" v="14" />
        <Stat label="Active experiments" v="4" />
        <Stat label="Reply rate (current)" v="14.9%" delta="+2.1pp" up />
        <Stat label="Token spend ↓" v="−$182/wk" delta="cheap-tier routing" up />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-bg-border bg-bg-card">
          <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
            <div className="text-sm font-semibold">Outreach prompt evolution</div>
            <span className="rounded bg-bg-hover px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-tertiary">Sample</span>
          </div>
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">Version</th>
                <th className="px-3 py-2.5 text-left font-medium">Deployed</th>
                <th className="px-3 py-2.5 text-right font-medium">Reply Rate</th>
                <th className="px-3 py-2.5 text-right font-medium">Δ</th>
                <th className="px-5 py-2.5 text-right font-medium">Samples</th>
              </tr>
            </thead>
            <tbody>
              {PROMPT_VERSIONS.map((p) => (
                <tr key={p.v} className="border-t border-bg-border">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{p.v}</span>
                      {p.winner && (
                        <span className="rounded-md bg-accent-green/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-green">
                          Winner
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-ink-secondary">{p.deployed}</td>
                  <td className="px-3 py-3 text-right font-semibold">{p.replyRate}%</td>
                  <td
                    className={`px-3 py-3 text-right ${
                      p.change.startsWith("+") ? "text-accent-green" : p.change.startsWith("−") ? "text-accent-red" : "text-ink-tertiary"
                    }`}
                  >
                    {p.change}
                  </td>
                  <td className="px-5 py-3 text-right text-ink-secondary">{p.samples}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        <div className="rounded-xl border border-bg-border bg-bg-card">
          <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
            <div className="text-sm font-semibold">Lead source ROI (last 90d)</div>
            <span className="rounded bg-bg-hover px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-tertiary">Sample</span>
          </div>
          <div className="space-y-2.5 p-5">
            {[
              { src: "TikTok velocity", roi: 9852, color: "#7c3aed" },
              { src: "Reddit", roi: 7257, color: "#a87dff" },
              { src: "Amazon BSR", roi: 6868, color: "#3b82f6" },
              { src: "Google Trends", roi: 4961, color: "#06b6d4" },
              { src: "Apollo enrichment", roi: 4120, color: "#22c55e" },
              { src: "LinkedIn Sales Nav", roi: 2410, color: "#f59e0b" },
            ].map((s, i) => {
              const max = 9852;
              const pct = (s.roi / max) * 100;
              return (
                <div key={s.src}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-secondary">{s.src}</span>
                    <span className="font-semibold text-accent-green">{s.roi.toLocaleString()}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-hover">
                    <div
                      className="h-full"
                      style={{ width: `${pct}%`, background: s.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-bg-border bg-bg-card">
          <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-accent-green" /> Patterns that won
            </div>
            <span className="rounded bg-bg-hover px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-tertiary">Sample</span>
          </div>
          <ul className="divide-y divide-bg-border">
            {WINNERS.map((w) => (
              <li key={w.product} className="px-5 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{w.product}</span>
                  <span className="text-xs font-semibold text-accent-green">{w.lift}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-ink-tertiary">{w.reason}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-bg-border bg-bg-card">
          <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <TrendingDown className="h-4 w-4 text-accent-red" /> Patterns that lost
            </div>
            <span className="rounded bg-bg-hover px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-tertiary">Sample</span>
          </div>
          <ul className="divide-y divide-bg-border">
            {LOSERS.map((l) => (
              <li key={l.product} className="px-5 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{l.product}</span>
                  <span className="text-xs font-semibold text-accent-red">{l.lift}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-ink-tertiary">{l.reason}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-300" />
          <h2 className="text-base font-semibold">AI improvement recommendations</h2>
          <span className="rounded bg-bg-hover px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-tertiary">Sample</span>
        </div>
        <div className="space-y-3">
          {RECOMMENDATIONS.map((r) => (
            <div
              key={r.t}
              className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-5"
            >
              <div className="flex items-start gap-4">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-500/20">
                  <Brain className="h-4 w-4 text-brand-200" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{r.t}</span>
                    <span className="rounded-md bg-brand-500/20 px-2 py-0.5 text-[10px] font-semibold text-brand-200">
                      {r.confidence}% confidence
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-secondary">{r.d}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      disabled
                      title="Learning engine ships in roadmap"
                      className="flex items-center gap-1 rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow opacity-40 cursor-not-allowed"
                    >
                      Apply <ChevronRight className="h-3 w-3" />
                    </button>
                    <button
                      disabled
                      title="A/B test runner ships in roadmap"
                      className="rounded-md border border-bg-border bg-bg-hover/40 px-3 py-1.5 text-xs opacity-40 cursor-not-allowed"
                    >
                      Run as A/B test
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, v, delta, up }: { label: string; v: string | number; delta?: string; up?: boolean }) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className="mt-1 text-2xl font-bold">{v}</div>
      {delta && (
        <div
          className={`mt-1 flex items-center gap-1 text-[11px] font-semibold ${
            up ? "text-accent-green" : "text-accent-red"
          }`}
        >
          <ChevronUp className={`h-3 w-3 ${up ? "" : "rotate-180"}`} />
          {delta}
        </div>
      )}
    </div>
  );
}
