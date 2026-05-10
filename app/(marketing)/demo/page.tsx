"use client";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Brain,
  ChevronRight,
  Lock,
  Search,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
  BarChart3,
  Bell,
  Settings,
  Shield,
  MessageSquare,
  Package,
  DollarSign,
  Activity,
} from "lucide-react";
import { useState, useEffect } from "react";

const LOCKED_NAV = [
  { icon: BarChart3, label: "Command Center", locked: false },
  { icon: Search, label: "Trend Hunter", locked: true },
  { icon: ShoppingBag, label: "Product Discovery", locked: true },
  { icon: Users, label: "Buyer Discovery", locked: true },
  { icon: MessageSquare, label: "AI Outreach", locked: true },
  { icon: TrendingUp, label: "Demand Intel", locked: true },
  { icon: Package, label: "Suppliers", locked: true },
  { icon: DollarSign, label: "Deals & Pipeline", locked: true },
  { icon: Bot, label: "Agent Store", locked: true },
  { icon: Shield, label: "Risk Center", locked: true },
  { icon: Activity, label: "Reports", locked: true },
  { icon: Settings, label: "Settings", locked: true },
];

// METRICS are now dynamic — see liveProducts/liveBuyers/liveMsgs state in DemoPage

const DEMO_PRODUCTS = [
  { name: "Portable Blender Pro", category: "Home & Kitchen", score: 94, profit: "$18.45", trend: "🔥" },
  { name: "LED Ring Light 18\"", category: "Electronics", score: 91, profit: "$24.20", trend: "🔥" },
  { name: "Pet Hair Remover Roller", category: "Pet Supplies", score: 89, profit: "$16.72", trend: "↑" },
  { name: "Resistance Band Set", category: "Fitness", score: 87, profit: "$12.50", trend: "↑" },
  { name: "Silicone Storage Bags", category: "Kitchen", score: 85, profit: "$9.80", trend: "↑" },
];

// AGENTS feed is rendered inline using live state counters in DemoPage

