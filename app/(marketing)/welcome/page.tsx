// AVYN Commerce welcome page — brand v2.0 (post-rebrand)
// Touch this comment to force Netlify to re-prerender the static HTML
// when the build cache thinks nothing has changed.
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight, Brain, Play, TrendingUp, Users, Package, Send,
  CheckCircle2, Star, Bot, Factory, MessageSquare, Workflow,
  ShieldAlert, Search, Target, X, BarChart3, Zap, Shield, Clock, Menu,
} from "lucide-react";
import { PLANS } from "@/lib/billing";
import dynamic from "next/dynamic";
import { AnimatedStatCard, AgentPill } from "@/components/HeroBrain";
import { AvynMark, AvynWordmark } from "@/components/AvynLogo";

// Load Three.js canvas only on client (no SSR)
const HeroBrain = dynamic(() => import("@/components/HeroBrain").then(m => ({ default: m.HeroBrain })), { ssr: false, loading: () => <div style={{ width: "100%", height: 520 }} /> });

// ─── Data ────────────────────────────────────────────────────────────────────
const BOTTOM_STATS = [
  { value: "12,458+", label: "Active Users", Icon: Users },
  { value: "2.4M+", label: "Products Scanned", Icon: Package },
  { value: "16.8K+", label: "Buyers Discovered", Icon: Users },
  { value: "$1.24B+", label: "Revenue Generated", Icon: TrendingUp },
  { value: "98.7%", label: "AI Accuracy Rate", Icon: Brain },
];

const LOGOS = [
  "FitLife Stores", "ActiveGear Co.", "Petopia Boutique", "GlowUp Beauty",
  "Urban Essentials", "TechWorld Hub", "MamaBear Co.", "Outback Gear",
];

const FLOW_STEPS = [
  { n: "01", label: "Scan",      desc: "AI watches 9 platforms 24/7",   Icon: Search,      color: "#7c3aed" },
  { n: "02", label: "Score",     desc: "Demand index 0–100",            Icon: BarChart3,   color: "#a87dff" },
  { n: "03", label: "Source",    desc: "Verified suppliers ranked",     Icon: Factory,     color: "#3b82f6" },
  { n: "04", label: "Find",      desc: "Buyers + decision-makers",      Icon: Users,       color: "#06b6d4" },
  { n: "05", label: "Reach",     desc: "Personalised email/LI",        Icon: Send,        color: "#22c55e" },
  { n: "06", label: "Reply",     desc: "AI handles responses",         Icon: MessageSquare, color: "#10b981" },
  { n: "07", label: "Negotiate", desc: "Counter-offers + objections",  Icon: Workflow,    color: "#f59e0b" },
  { n: "08", label: "Quote",     desc: "Auto-built proposals",         Icon: Zap,         color: "#ef4444" },
  { n: "09", label: "Close",     desc: "Escrow + fees",               Icon: CheckCircle2, color: "#22c55e" },
];

const FEATURES = [
  { Icon: Search,      title: "Trend Hunter",        desc: "Scans TikTok, Reddit, Amazon & Alibaba every hour. Surfaces winning products before they peak.",                                           tag: "Product Discovery" },
  { Icon: TrendingUp,  title: "Demand Intelligence", desc: "Multi-signal scoring engine — search volume, social momentum, competition, and margin — all in one number.",                               tag: "Analytics" },
  { Icon: Users,       title: "Buyer Discovery",     desc: "Finds qualified retailers, boutiques, and distributors. Enriches contacts with email, LinkedIn, and buying signals.",                     tag: "Lead Gen" },
  { Icon: Send,        title: "Outreach Automation", desc: "Personalised multi-step email and LinkedIn sequences. AI writes each message based on the buyer's business context.",                      tag: "Outreach" },
  { Icon: MessageSquare, title: "Negotiation Agent", desc: "Handles objections, follows up, books calls. Knows when to hold, when to discount, when to escalate to you.",                             tag: "Deals" },
  { Icon: ShieldAlert, title: "Risk Center",         desc: "Flags counterfeit risk, trademark hits, supplier fraud signals, and compliance issues before you commit.",                                tag: "Protection" },
];

const AGENTS = [
  { Icon: Search,       name: "Trend Hunter",       desc: "Scans 9 platforms 24/7",   color: "#7c3aed" },
  { Icon: TrendingUp,   name: "Demand Intelligence",desc: "Scores demand 0–100",       color: "#a87dff" },
  { Icon: Factory,      name: "Supplier Finder",    desc: "Verified manufacturers",    color: "#3b82f6" },
  { Icon: Users,        name: "Buyer Discovery",    desc: "Finds decision-makers",     color: "#06b6d4" },
  { Icon: Send,         name: "Outreach Agent",     desc: "Email · SMS · LinkedIn",    color: "#22c55e" },
  { Icon: MessageSquare,name: "Negotiation Agent",  desc: "Handles objections",        color: "#10b981" },
  { Icon: Workflow,     name: "CRM Intelligence",   desc: "Scores + routes leads",     color: "#f59e0b" },
  { Icon: ShieldAlert,  name: "Risk Agent",         desc: "Fraud + trademark radar",   color: "#ef4444" },
  { Icon: Bot,          name: "Learning Agent",     desc: "Optimises prompts weekly",  color: "#8b5cf6" },
];

const TESTIMONIALS = [
  { quote: "We went from 0 to $180K in wholesale revenue in 4 months. The Outreach Agent alone books 8–12 retailer calls a week without us lifting a finger.", name: "James Mitchell", role: "Founder", company: "ActiveGear Co.", initials: "JM", stars: 5 },
  { quote: "I replaced an entire BizDev hire with AVYN Commerce. The agents find better buyers, write better emails, and never sleep. ROI was positive in week one.", name: "Sarah Kim", role: "CEO", company: "GlowUp Beauty", initials: "SK", stars: 5 },
  { quote: "The Demand Intelligence score is eerily accurate. We pivoted our product line based on it and caught the portable blender trend 6 weeks before our competitors.", name: "Alex Patel", role: "Head of Commerce", company: "FitLife Stores", initials: "AP", stars: 5 },
];

