import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Brain,
  CheckCircle2,
  DollarSign,
  Factory,
  Globe,
  MessageSquare,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Star,
  Telescope,
  TrendingUp,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { PLANS } from "@/lib/billing";

const AGENTS = [
  { name: "Trend Hunter", desc: "Scans TikTok, Reddit, Amazon, Alibaba 24/7", Icon: Search },
  { name: "Demand Intelligence", desc: "Scores demand 0–100 from multi-source signal", Icon: TrendingUp },
  { name: "Supplier Finder", desc: "Surfaces verified manufacturers + dropshippers", Icon: Factory },
  { name: "Buyer Discovery", desc: "Finds retailers and decision-makers", Icon: Users },
  { name: "Outreach Agent", desc: "Sends personalized email / SMS / LinkedIn", Icon: Send },
  { name: "Negotiation Agent", desc: "Handles objections and books calls", Icon: MessageSquare },
  { name: "CRM Intelligence", desc: "Routes leads, predicts churn, scores deals", Icon: Workflow },
  { name: "Risk Agent", desc: "Detects scams, fraud, trademark hits", Icon: ShieldAlert },
  { name: "Learning Agent", desc: "Optimizes prompts, sources, pricing", Icon: Brain },
];

const LOGOS = [
  "FitLife Stores",
  "ActiveGear Co.",
  "Petopia Boutique",
  "GlowUp Beauty",
  "Urban Essentials",
  "TechWorld Hub",
  "MamaBear Co.",
  "Outback Gear",
];

const STATS = [
  { v: "$847M", l: "GMV processed" },
  { v: "2.1M", l: "Buyers indexed" },
  { v: "180K", l: "Suppliers verified" },
  { v: "14.9%", l: "Avg reply rate" },
];

