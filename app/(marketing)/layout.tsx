import Link from "next/link";
import { Sparkles } from "lucide-react";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-bg-border bg-bg-base/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/welcome" className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-brand shadow-glow">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-bold leading-tight">AI Commerce OS</div>
              <div className="text-[10px] text-ink-tertiary">Autonomous Agent Network</div>
            </div>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-ink-secondary md:flex">
            <Link href="/welcome#features" className="hover:text-ink-primary">Features</Link>
            <Link href="/welcome#agents" className="hover:text-ink-primary">Agents</Link>
            <Link href="/welcome#pricing" className="hover:text-ink-primary">Pricing</Link>
            <Link href="/welcome#customers" className="hover:text-ink-primary">Customers</Link>
            <Link href="/welcome#api" className="hover:text-ink-primary">Developers</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover sm:inline-block"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-gradient-brand px-3 py-2 text-sm font-semibold shadow-glow"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-bg-border bg-bg-panel">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-6 py-12 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-brand">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="text-sm font-bold">AI Commerce OS</div>
            </div>
            <p className="mt-3 text-xs text-ink-tertiary">
              The autonomous AI agent network that finds products, finds buyers, runs outreach, negotiates, and closes deals — 24/7.
            </p>
          </div>
          {[
            { h: "Product", links: ["Trend Hunter", "Buyer Discovery", "AI Outreach", "CRM Pipeline", "Quote Builder"] },
            { h: "Platform", links: ["Marketplace", "Insights & Forecasts", "Agent Store", "API Access", "White-label"] },
            { h: "Company", links: ["About", "Customers", "Careers", "Security", "Status"] },
          ].map((c) => (
            <div key={c.h}>
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                {c.h}
              </div>
              <ul className="mt-3 space-y-2 text-xs">
                {c.links.map((l) => (
                  <li key={l}>
                    <span className="text-ink-secondary hover:text-ink-primary cursor-pointer">{l}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-bg-border">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 text-[11px] text-ink-tertiary">
            <span>© 2026 AI Commerce OS · All rights reserved</span>
            <div className="flex items-center gap-4">
              <span>Privacy</span>
              <span>Terms</span>
              <span>SOC 2 · GDPR · CCPA</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