// ─── Navbar ──────────────────────────────────────────────────────────────────
const NAV_LINKS = [
  { label: "Product",    href: "#features" },
  { label: "Solutions",  href: "#agents" },
  { label: "Demo",       href: "/demo" },
  { label: "Pricing",    href: "#pricing" },
  { label: "Enterprise", href: "/contact" },
];

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 20); }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 transition-all duration-300"
      style={{
        background: scrolled
          ? "rgba(7,7,26,0.88)"
          : "transparent",
        backdropFilter: scrolled ? "blur(16px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "1px solid transparent",
      }}
    >
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-6 py-4">
        {/* Logo */}
        <Link href="/welcome" className="flex shrink-0 items-center gap-2.5">
          <div
            className="grid h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: "#0a0014", boxShadow: "0 0 14px rgba(147,51,234,0.45)" }}
          >
            <AvynMark size={26} />
          </div>
          <span className="flex items-baseline gap-1 text-sm font-bold">
            <AvynWordmark /><span className="text-white">Commerce</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map(l => (
            <a
              key={l.label}
              href={l.href}
              className="rounded-lg px-3 py-2 text-sm text-white/55 transition hover:bg-white/6 hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </nav>

        {/* Desktop actions */}
        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/signin"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:bg-white/8 hover:text-white"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)", boxShadow: "0 0 18px rgba(124,58,237,0.4)" }}
          >
            Start Free Trial <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 md:hidden"
        >
          {mobileOpen ? <X className="h-4 w-4 text-white/70" /> : <Menu className="h-4 w-4 text-white/70" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div
          className="border-t border-white/8 px-6 pb-5 pt-3 md:hidden"
          style={{ background: "rgba(7,7,26,0.96)", backdropFilter: "blur(16px)" }}
        >
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map(l => (
              <a
                key={l.label}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-white/60 transition hover:bg-white/6 hover:text-white"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2">
            <Link href="/signin" onClick={() => setMobileOpen(false)} className="rounded-xl border border-white/10 bg-white/5 py-2.5 text-center text-sm text-white/70">Sign In</Link>
            <Link href="/signup" onClick={() => setMobileOpen(false)} className="rounded-xl py-2.5 text-center text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>Start Free Trial</Link>
          </div>
        </div>
      )}
    </header>
  );
}

// ─── Hero center: CSS 3D cube + Three.js star field behind + animated cards ───
const S = 160; // cube face depth