export default function WelcomePage() {
  return (
    <div className="space-y-32 pb-20">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 left-1/2 h-[600px] w-[1000px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />
          <div className="absolute -top-20 right-0 h-[400px] w-[400px] rounded-full bg-accent-cyan/10 blur-3xl" />
        </div>
        <div className="mx-auto max-w-7xl px-6 pt-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs text-brand-200">
            <Sparkles className="h-3 w-3" />
            <span>Powered by Claude Sonnet 4.6 + Haiku 4.5</span>
          </div>
          <h1 className="mx-auto mt-6 max-w-4xl text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl">
            Your{" "}
            <span className="bg-gradient-to-r from-brand-300 via-brand-200 to-accent-cyan bg-clip-text text-transparent">
              autonomous commerce team
            </span>
            , running 24/7
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-ink-secondary md:text-lg">
            Nine AI agents find winning products, source verified suppliers, build a buyer pipeline, run personalized outreach, and close deals — while you sleep.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-brand px-6 py-3 text-sm font-semibold shadow-glow"
            >
              Start free 14-day trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-6 py-3 text-sm hover:bg-bg-hover"
            >
              See live demo
            </Link>
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-ink-tertiary">
            <CheckCircle2 className="h-3 w-3 text-accent-green" />
            No credit card required · Cancel anytime · SOC 2 Type II
          </div>

          {/* Hero image: dashboard preview */}
          <div className="mx-auto mt-16 max-w-6xl">
            <div className="rounded-xl border border-bg-border bg-bg-panel p-2 shadow-2xl shadow-brand-500/20">
              <div className="flex items-center gap-1.5 px-2 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-accent-red/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-accent-amber/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-accent-green/70" />
                <span className="ml-3 text-[10px] text-ink-tertiary">commerce.acmebrand.com</span>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-3 rounded-lg bg-bg-base p-3">
                <div className="space-y-1 rounded-md bg-bg-panel p-2">
                  <div className="flex items-center gap-2 px-1 py-1">
                    <div className="grid h-6 w-6 place-items-center rounded bg-gradient-brand">
                      <Sparkles className="h-3 w-3" />
                    </div>
                    <div className="text-[10px] font-semibold">Commerce OS</div>
                  </div>
                  {["Dashboard", "Products", "Buyers", "Outreach", "CRM", "Marketplace", "Earnings"].map((s, i) => (
                    <div
                      key={s}
                      className={`rounded px-2 py-1 text-[10px] ${
                        i === 0 ? "bg-brand-500/15 text-brand-200" : "text-ink-secondary"
                      }`}
                    >
                      {s}
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { l: "Opportunities", v: "1,283", d: "+28%" },
                      { l: "Buyers Contacted", v: "2,451", d: "+37%" },
                      { l: "Pipeline", v: "$1.26M", d: "+24%" },
                    ].map((c) => (
                      <div key={c.l} className="rounded-md border border-bg-border bg-bg-card p-2">
                        <div className="text-[8px] uppercase tracking-wider text-ink-tertiary">
                          {c.l}
                        </div>
                        <div className="mt-0.5 text-base font-bold">{c.v}</div>
                        <div className="text-[9px] text-accent-green">{c.d}</div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md border border-bg-border bg-bg-card p-2">
                      <div className="text-[10px] font-semibold">Top Products</div>
                      <div className="mt-1 space-y-1">
                        {[
                          ["🥤 Portable Blender", 92, "+28%"],
                          ["✨ LED Strip Lights", 88, "+22%"],
                          ["🐾 Pet Hair Roller", 86, "+19%"],
                        ].map(([n, s, d]) => (
                          <div key={n as string} className="flex items-center justify-between text-[9px]">
                            <span className="text-ink-secondary">{n}</span>
                            <span className="flex items-center gap-1.5">
                              <span className="font-semibold text-brand-200">{s}</span>
                              <span className="text-accent-green">{d}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-md border border-bg-border bg-bg-card p-2">
                      <div className="text-[10px] font-semibold">Live Activity</div>
                      <div className="mt-1 space-y-1">
                        {[
                          { d: "bg-brand-400", t: "Trend Hunter found 12 products" },
                          { d: "bg-accent-green", t: "Outreach Agent sent 156 messages" },
                          { d: "bg-accent-amber", t: "Risk Agent flagged supplier" },
                        ].map((a, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[9px]">
                            <span className={`mt-1 h-1.5 w-1.5 rounded-full ${a.d}`} />
                            <span className="text-ink-secondary">{a.t}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS + LOGO ROW */}
      <section className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-bg-border bg-bg-card p-6 sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.l} className="text-center">
              <div className="text-3xl font-bold">{s.v}</div>
              <div className="text-[11px] text-ink-tertiary">{s.l}</div>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <div className="text-[11px] uppercase tracking-wider text-ink-tertiary">
            Trusted by brands and agencies running outbound at scale
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-ink-tertiary">
            {LOGOS.map((l) => (
              <span key={l} className="opacity-60 hover:opacity-100">
                {l}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* THE 10-STEP FLOW */}
      <section id="features" className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-wider text-brand-300">
            The Flow
          </div>
          <h2 className="mt-2 text-4xl font-bold tracking-tight">
            From signal to closed deal — fully automated
          </h2>
          <p className="mt-3 text-sm text-ink-secondary">
            One pipeline runs forever. Every step is an agent, every agent gets smarter every week.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          {[
            { n: "01", t: "Scan", d: "AI watches 9 platforms 24/7" },
            { n: "02", t: "Score", d: "Demand index 0–100" },
            { n: "03", t: "Source", d: "Verified suppliers ranked" },
            { n: "04", t: "Find", d: "Buyers + decision-makers" },
            { n: "05", t: "Reach", d: "Personalized email/LI" },
            { n: "06", t: "Reply", d: "AI handles responses" },
            { n: "07", t: "Negotiate", d: "Counter-offers + objections" },
            { n: "08", t: "Quote", d: "Auto-built proposals" },
            { n: "09", t: "Close", d: "Escrow + transaction fees" },
            { n: "10", t: "Learn", d: "Self-tunes for ROI" },
          ].map((s) => (
            <div
              key={s.n}
              className="rounded-xl border border-bg-border bg-bg-card p-4 transition hover:border-brand-500/50"
            >
              <div className="text-xs font-bold text-brand-300">{s.n}</div>
              <div className="mt-2 text-base font-semibold">{s.t}</div>
              <div className="text-xs text-ink-tertiary">{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* AGENT GRID */}
      <section id="agents" className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-wider text-brand-300">
            The Agents
          </div>
          <h2 className="mt-2 text-4xl font-bold tracking-tight">
            Nine specialists, one platform
          </h2>
          <p className="mt-3 text-sm text-ink-secondary">
            Cheap models for filtering and classification, expensive models for negotiation and outreach. You set the spend cap.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((a) => (
            <div
              key={a.name}
              className="group rounded-xl border border-bg-border bg-bg-card p-5 transition hover:border-brand-500/50 hover:shadow-glow"
            >
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/15">
                <a.Icon className="h-5 w-5 text-brand-300" />
              </div>
              <div className="mt-4 font-semibold">{a.name}</div>
              <div className="mt-1 text-xs text-ink-tertiary">{a.desc}</div>
              <div className="mt-4 flex items-center gap-2 text-[11px]">
                <span className="rounded bg-accent-green/15 px-1.5 py-0.5 text-accent-green">
                  Running
                </span>
                <span className="text-ink-tertiary">Auto mode</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-bg-border bg-bg-card p-6 text-center">
          <div className="text-sm font-semibold">Plus 12 more agents in the Agent Store</div>
          <p className="mt-1 text-xs text-ink-tertiary">
            Amazon Seller · TikTok Shop · Shopify Builder · Real Estate Wholesaler · Auto Parts · F1000 Procurement · Cold Email Warmup · and more.
          </p>
          <Link
            href="/signup"
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-300 hover:text-brand-200"
          >
            Explore Agent Store <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </section>

      {/* MONETIZATION LAYERS */}
      <section className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-wider text-brand-300">
            Multiple revenue paths
          </div>
          <h2 className="mt-2 text-4xl font-bold tracking-tight">
            Not just software. A commerce engine.
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[
            { Icon: Zap, t: "SaaS subscriptions", d: "Starter, Growth, and Enterprise tiers with per-agent caps" },
            { Icon: DollarSign, t: "Deal commissions", d: "2–10% of every AI-closed wholesale deal — tiered by deal size" },
            { Icon: Send, t: "Outreach as a service", d: "Per-meeting or per-lead pricing for fully managed outbound" },
            { Icon: Telescope, t: "Buyer intent data", d: "Sell access to live buyer signals to other operators" },
            { Icon: Globe, t: "Marketplace fees", d: "Suppliers ↔ buyers transact on platform, you take 2%" },
            { Icon: Bot, t: "Agent store", d: "Publishers earn 70% revenue share on installable agents" },
          ].map((c) => (
            <div
              key={c.t}
              className="rounded-xl border border-bg-border bg-bg-card p-5"
            >
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/15">
                <c.Icon className="h-5 w-5 text-brand-300" />
              </div>
              <div className="mt-4 font-semibold">{c.t}</div>
              <div className="mt-1 text-xs text-ink-tertiary">{c.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-wider text-brand-300">
            Pricing
          </div>
          <h2 className="mt-2 text-4xl font-bold tracking-tight">
            Plans that pay for themselves
          </h2>
          <p className="mt-3 text-sm text-ink-secondary">
            Every plan includes the full agent network. Caps and commissions scale with you.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={`relative rounded-2xl border p-6 ${
                p.highlight
                  ? "border-brand-500/60 bg-gradient-to-br from-brand-500/10 to-transparent shadow-glow"
                  : "border-bg-border bg-bg-card"
              }`}
            >
              {p.badge && (
                <span
                  className={`absolute -top-3 left-6 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                    p.highlight ? "bg-gradient-brand" : "bg-bg-hover text-ink-secondary"
                  }`}
                >
                  {p.badge}
                </span>
              )}
              <div className="text-base font-bold">{p.name}</div>
              <div className="text-[11px] text-ink-tertiary">{p.tagline}</div>
              <div className="mt-5">
                <span className="text-3xl font-bold">${p.monthly.toLocaleString()}</span>
                <span className="text-xs text-ink-tertiary">/mo</span>
              </div>
              <div className="mt-1 text-[11px] text-ink-tertiary">
                Platform commission: <span className="text-brand-300">{(p.commissionRate * 100).toFixed(0)}%</span> of AI-closed deals
              </div>

              <Link
                href="/signup"
                className={`mt-5 block rounded-lg py-2.5 text-center text-sm font-semibold ${
                  p.highlight
                    ? "bg-gradient-brand shadow-glow"
                    : "border border-bg-border bg-bg-hover/40 hover:bg-bg-hover"
                }`}
              >
                {p.cta}
              </Link>

              <div className="my-5 border-t border-bg-border" />

              <ul className="space-y-1.5 text-xs">
                {p.features.filter((f) => f.included).slice(0, 6).map((f) => (
                  <li key={f.label} className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-accent-green" />
                    <span className="text-ink-secondary">{f.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* TESTIMONIAL */}
      <section id="customers" className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {[
            {
              q: "We replaced our 4-person SDR team with the platform. AI booked 11 meetings in week one — and the buyers were better fits than the human team had been finding.",
              a: "Marcus Brooks",
              r: "Head of Wholesale, ActiveGear Co.",
            },
            {
              q: "The Trend Hunter caught the portable ice maker spike 3 weeks before our retail buyers asked about it. We were the first to land an exclusive — locked $480K in POs.",
              a: "Sarah Chen",
              r: "Buying Director, FitLife Stores",
            },
            {
              q: "The commission model means the platform only wins when we win. That alignment alone was worth signing.",
              a: "Aiko Tanaka",
              r: "Founder, GlowUp Beauty",
            },
          ].map((t) => (
            <blockquote
              key={t.a}
              className="rounded-xl border border-bg-border bg-bg-card p-6"
            >
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-accent-amber text-accent-amber" />
                ))}
              </div>
              <p className="mt-3 text-sm text-ink-secondary">&ldquo;{t.q}&rdquo;</p>
              <div className="mt-4 text-xs">
                <div className="font-semibold">{t.a}</div>
                <div className="text-ink-tertiary">{t.r}</div>
              </div>
            </blockquote>
          ))}
        </div>
      </section>

      {/* DEVELOPER STRIP */}
      <section id="api" className="mx-auto max-w-7xl px-6">
        <div className="overflow-hidden rounded-2xl border border-bg-border bg-bg-card">
          <div className="grid gap-0 lg:grid-cols-2">
            <div className="p-8">
              <div className="text-xs font-semibold uppercase tracking-wider text-brand-300">
                Developers
              </div>
              <h3 className="mt-2 text-3xl font-bold">Build on top of the agent network</h3>
              <p className="mt-3 text-sm text-ink-secondary">
                REST API + webhooks for products, buyers, suppliers, outreach, and forecasts. Resell read access to your own customers — token-bucket rate limits per key.
              </p>
              <div className="mt-5 flex items-center gap-2 text-xs">
                <span className="rounded-md bg-bg-hover/60 px-2 py-1">100K calls/day on Growth</span>
                <span className="rounded-md bg-bg-hover/60 px-2 py-1">Unlimited on Enterprise</span>
              </div>
              <Link
                href="/signup"
                className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-brand-300 hover:text-brand-200"
              >
                Read API docs <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="border-t border-bg-border bg-bg-panel p-8 lg:border-l lg:border-t-0">
              <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                cURL
              </div>
              <pre className="mt-2 overflow-x-auto rounded-md bg-bg-base p-4 font-mono text-[11px] leading-relaxed text-ink-secondary">
{`curl https://api.aicommerce.os/v1/products/trending \\
  -H "Authorization: Bearer sk_live_..."

# Response:
[
  {
    "id": "p1",
    "name": "Portable Blender Cup",
    "demand_score": 92,
    "trend_velocity": 280,
    "competition": "Low",
    "predicted_lift_90d": 0.42
  },
  ...
]`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="mx-auto max-w-4xl px-6">
        <div className="relative overflow-hidden rounded-3xl border border-brand-500/40 bg-gradient-to-br from-brand-500/15 via-bg-card to-transparent p-12 text-center">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -top-20 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-brand-500/30 blur-3xl" />
          </div>
          <h2 className="text-4xl font-bold tracking-tight">
            Spin up your agent network today
          </h2>
          <p className="mt-3 text-sm text-ink-secondary">
            Free 14 days · no credit card · cancel any time.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-brand px-6 py-3 text-sm font-semibold shadow-glow"
            >
              Start free trial <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-bg-border bg-bg-card px-6 py-3 text-sm hover:bg-bg-hover"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