export default function DemoPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "products" | "agents">("overview");
  const [showGate, setShowGate] = useState(false);

  // Slowly tick up live counters to simulate real activity
  const [liveProducts, setLiveProducts] = useState(25397);
  const [liveBuyers, setLiveBuyers] = useState(16842);
  const [liveMsgs, setLiveMsgs] = useState(6735);
  useEffect(() => {
    const t = setInterval(() => {
      const r = Math.random();
      if (r < 0.4) setLiveProducts((n) => n + Math.floor(Math.random() * 3) + 1);
      else if (r < 0.7) setLiveBuyers((n) => n + 1);
      else setLiveMsgs((n) => n + 1);
    }, 2800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "#07071a" }}>
      {/* Demo banner */}
      <div
        className="sticky top-16 z-40 flex items-center justify-between px-6 py-2.5"
        style={{ background: "linear-gradient(90deg, #3b0764, #1e1b4b)", borderBottom: "1px solid rgba(124,58,237,0.3)" }}
      >
        <div className="flex items-center gap-4 text-sm">
          <Link
            href="/welcome"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-all hover:bg-white/10"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            <ArrowLeft className="h-3 w-3" /> Home
          </Link>
          <div className="h-3.5 w-px" style={{ background: "rgba(255,255,255,0.15)" }} />
          <div className="flex items-center gap-2.5">
            <div className="h-2 w-2 rounded-full bg-yellow-400" style={{ animation: "demoPulse 1.5s ease-in-out infinite" }} />
            <span className="font-semibold text-white">Demo Preview</span>
            <span className="hidden sm:inline" style={{ color: "rgba(255,255,255,0.5)" }}>— You&apos;re viewing a locked simulation. Real data requires access.</span>
          </div>
        </div>
        <Link
          href="/signup"
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 0 12px rgba(124,58,237,0.5)" }}
        >
          Start Free Trial <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="flex" style={{ minHeight: "calc(100vh - 112px)" }}>
        {/* Sidebar */}
        <aside
          className="hidden w-56 shrink-0 border-r lg:block"
          style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(7,7,26,0.95)" }}
        >
          <div className="p-4">
            <div className="flex items-center gap-2 mb-6">
              <div
                className="grid h-7 w-7 place-items-center rounded-lg"
                style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
              >
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">AVYN Commerce</div>
                <div className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>Demo Workspace</div>
              </div>
            </div>
            <nav className="space-y-0.5">
              {LOCKED_NAV.map(({ icon: Icon, label, locked }) => (
                <button
                  key={label}
                  onClick={() => locked && setShowGate(true)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-all"
                  style={{
                    background: !locked ? "rgba(124,58,237,0.15)" : "transparent",
                    color: locked ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.9)",
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </div>
                  {locked && <Lock className="h-3 w-3 opacity-50" />}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 overflow-auto">
          {/* Topbar */}
          <div
            className="flex items-center justify-between border-b px-6 py-3"
            style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(13,13,31,0.9)" }}
          >
            <div>
              <h1 className="text-sm font-bold text-white">Command Center</h1>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                Live agent activity · Demo data
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                <div className="h-1.5 w-1.5 rounded-full bg-green-400" />
                9 agents running
              </div>
              <button
                onClick={() => setShowGate(true)}
                className="rounded-lg border px-3 py-1.5 text-xs transition-all hover:bg-white/5"
                style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
              >
                <Bell className="inline h-3 w-3 mr-1" />
                Alerts
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Metric cards — live-updating */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                { label: "Products Found", value: liveProducts.toLocaleString(), delta: "+12%", color: "#a78bfa" },
                { label: "Buyers Discovered", value: liveBuyers.toLocaleString(), delta: "+8%", color: "#22d3ee" },
                { label: "Outreach Sent", value: liveMsgs.toLocaleString(), delta: "+18%", color: "#22c55e" },
                { label: "Pipeline Value", value: "$2.48M", delta: "+31%", color: "#f59e0b" },
              ].map((m) => (
                <div
                  key={m.label}
                  className="rounded-xl border p-4"
                  style={{ background: "rgba(13,13,31,0.8)", borderColor: "rgba(255,255,255,0.07)" }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-400" style={{ boxShadow: "0 0 4px #22c55e" }} />
                    <div className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Live</div>
                  </div>
                  <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>{m.label}</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: m.color }}>{m.value}</div>
                  <div className="mt-0.5 text-[10px] font-semibold text-green-400">{m.delta} this week</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 rounded-xl border p-1" style={{ background: "rgba(13,13,31,0.8)", borderColor: "rgba(255,255,255,0.06)", width: "fit-content" }}>
              {(["overview", "products", "agents"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="rounded-lg px-4 py-1.5 text-xs font-semibold capitalize transition-all"
                  style={{
                    background: activeTab === tab ? "rgba(124,58,237,0.2)" : "transparent",
                    color: activeTab === tab ? "#c4b5fd" : "rgba(255,255,255,0.35)",
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {activeTab === "overview" && (
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Revenue chart placeholder */}
                <div
                  className="relative overflow-hidden rounded-2xl border p-5"
                  style={{ background: "rgba(13,13,31,0.8)", borderColor: "rgba(255,255,255,0.07)" }}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">Revenue Pipeline</div>
                      <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>Last 12 months</div>
                    </div>
                    <button
                      onClick={() => setShowGate(true)}
                      className="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px]"
                      style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}
                    >
                      <Lock className="h-3 w-3" /> Full data
                    </button>
                  </div>
                  {/* Fake chart bars */}
                  <div className="flex items-end gap-1.5 h-32">
                    {[40, 55, 45, 65, 72, 60, 80, 75, 90, 85, 95, 100].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t-sm" style={{
                        height: `${h}%`,
                        background: i >= 9 ? "rgba(124,58,237,0.6)" : "rgba(124,58,237,0.2)",
                      }} />
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                    <span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span>
                  </div>
                  {/* Blur overlay on right half */}
                  <div
                    className="absolute inset-y-0 right-0 w-1/2 flex items-center justify-center"
                    style={{ background: "linear-gradient(to right, transparent, rgba(13,13,31,0.97))", backdropFilter: "blur(2px)" }}
                  >
                    <button
                      onClick={() => setShowGate(true)}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                      style={{ background: "rgba(124,58,237,0.3)", border: "1px solid rgba(124,58,237,0.4)" }}
                    >
                      <Lock className="h-3 w-3" /> Unlock chart
                    </button>
                  </div>
                </div>

                {/* Agent activity */}
                <div
                  className="rounded-2xl border p-5"
                  style={{ background: "rgba(13,13,31,0.8)", borderColor: "rgba(255,255,255,0.07)" }}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="text-sm font-semibold text-white">Live Agent Activity</div>
                    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                      <span className="h-1.5 w-1.5 rounded-full bg-green-400" style={{ boxShadow: "0 0 4px #22c55e" }} />
                      9 agents running
                    </div>
                  </div>
                  <div className="space-y-3">
                    {[
                      { name: "Trend Hunter", status: "Running", task: `Scanning TikTok Shop, Amazon, Etsy… ${liveProducts.toLocaleString()} found`, color: "#a78bfa" },
                      { name: "Buyer Discovery", status: "Running", task: `${liveBuyers.toLocaleString()} qualified buyers discovered today`, color: "#22d3ee" },
                      { name: "Outreach Agent", status: "Running", task: `${liveMsgs.toLocaleString()} personalized messages sent (48 replies)`, color: "#22c55e" },
                      { name: "Demand Intel", status: "Analyzing", task: "Scoring 1,200 products for Q3 demand...", color: "#f59e0b" },
                    ].map((agent) => (
                      <div key={agent.name} className="flex items-start gap-3">
                        <div
                          className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                          style={{ background: `${agent.color}18` }}
                        >
                          <Bot className="h-3.5 w-3.5" style={{ color: agent.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">{agent.name}</span>
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                              style={{ background: `${agent.color}20`, color: agent.color }}
                            >
                              ● {agent.status}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                            {agent.task}
                          </div>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => setShowGate(true)}
                      className="mt-2 w-full rounded-lg border py-2 text-xs text-center transition-all hover:bg-white/5"
                      style={{ borderColor: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.35)" }}
                    >
                      <Lock className="inline h-3 w-3 mr-1" /> View all 9 agents
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "products" && (
              <div
                className="relative rounded-2xl border overflow-hidden"
                style={{ background: "rgba(13,13,31,0.8)", borderColor: "rgba(255,255,255,0.07)" }}
              >
                <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <div className="text-sm font-semibold text-white">Top Opportunities Today</div>
                  <button
                    onClick={() => setShowGate(true)}
                    className="flex items-center gap-1 text-[11px]"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                  >
                    <Lock className="h-3 w-3" /> 25,397 more
                  </button>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <th className="px-5 py-3 text-left font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>#</th>
                      <th className="px-5 py-3 text-left font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>Product</th>
                      <th className="px-5 py-3 text-left font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>Category</th>
                      <th className="px-5 py-3 text-right font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>Score</th>
                      <th className="px-5 py-3 text-right font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>Profit/unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEMO_PRODUCTS.map((p, i) => (
                      <tr
                        key={p.name}
                        className="cursor-pointer transition-all hover:bg-white/3"
                        onClick={() => setShowGate(true)}
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", opacity: i > 2 ? 0.5 : 1 }}
                      >
                        <td className="px-5 py-3 text-white/30">{i + 1}</td>
                        <td className="px-5 py-3 font-medium text-white">
                          {p.trend} {p.name}
                        </td>
                        <td className="px-5 py-3" style={{ color: "rgba(255,255,255,0.4)" }}>{p.category}</td>
                        <td className="px-5 py-3 text-right">
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                            {p.score}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold" style={{ color: "#a78bfa" }}>{p.profit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Lock overlay on bottom */}
                <div
                  className="absolute bottom-0 left-0 right-0 flex items-end justify-center pb-6 pt-20"
                  style={{ background: "linear-gradient(to top, rgba(13,13,31,1) 40%, transparent)" }}
                >
                  <button
                    onClick={() => setShowGate(true)}
                    className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 0 20px rgba(124,58,237,0.4)" }}
                  >
                    <Lock className="h-4 w-4" /> Unlock 25,392 more products
                  </button>
                </div>
              </div>
            )}

            {activeTab === "agents" && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { name: "Trend Hunter", desc: "Scanning 9 platforms", stat: "25,397 found", color: "#a78bfa", locked: false },
                  { name: "Buyer Discovery", desc: "Finding decision-makers", stat: "16,842 prospects", color: "#22d3ee", locked: false },
                  { name: "Outreach Agent", desc: "Email · SMS · LinkedIn", stat: "6,735 sent", color: "#22c55e", locked: true },
                  { name: "Negotiation Agent", desc: "Handles objections", stat: "48 active threads", color: "#f59e0b", locked: true },
                  { name: "Demand Intel", desc: "Scores 0–100", stat: "Demand: 98", color: "#06b6d4", locked: true },
                  { name: "Deal Closer", desc: "Pipeline automation", stat: "$2.48M pipeline", color: "#ec4899", locked: true },
                  { name: "Supplier Finder", desc: "Verified manufacturers", stat: "7,389 verified", color: "#8b5cf6", locked: true },
                  { name: "Risk Agent", desc: "Quality control", stat: "234 flagged", color: "#ef4444", locked: true },
                  { name: "Learning Agent", desc: "Gets smarter weekly", stat: "98.7% accuracy", color: "#10b981", locked: true },
                ].map((agent) => (
                  <div
                    key={agent.name}
                    className="relative overflow-hidden rounded-xl border p-4 transition-all"
                    style={{ background: "rgba(13,13,31,0.8)", borderColor: agent.locked ? "rgba(255,255,255,0.06)" : `${agent.color}30` }}
                  >
                    <div className="flex items-start justify-between">
                      <div
                        className="grid h-9 w-9 place-items-center rounded-lg"
                        style={{ background: `${agent.color}15` }}
                      >
                        <Bot className="h-4.5 w-4.5" style={{ color: agent.color, height: 18, width: 18 }} />
                      </div>
                      {agent.locked ? (
                        <button
                          onClick={() => setShowGate(true)}
                          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
                          style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.3)" }}
                        >
                          <Lock className="h-2.5 w-2.5" /> Locked
                        </button>
                      ) : (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${agent.color}20`, color: agent.color }}>
                          ● Running
                        </span>
                      )}
                    </div>
                    <div className="mt-3">
                      <div className="text-sm font-semibold text-white">{agent.name}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{agent.desc}</div>
                      <div
                        className="mt-2 text-sm font-bold"
                        style={{ color: agent.locked ? "rgba(255,255,255,0.2)" : agent.color, filter: agent.locked ? "blur(4px)" : "none" }}
                      >
                        {agent.stat}
                      </div>
                    </div>
                    {agent.locked && (
                      <div
                        className="absolute inset-0 flex items-center justify-center cursor-pointer"
                        onClick={() => setShowGate(true)}
                        style={{ background: "rgba(7,7,26,0.6)", backdropFilter: "blur(1px)" }}
                      >
                        <div className="text-center">
                          <Lock className="h-5 w-5 mx-auto mb-1" style={{ color: "rgba(255,255,255,0.3)" }} />
                          <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>Request access</div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Access gate modal */}
      {showGate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(7,7,26,0.85)", backdropFilter: "blur(12px)" }}
          onClick={() => setShowGate(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border p-8 text-center"
            style={{ background: "rgba(13,13,31,0.98)", borderColor: "rgba(124,58,237,0.3)", boxShadow: "0 0 60px rgba(124,58,237,0.2)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl"
              style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.2), rgba(79,70,229,0.2))", border: "1px solid rgba(124,58,237,0.3)" }}
            >
              <Brain className="h-8 w-8 text-violet-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">This feature is locked</h2>
            <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
              You&apos;re viewing a demo preview. Get full access to unlock all 9 agents, real-time data, and your personalized AI setup.
            </p>

            <div className="my-6 grid grid-cols-2 gap-3">
              {[
                { icon: Zap, label: "All 9 agents live" },
                { icon: TrendingUp, label: "Real market data" },
                { icon: Users, label: "Buyer prospects" },
                { icon: Sparkles, label: "AI personalized" },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-2 rounded-lg border p-2.5 text-left text-xs"
                  style={{ borderColor: "rgba(124,58,237,0.2)", background: "rgba(124,58,237,0.08)", color: "#c4b5fd" }}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {label}
                </div>
              ))}
            </div>

            <Link
              href="/signup"
              className="flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 0 24px rgba(124,58,237,0.5)" }}
            >
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Link>
            <button
              onClick={() => setShowGate(false)}
              className="mt-3 w-full text-xs"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              Continue demo preview
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes demoPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}