function HeroCenter() {
  return (
    <div className="relative flex items-center justify-center mx-auto" style={{ width: "min(520px, 100%)", height: 560 }}>

      {/* Three.js star field + orbit rings BEHIND the cube */}
      <div className="absolute inset-0" style={{ zIndex: 1 }}>
        <HeroBrain />
      </div>

      {/* Orbital rings (CSS) for depth feel */}
      <div className="orbit-ring-outer absolute rounded-full border border-violet-500/20" style={{ width: 440, height: 440, top: "50%", left: "50%", transform: "translate(-50%, -54%) rotateX(75deg)", zIndex: 2 }} />
      <div className="orbit-ring-mid absolute rounded-full border border-violet-400/25"   style={{ width: 320, height: 320, top: "50%", left: "50%", transform: "translate(-50%, -54%) rotateX(75deg)", zIndex: 2 }} />

      {/* Spinning dot nodes on orbits */}
      <div className="orbital-1 absolute" style={{ width: 380, height: 380, top: "50%", left: "50%", transform: "translate(-50%, -54%)", transformStyle: "preserve-3d", zIndex: 3 }}>
        <div className="absolute inset-0 rounded-full border border-violet-500/0" style={{ transform: "rotateX(72deg)" }}>
          <div className="orb-dot-1 absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-violet-400 shadow-[0_0_12px_#a87dff]" />
        </div>
      </div>
      <div className="orbital-2 absolute" style={{ width: 300, height: 300, top: "50%", left: "50%", transform: "translate(-50%, -54%)", transformStyle: "preserve-3d", zIndex: 3 }}>
        <div className="absolute inset-0 rounded-full border border-cyan-500/0" style={{ transform: "rotateX(72deg) rotateZ(60deg)" }}>
          <div className="orb-dot-2 absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_#06b6d4]" />
        </div>
      </div>

      {/* Ambient glow pulse */}
      <div className="cube-ambient absolute rounded-full" style={{ width: 280, height: 280, top: "50%", left: "50%", transform: "translate(-50%, -54%)", background: "radial-gradient(circle, rgba(124,58,237,0.45) 0%, transparent 70%)", filter: "blur(32px)", zIndex: 2 }} />

      {/* ── The real rotating CSS 3D cube ── */}
      <div style={{ perspective: "900px", width: 220, height: 220, position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -58%)", zIndex: 5 }}>
        <div className="cube-3d" style={{ width: "100%", height: "100%", position: "relative", transformStyle: "preserve-3d" }}>
          {/* Front */}
          <div className="cube-face cube-front" style={{ position: "absolute", inset: 0, transform: `translateZ(${S/1.38}px)`, background: "linear-gradient(135deg,#1a0d40,#0d0820)", border: "1px solid rgba(168,125,255,0.5)", borderRadius: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, backfaceVisibility: "hidden" }}>
            <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/60 to-transparent" />
            <Brain className="h-16 w-16 text-violet-300" style={{ filter: "drop-shadow(0 0 24px rgba(168,125,255,0.9))" }} />
            <div className="text-center text-[11px] font-black uppercase tracking-widest text-violet-200">AVYN<br /><span className="text-violet-300">Commerce</span></div>
          </div>
          {/* Back */}
          <div className="cube-face" style={{ position: "absolute", inset: 0, transform: `rotateY(180deg) translateZ(${S/1.38}px)`, background: "linear-gradient(135deg,#0d1a40,#080d20)", border: "1px solid rgba(99,179,237,0.3)", borderRadius: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, backfaceVisibility: "hidden" }}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-blue-300/60">Live Stats</div>
            <div className="text-2xl font-black text-blue-300">$1.24B</div>
            <div className="text-[10px] text-blue-200/50">Revenue Generated</div>
            <div className="mt-2 text-xl font-black text-cyan-300">98.7%</div>
            <div className="text-[10px] text-cyan-200/50">AI Accuracy</div>
          </div>
          {/* Right */}
          <div className="cube-face" style={{ position: "absolute", inset: 0, transform: `rotateY(90deg) translateZ(${S/1.38}px)`, background: "linear-gradient(135deg,#0a1a2e,#06101c)", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, backfaceVisibility: "hidden" }}>
            <div className="text-[9px] font-bold uppercase tracking-widest text-cyan-300/60">Buyers Found</div>
            <div className="text-2xl font-black text-cyan-300">16.8K</div>
            <div className="mt-2 text-[9px] font-bold uppercase tracking-widest text-emerald-300/60">Products</div>
            <div className="text-2xl font-black text-emerald-300">2.4M+</div>
          </div>
          {/* Left */}
          <div className="cube-face" style={{ position: "absolute", inset: 0, transform: `rotateY(-90deg) translateZ(${S/1.38}px)`, background: "linear-gradient(135deg,#1a0a2e,#100620)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, backfaceVisibility: "hidden" }}>
            <div className="text-[9px] font-bold uppercase tracking-widest text-purple-300/60">Agents Active</div>
            <div className="text-2xl font-black text-purple-300">9</div>
            <div className="mt-2 text-[9px] font-bold uppercase tracking-widest text-amber-300/60">Deals Closed</div>
            <div className="text-2xl font-black text-amber-300">12K+</div>
          </div>
          {/* Top */}
          <div className="cube-face" style={{ position: "absolute", inset: 0, transform: `rotateX(90deg) translateZ(${S/1.38}px)`, background: "linear-gradient(135deg,#120828,#0a0418)", border: "1px solid rgba(168,125,255,0.2)", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", backfaceVisibility: "hidden" }}>
            <div className="text-center"><div className="text-[10px] font-bold uppercase tracking-widest text-violet-300/50">Uptime</div><div className="text-2xl font-black text-violet-200">99.9%</div></div>
          </div>
          {/* Bottom */}
          <div className="cube-face" style={{ position: "absolute", inset: 0, transform: `rotateX(-90deg) translateZ(${S/1.38}px)`, background: "linear-gradient(135deg,#0a1a14,#060e0a)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", backfaceVisibility: "hidden" }}>
            <div className="text-center"><div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/50">Users</div><div className="text-2xl font-black text-emerald-200">12K+</div></div>
          </div>
        </div>
      </div>

      {/* Animated stat cards */}
      <AnimatedStatCard label="PRODUCT DISCOVERY" numericValue={25397}            sub="Hot Opportunities"  color="#a87dff" delay={0.3} style={{ top: 10,   left: -10,  zIndex: 10, animation: "floatA 6s ease-in-out infinite" }} />
      <AnimatedStatCard label="BUYER DISCOVERY"   numericValue={16842}            sub="Qualified Buyers"   color="#60a5fa" avatars delay={0.5} style={{ top: 15,   right: -10, zIndex: 10, animation: "floatB 8s ease-in-out infinite 1s" }} />
      <AnimatedStatCard label="DEMAND SCORE"      numericValue={98}               sub="Intelligence"       color="#34d399" delta="+12K" delay={0.7} style={{ top: 190,  left: -10,  zIndex: 10, animation: "floatC 7s ease-in-out infinite 2s" }} />
      <AnimatedStatCard label="SUPPLIER INTEL"    numericValue={7389}             sub="Verified Suppliers" color="#fbbf24" delta="+24%" delay={0.9} style={{ top: 190,  right: -10, zIndex: 10, animation: "floatA 9s ease-in-out infinite .5s" }} />
      <AnimatedStatCard label="OUTREACH"          numericValue={6735}             sub="Messages Sent"      color="#22d3ee" delta="+18%" delay={1.1} style={{ bottom: 140, left: -10,  zIndex: 10, animation: "floatB 7.5s ease-in-out infinite 1.5s" }} />
      <AnimatedStatCard label="PIPELINE"          prefix="$" numericValue={2480000} sub="Deals in Pipeline" color="#fb923c" delta="+31%" delay={1.3} style={{ bottom: 155, right: -10, zIndex: 10, animation: "floatC 6.5s ease-in-out infinite 3s" }} />
      <AnimatedStatCard label="REVENUE"           prefix="$" numericValue={1240000} sub="Total Revenue"     color="#34d399" delta="+42%" delay={1.5} style={{ bottom: 70,  right: -10, zIndex: 10, animation: "floatA 8.5s ease-in-out infinite 2.5s" }} />

      {/* Agent pills */}
      <div className="absolute" style={{ bottom: 18, left: "50%", transform: "translateX(-50%)", width: 460, zIndex: 10 }}>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {[
            { label: "Trend Hunter",   color: "#a78bfa" },
            { label: "Demand Analyst", color: "#22d3ee" },
            { label: "Buyer Finder",   color: "#22c55e" },
            { label: "Negotiation",    color: "#f59e0b" },
            { label: "Deal Closer",    color: "#ec4899" },
          ].map((a, i) => (
            <AgentPill key={a.label} label={a.label} color={a.color} delay={1.2 + i * 0.1} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Product Discovery Panel ─────────────────────────────────────────────────
const TOP_OPPS = [
  { rank: "01", name: "Portable Blender",        cat: "Home & Kitchen",   score: 92, profit: "$18.45" },
  { rank: "02", name: "Pet Hair Remover Roller",  cat: "Pet Supplies",     score: 89, profit: "$16.72" },
  { rank: "03", name: "LED Book Reading Light",   cat: "Home Decor",       score: 88, profit: "$14.32" },
  { rank: "04", name: "Silicone Food Storage Bags",cat: "Kitchen",         score: 87, profit: "$15.21" },
  { rank: "05", name: "Workout Resistance Bands", cat: "Sports & Outdoors",score: 86, profit: "$17.65" },
];
const TREND_BARS = [8, 12, 18, 14, 22, 28, 25, 34, 30, 42, 38, 52, 48, 64];

function ProductDiscoveryPanel() {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0d0d20]/95 shadow-2xl backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-violet-600 to-purple-700 shadow-[0_0_12px_rgba(124,58,237,0.6)]">
            <Target className="h-3 w-3 text-white" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-white/80">Product Discovery</span>
        </div>
        <button className="grid h-6 w-6 place-items-center rounded-md text-white/30 hover:bg-white/5"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="flex items-center gap-1 border-b border-white/8 px-3 py-2">
        {["Hot Opportunities", "Trending Now", "Saved (24)"].map((t, i) => (
          <button key={t} className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${i === 0 ? "bg-violet-500/20 text-violet-200" : "text-white/40 hover:text-white/70"}`}>{t}</button>
        ))}
      </div>
      <div className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-white/70">Top Opportunities</span>
          <div className="grid grid-cols-2 gap-4 text-[10px] text-white/30"><span>Score</span><span>Profit</span></div>
        </div>
        <div className="space-y-1.5">
          {TOP_OPPS.map(p => (
            <div key={p.rank} className="grid grid-cols-[20px_1fr_52px_48px] items-center gap-2 rounded-lg bg-white/4 px-2 py-2">
              <span className="text-[10px] text-white/30">{p.rank}</span>
              <div className="min-w-0">
                <div className="truncate text-[11px] font-medium text-white/80">{p.name}</div>
                <div className="truncate text-[10px] text-white/30">{p.cat}</div>
              </div>
              <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-center text-[10px] font-bold text-violet-300">{p.score}</span>
              <span className="text-right text-[10px] font-semibold text-white/70">{p.profit}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-white/8 px-3 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-white/70">Demand Trend</span>
          <div className="flex gap-1">
            {["7D", "30D", "90D"].map((t, i) => (
              <button key={t} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${i === 1 ? "bg-violet-600 text-white" : "text-white/30 hover:text-white/50"}`}>{t}</button>
            ))}
          </div>
        </div>
        <div className="relative h-20 w-full overflow-hidden rounded-md bg-white/4 px-2 pb-2">
          <div className="flex h-full items-end gap-0.5">
            {TREND_BARS.map((v, i) => (
              <div key={i} className="flex-1 rounded-sm bg-violet-500/50 transition-all hover:bg-violet-400/70" style={{ height: `${(v / 64) * 100}%` }} />
            ))}
          </div>
          <div className="absolute bottom-1.5 right-3 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-violet-200">
            May 18 · 25,397 <span className="text-emerald-400">+28.4%</span>
          </div>
        </div>
        <button className="mt-2 w-full text-center text-[11px] text-violet-400 hover:text-violet-300">View Full Analysis →</button>
      </div>
    </div>
  );
}

// ─── Live Activity Ticker ─────────────────────────────────────────────────────
const TICKER_ITEMS = [
  "🔥 Portable Blender trending +184% on TikTok Shop",
  "💼 Outreach Agent sent 12 personalized emails · 3 replied",
  "🏭 Supplier Finder verified 47 manufacturers in Shenzhen",
  "📊 Demand score: LED Ring Light 18\" hit 91/100",
  "🤝 Negotiation Agent secured 5% volume discount",
  "🛒 Buyer Discovery added 23 qualified prospects in pet niche",
  "⚡ New trend: Silicone Food Bags +220% search volume",
  "📬 6 meeting requests booked autonomously today",
  "🔍 Risk Agent flagged 2 suppliers · trademark issues avoided",
  "💰 $48K deal closed via AI negotiation — zero human involvement",
  "📈 Learning Agent improved outreach reply rate by 14%",
  "🚀 CRM Pipeline updated 31 deals to new stages automatically",
];

function LiveTicker() {
  return (
    <div
      className="overflow-hidden border-y py-3"
      style={{ borderColor: "rgba(124,58,237,0.2)", background: "rgba(124,58,237,0.04)" }}
    >
      <style>{`
        @keyframes tickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track { animation: tickerScroll 40s linear infinite; }
        .ticker-track:hover { animation-play-state: paused; }
      `}</style>
      <div className="flex items-center gap-4">
        <div
          className="shrink-0 flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
          style={{ borderColor: "rgba(124,58,237,0.3)", background: "rgba(124,58,237,0.1)", color: "#c4b5fd", whiteSpace: "nowrap" }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-violet-400 shadow-[0_0_6px_#a87dff]" style={{ animation: "ambientPulse 2s ease-in-out infinite" }} />
          Live
        </div>
        <div className="overflow-hidden flex-1">
          <div className="ticker-track flex gap-12 whitespace-nowrap">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
              <span key={i} className="text-[12px] font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function WelcomePage() {
  const [annual, setAnnual] = useState(true);

  return (
    <div className="pb-0">
      <Navbar />
      <style>{`
        @keyframes floatA { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-12px)} }
        @keyframes floatB { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-16px)} }
        @keyframes floatC { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-8px)} }

        @keyframes cubeRotate {
          0%   { transform: rotateX(12deg) rotateY(0deg); }
          100% { transform: rotateX(12deg) rotateY(360deg); }
        }
        .cube-3d { animation: cubeRotate 18s linear infinite; }

        @keyframes orbitSpin1 { from{transform:rotateX(72deg) rotateZ(0deg)} to{transform:rotateX(72deg) rotateZ(360deg)} }
        @keyframes orbitSpin2 { from{transform:rotateX(72deg) rotateZ(60deg)} to{transform:rotateX(72deg) rotateZ(420deg)} }
        .orbital-1 .absolute div { animation: orbitSpin1 8s linear infinite; }
        .orbital-2 .absolute div { animation: orbitSpin2 12s linear infinite reverse; }

        @keyframes ambientPulse {
          0%,100%{opacity:0.8;transform:translate(-50%,-50%) scale(1)}
          50%{opacity:1;transform:translate(-50%,-50%) scale(1.2)}
        }
        .cube-ambient { animation: ambientPulse 4s ease-in-out infinite; }

        @keyframes particleDrift {
          0%,100%{transform:translateY(0px) translateX(0px);opacity:0.5}
          33%{transform:translateY(-8px) translateX(4px);opacity:0.8}
          66%{transform:translateY(4px) translateX(-4px);opacity:0.4}
        }
        .particle-dot { animation: particleDrift 6s ease-in-out infinite; }

        @keyframes ringBreath {
          0%,100%{opacity:0.3} 50%{opacity:0.7}
        }
        .orbit-ring-outer { animation: ringBreath 4s ease-in-out infinite; }
        .orbit-ring-mid   { animation: ringBreath 3s ease-in-out infinite 1s; }

        @keyframes gridGlow {
          0%,100%{opacity:0.5} 50%{opacity:0.9}
        }
        .grid-floor { animation: gridGlow 5s ease-in-out infinite; }

        .cube-face {
          box-shadow: inset 0 0 40px rgba(124,58,237,0.08), 0 0 1px rgba(168,125,255,0.3);
        }
        .cube-front {
          box-shadow: inset 0 0 60px rgba(124,58,237,0.12), 0 0 2px rgba(168,125,255,0.5), 0 0 40px rgba(124,58,237,0.2);
        }

        @keyframes agentPulse {
          0%,100%{opacity:0.7;transform:scaleX(1)}
          50%{opacity:1;transform:scaleX(1.05)}
        }
        .agent-pill { animation: agentPulse 3s ease-in-out infinite; }

        @keyframes bgShimmer {
          0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%}
        }
      `}</style>

      {/* ══════════════════════════ HERO ══════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-[#07071a] pt-[68px]">
        {/* Deep space background */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(124,58,237,0.18) 0%, transparent 60%)" }} />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 40% at 80% 60%, rgba(6,182,212,0.07) 0%, transparent 50%)" }} />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 40% 30% at 15% 70%, rgba(124,58,237,0.08) 0%, transparent 50%)" }} />
          {/* Star field */}
          {[...Array(40)].map((_, i) => (
            <div key={i} className="absolute rounded-full bg-white" style={{ width: i % 3 === 0 ? 2 : 1, height: i % 3 === 0 ? 2 : 1, top: `${(i * 37 + 13) % 100}%`, left: `${(i * 61 + 7) % 100}%`, opacity: 0.15 + (i % 5) * 0.08 }} />
          ))}
        </div>

        <div className="mx-auto max-w-[1440px] px-6">
          <div className="grid min-h-[calc(100vh-64px)] grid-cols-1 items-center gap-8 py-16 lg:grid-cols-[440px_1fr_360px] lg:gap-4">

            {/* ── LEFT ──────────────────────────────────────────────────── */}
            <div className="space-y-6 lg:space-y-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/8 px-3 py-1.5 text-xs text-violet-300">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_#a87dff]" style={{ animation: "ambientPulse 2s ease-in-out infinite" }} />
                New: Deal Closer Agent now live
              </div>

              <h1 className="text-[38px] font-black leading-[1.05] tracking-tight text-white sm:text-[46px] lg:text-[58px]">
                Your AI<br />
                <span className="text-white/90">Commerce Army.</span><br />
                <span style={{ background: "linear-gradient(90deg, #c084fc, #818cf8, #22d3ee)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  Working 24/7.
                </span>
              </h1>

              <p className="max-w-sm text-sm leading-relaxed text-white/50">
                9 AI agents that find products, validate demand, discover buyers, automate outreach, negotiate deals, and grow your revenue — completely on autopilot.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_24px_rgba(124,58,237,0.5)] transition hover:opacity-90" style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}>
                  Start Free Trial <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/demo" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm text-white/70 transition hover:bg-white/8 hover:text-white">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10"><Play className="h-2.5 w-2.5 fill-current" /></span>
                  Watch Demo
                </Link>
              </div>

              <div className="flex items-center gap-3 text-xs text-white/40">
                <div className="flex -space-x-2">
                  {["JM", "SK", "AL", "RP"].map(i => (
                    <div key={i} className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#07071a] text-[9px] font-bold text-white" style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>{i}</div>
                  ))}
                </div>
                <span>Join <span className="font-semibold text-white/80">12,458+</span> entrepreneurs scaling with AI</span>
              </div>

              <div className="flex flex-wrap items-center gap-5 text-[11px] text-white/35">
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Free 14-day trial</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> No credit card</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Cancel anytime</span>
              </div>
            </div>

            {/* ── CENTER: Three.js brain ───────────────────────────────── */}
            <div className="hidden lg:flex items-center justify-center">
              <HeroCenter />
            </div>

            {/* ── RIGHT: Product Discovery Panel ───────────────────────── */}
            <div className="hidden xl:block">
              <ProductDiscoveryPanel />
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="border-t border-white/6 bg-white/3 backdrop-blur-sm">
          <div className="mx-auto max-w-[1440px] px-6">
            <div className="flex flex-wrap items-center justify-between gap-6 py-5">
              {BOTTOM_STATS.map(s => (
                <div key={s.label} className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/10">
                    <s.Icon className="h-5 w-5 text-violet-300" />
                  </div>
                  <div>
                    <div className="text-xl font-black leading-tight text-white">{s.value}</div>
                    <div className="text-[11px] text-white/35">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════ LIVE TICKER ═══════════════════════════════ */}
      <LiveTicker />

      {/* ══════════════════════════ LOGOS ═════════════════════════════════════ */}
      <section className="border-b border-bg-border bg-bg-panel/40 py-10">
        <div className="mx-auto max-w-7xl px-6">
          <p className="mb-6 text-center text-[11px] font-semibold uppercase tracking-widest text-ink-tertiary">
            Trusted by 12,458 commerce operators worldwide
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {LOGOS.map(l => (
              <span key={l} className="text-sm font-semibold text-ink-tertiary opacity-40 transition-all duration-200 hover:opacity-100">{l}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════ HOW IT WORKS ══════════════════════════════ */}
      <section id="features" className="py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <div className="mb-3 text-xs font-bold uppercase tracking-widest text-brand-300">The Flow</div>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">From signal to closed deal.<br />Fully automated.</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm text-ink-secondary leading-relaxed">
              One pipeline runs forever. Every step is a specialist AI agent. Every agent gets smarter every week.
            </p>
          </div>
          <div className="relative">
            <div className="absolute left-0 right-0 top-8 hidden h-px bg-gradient-to-r from-transparent via-brand-500/30 to-transparent lg:block" />
            <div className="grid grid-cols-3 gap-4 lg:grid-cols-9">
              {FLOW_STEPS.map(s => (
                <div key={s.n} className="group relative flex flex-col items-center text-center">
                  <div className="relative z-10 mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-bg-border bg-bg-card shadow-lg transition-all duration-300 group-hover:border-brand-500/40">
                    <s.Icon className="h-6 w-6" style={{ color: s.color }} />
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-bg-panel px-1.5 py-0.5 text-[9px] font-black text-ink-tertiary">{s.n}</div>
                  </div>
                  <div className="text-[13px] font-bold">{s.label}</div>
                  <div className="mt-0.5 text-[11px] leading-tight text-ink-tertiary">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════ FEATURES ══════════════════════════════════ */}
      <section className="border-t border-bg-border bg-bg-panel/30 py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <div className="mb-3 text-xs font-bold uppercase tracking-widest text-brand-300">Features</div>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">Everything you need.<br />Nothing you don't.</h2>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(f => (
              <div key={f.title} className="group relative overflow-hidden rounded-2xl border border-bg-border bg-bg-card p-6 transition-all duration-300 hover:border-brand-500/30">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="mb-4 inline-flex items-center gap-2">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/10">
                    <f.Icon className="h-5 w-5 text-brand-300" />
                  </div>
                  <span className="rounded-full bg-brand-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-300">{f.tag}</span>
                </div>
                <h3 className="mb-2 text-base font-bold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-ink-secondary">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════ AGENTS ════════════════════════════════════ */}
      <section id="agents" className="py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <div className="mb-3 text-xs font-bold uppercase tracking-widest text-brand-300">The Agents</div>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">9 specialists. One platform.<br />All running 24/7.</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm text-ink-secondary leading-relaxed">
              Cheap models for filtering. Expensive models for negotiation. You set the daily spend cap.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {AGENTS.map(a => (
              <div key={a.name} className="group flex items-start gap-4 rounded-2xl border border-bg-border bg-bg-card p-5 transition-all duration-300 hover:border-brand-500/30">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl" style={{ background: `${a.color}18` }}>
                  <a.Icon className="h-5 w-5" style={{ color: a.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">{a.name}</span>
                    <span className="flex items-center gap-1 rounded-full bg-accent-green/10 px-2 py-0.5 text-[10px] font-semibold text-accent-green">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent-green shadow-[0_0_4px_#22c55e]" />Running
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-secondary">{a.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════ RESULTS ═══════════════════════════════════ */}
      <section className="border-t border-bg-border bg-gradient-to-br from-[#0f0a28] via-[#0a0a18] to-[#0f0a28] py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <div className="mb-3 text-xs font-bold uppercase tracking-widest text-brand-300">Results</div>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">Numbers that speak<br />for themselves.</h2>
          </div>
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            {[
              { value: "$1.24B+", label: "Total Revenue Generated", sub: "Across all operators" },
              { value: "16.8K+",  label: "Buyers Discovered",       sub: "This month alone" },
              { value: "98.7%",   label: "AI Accuracy Rate",        sub: "Demand score validation" },
              { value: "6.8x",    label: "Average ROI",             sub: "Within first 90 days" },
            ].map(s => (
              <div key={s.label} className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-6 text-center">
                <div className="text-4xl font-black text-brand-300 lg:text-5xl">{s.value}</div>
                <div className="mt-2 text-sm font-semibold">{s.label}</div>
                <div className="mt-1 text-[11px] text-ink-tertiary">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════ TESTIMONIALS ══════════════════════════════ */}
      <section id="testimonials" className="border-t border-bg-border py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <div className="mb-3 text-xs font-bold uppercase tracking-widest text-brand-300">Testimonials</div>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">Operators love it.</h2>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {TESTIMONIALS.map(t => (
              <div key={t.name} className="flex flex-col justify-between rounded-2xl border border-bg-border bg-bg-card p-7">
                <div>
                  <div className="mb-4 flex gap-0.5">
                    {Array.from({ length: t.stars }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-accent-amber text-accent-amber" />
                    ))}
                  </div>
                  <p className="text-sm leading-relaxed text-ink-secondary">"{t.quote}"</p>
                </div>
                <div className="mt-6 flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-brand text-[12px] font-bold shadow-glow">{t.initials}</div>
                  <div>
                    <div className="text-sm font-bold">{t.name}</div>
                    <div className="text-[11px] text-ink-tertiary">{t.role} · {t.company}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════ FAQ ═══════════════════════════════════════ */}
      <FaqSection />

      {/* ══════════════════════════ PRICING ═══════════════════════════════════ */}
      <section id="pricing" className="border-t border-bg-border bg-bg-panel/30 py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-12 text-center">
            <div className="mb-3 text-xs font-bold uppercase tracking-widest text-brand-300">Pricing</div>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">Plans that pay for themselves.</h2>
            <p className="mx-auto mt-4 max-w-lg text-sm text-ink-secondary">Every plan includes the full agent network. Caps and commissions scale with you.</p>
            <div className="mt-8 inline-flex items-center gap-2 rounded-xl border border-bg-border bg-bg-card p-1">
              <button onClick={() => setAnnual(false)} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${!annual ? "bg-bg-hover text-ink-primary" : "text-ink-secondary"}`}>Monthly</button>
              <button onClick={() => setAnnual(true)}  className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${annual  ? "bg-bg-hover text-ink-primary" : "text-ink-secondary"}`}>
                Annual <span className="ml-1.5 rounded-full bg-accent-green/15 px-1.5 py-0.5 text-[10px] font-bold text-accent-green">Save 17%</span>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {PLANS.map(p => (
              <div key={p.id} className={`relative flex flex-col rounded-2xl border p-7 ${p.highlight ? "border-brand-500/50 bg-gradient-to-br from-brand-500/10 via-bg-card to-bg-card shadow-[0_0_60px_rgba(124,58,237,0.15)]" : "border-bg-border bg-bg-card"}`}>
                {p.badge && <div className={`absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-bold ${p.highlight ? "bg-gradient-brand shadow-glow" : "border border-bg-border bg-bg-panel text-ink-secondary"}`}>{p.badge}</div>}
                {p.highlight && <div className="absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-brand-400/50 to-transparent" />}
                <div className="mb-6">
                  <div className="text-base font-bold">{p.name}</div>
                  <div className="mt-0.5 text-[12px] text-ink-tertiary">{p.tagline}</div>
                  <div className="mt-4 flex items-end gap-1">
                    {p.id === "enterprise" ? <span className="text-4xl font-black">Custom</span> : (
                      <><span className="text-4xl font-black">${annual ? Math.round(p.annual / 12) : p.monthly}</span><span className="mb-1 text-sm text-ink-tertiary">/mo</span></>
                    )}
                  </div>
                  {p.id !== "enterprise" && annual && <div className="mt-1 text-[11px] text-ink-tertiary">Billed ${p.annual.toLocaleString()}/year</div>}
                </div>
                <ul className="mb-8 flex-1 space-y-2.5">
                  {p.features.map(f => (
                    <li key={f.label} className="flex items-start gap-2.5 text-sm">
                      <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${f.included ? "text-accent-green" : "text-ink-tertiary/30"}`} />
                      <span className={f.included ? "text-ink-secondary" : "text-ink-tertiary/40 line-through"}>{f.label}</span>
                    </li>
                  ))}
                </ul>
                <Link href={p.id === "enterprise" ? "/contact" : "/signup"} className={`block rounded-xl py-2.5 text-center text-sm font-semibold transition ${p.highlight ? "bg-gradient-brand shadow-glow hover:opacity-90" : "border border-bg-border bg-bg-hover hover:bg-bg-card"}`}>
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-[12px] text-ink-tertiary">All plans include a 14-day free trial · No credit card required · Cancel anytime</p>
        </div>
      </section>

      {/* ══════════════════════════ FINAL CTA ═════════════════════════════════ */}
      <section className="border-t border-bg-border bg-[#07071a] py-28">
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/15 blur-3xl" />
          <div className="relative">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/8 px-3 py-1.5 text-xs text-violet-300">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
              Free 14-day trial — no credit card
            </div>
            <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-6xl">
              Spin up your<br />
              <span style={{ background: "linear-gradient(90deg,#c084fc,#818cf8,#22d3ee)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                agent network today.
              </span>
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-sm leading-relaxed text-white/45">
              Takes 5 minutes to connect. Your first product scan runs automatically. Most operators see their first buyer outreach go live within 24 hours.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-[0_0_30px_rgba(124,58,237,0.5)] transition hover:opacity-90" style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>
                Start Free Trial <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/signin" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-white/70 transition hover:bg-white/8 hover:text-white">
                Sign In
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-[11px] text-white/30">
              <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> SOC 2 Type II</span>
              <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> GDPR Compliant</span>
              <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> 99.9% Uptime SLA</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Cancel anytime</span>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════ FOOTER ════════════════════════════════════ */}
      <footer className="border-t border-bg-border bg-bg-panel">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 py-16 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "#0a0014", boxShadow: "0 0 12px rgba(147,51,234,0.4)" }}>
                <AvynMark size={28} />
              </div>
              <div>
                <div className="flex items-baseline gap-1 text-sm font-bold">
                  <AvynWordmark /><span className="text-white">Commerce</span>
                </div>
                <div className="text-[10px] text-ink-tertiary">AI · Automation · Growth</div>
              </div>
            </div>
            <p className="mt-4 max-w-xs text-xs leading-relaxed text-ink-tertiary">
              The autonomous AI agent network that finds products, finds buyers, runs outreach, negotiates, and closes deals — 24/7.
            </p>
            <div className="mt-5 flex items-center gap-2 text-[11px] text-ink-tertiary">
              <span className="rounded border border-bg-border px-2 py-0.5">SOC 2</span>
              <span className="rounded border border-bg-border px-2 py-0.5">GDPR</span>
              <span className="rounded border border-bg-border px-2 py-0.5">CCPA</span>
            </div>
          </div>
          {[
            { h: "Product",  links: [
              { label: "Trend Hunter",        href: "/welcome#features" },
              { label: "Buyer Discovery",     href: "/welcome#features" },
              { label: "AI Outreach",         href: "/welcome#features" },
              { label: "CRM Pipeline",        href: "/welcome#features" },
              { label: "Quote Builder",       href: "/welcome#features" },
              { label: "Risk Center",         href: "/welcome#features" },
            ]},
            { h: "Platform", links: [
              { label: "Platform Demo",       href: "/demo" },
              { label: "Insights & Forecasts",href: "/welcome#features" },
              { label: "Agent Store",         href: "/welcome#agents" },
              { label: "Pricing",             href: "/welcome#pricing" },
              { label: "White-label",         href: "/contact" },
              { label: "FAQ",                 href: "/welcome#faq" },
            ]},
            { h: "Company",  links: [
              { label: "About",               href: "/welcome#features" },
              { label: "Testimonials",        href: "/welcome#testimonials" },
              { label: "Pricing",             href: "/welcome#pricing" },
              { label: "Contact Sales",       href: "/contact" },
              { label: "Privacy Policy",      href: "/privacy" },
              { label: "Terms of Service",    href: "/terms" },
            ]},
          ].map(c => (
            <div key={c.h}>
              <div className="mb-4 text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">{c.h}</div>
              <ul className="space-y-2.5">
                {c.links.map(l => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-xs text-ink-secondary transition hover:text-ink-primary">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-bg-border">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5 text-[11px] text-ink-tertiary">
            <span>© 2026 AVYN Commerce, Inc. · All rights reserved</span>
            <div className="flex items-center gap-5">
              <Link href="/privacy" className="transition hover:text-ink-secondary">Privacy Policy</Link>
              <Link href="/terms" className="transition hover:text-ink-secondary">Terms of Service</Link>
              <Link href="/privacy" className="transition hover:text-ink-secondary">Cookie Policy</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────
const FAQS = [
  {
    q: "How long does it take to get set up?",
    a: "Most operators are live within 5 minutes. Connect your accounts, set your product categories, and the agents start scanning immediately. Your first buyer outreach typically goes live within 24 hours of access.",
  },
  {
    q: "Do I need technical knowledge to use this?",
    a: "No. AVYN Commerce is designed for commerce operators — not engineers. The agents configure themselves based on your business goals. You approve actions in a simple queue, and the AI does everything else.",
  },
  {
    q: "What data sources does the Trend Hunter scan?",
    a: "TikTok Shop, TikTok hashtag trends, Reddit (r/entrepreneur, r/ecommerce, r/flipping, and 40+ niche subreddits), Amazon Best Sellers & Movers, Alibaba Hot Products, Google Trends, and Instagram Reels. New sources are added weekly.",
  },
  {
    q: "Is my data private and secure?",
    a: "Yes. AVYN Commerce is SOC 2 Type II certified, GDPR and CCPA compliant, and uses 256-bit AES encryption at rest and in transit. Your data is never used to train base models. You own your data — export it anytime.",
  },
  {
    q: "How does the AI write outreach messages?",
    a: "The Outreach Agent uses Claude (Anthropic) to generate personalized emails and LinkedIn messages based on each buyer's business context, product category, recent activity, and your brand voice. It references specific products the buyer likely sells, making every message feel handwritten.",
  },
  {
    q: "What happens when a buyer replies?",
    a: "The Negotiation Agent reads the reply, classifies it (interested, objection, price push, meeting request), and either responds autonomously or adds it to your approval queue depending on your settings. You can configure which scenarios require your review.",
  },
  {
    q: "Can I use this for wholesale, dropshipping, and private label?",
    a: "Yes — all three. The Supplier Finder surfaces verified manufacturers for private label, vetted dropship sources, and bulk/wholesale distributors. The Demand Intelligence score works for any business model.",
  },
  {
    q: "What is the commissions model?",
    a: "Starter and Growth plans include a small platform commission on verified deals closed (2.5% and 1.5% respectively). Enterprise drops to 0.5%. You always see the full breakdown before any deal is confirmed, and commissions are only charged on successfully closed transactions.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel in one click from Settings with no penalties or fees. If you cancel an annual plan mid-year, you'll receive a prorated refund for unused months.",
  },
  {
    q: "Do you offer a free trial?",
    a: "Yes — all plans include a 14-day free trial with full access to every agent, no credit card required. You'll see real results within the first 48 hours or we'll extend your trial.",
  },
];

function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section id="faq" className="border-t border-bg-border py-28">
      <div className="mx-auto max-w-4xl px-6">
        <div className="mb-16 text-center">
          <div className="mb-3 text-xs font-bold uppercase tracking-widest text-brand-300">FAQ</div>
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">Everything you need to know.</h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-ink-secondary">
            Still have questions?{" "}
            <Link href="/contact" className="text-brand-300 hover:text-brand-200 underline underline-offset-2">
              Talk to our team
            </Link>
            .
          </p>
        </div>
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <div
              key={i}
              className="rounded-2xl border border-bg-border bg-bg-card overflow-hidden transition-all duration-200"
              style={{ borderColor: open === i ? "rgba(124,58,237,0.3)" : undefined }}
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
              >
                <span className="text-sm font-semibold">{faq.q}</span>
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full transition-all duration-200"
                  style={{
                    background: open === i ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.05)",
                    transform: open === i ? "rotate(45deg)" : "rotate(0deg)",
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M5 2v6M2 5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </span>
              </button>
              {open === i && (
                <div className="border-t border-bg-border px-6 pb-5 pt-4 text-sm leading-relaxed text-ink-secondary">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
