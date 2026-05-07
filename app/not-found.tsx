import Link from "next/link";
import { ArrowLeft, Home, Search, Sparkles } from "lucide-react";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg-base p-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-brand-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[300px] w-[300px] rounded-full bg-accent-cyan/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-brand shadow-glow">
          <Sparkles className="h-8 w-8" />
        </div>

        <div className="mt-8 select-none text-9xl font-bold leading-none tracking-tight">
          <span className="bg-gradient-to-r from-brand-300 via-brand-200 to-accent-cyan bg-clip-text text-transparent">
            404
          </span>
        </div>

        <h1 className="mt-4 text-2xl font-bold">This page slipped through the funnel</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          We couldn&apos;t find what you were looking for. The agents searched everywhere.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-brand px-5 py-2.5 text-sm font-semibold shadow-glow"
          >
            <Home className="h-4 w-4" /> Go to dashboard
          </Link>
          <Link
            href="/welcome"
            className="inline-flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-5 py-2.5 text-sm hover:bg-bg-hover"
          >
            <ArrowLeft className="h-4 w-4" /> Back to homepage
          </Link>
        </div>

        <div className="mt-10 rounded-xl border border-bg-border bg-bg-card p-5 text-left">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
            <Search className="h-3.5 w-3.5" /> Try one of these
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {[
              { l: "Command Center", h: "/" },
              { l: "Product Discovery", h: "/products" },
              { l: "Buyer Discovery", h: "/buyers" },
              { l: "Outreach Automation", h: "/outreach" },
              { l: "CRM Pipeline", h: "/crm" },
              { l: "Marketplace", h: "/marketplace" },
              { l: "Earnings", h: "/earnings" },
              { l: "Insights", h: "/insights" },
            ].map((l) => (
              <li key={l.h}>
                <Link
                  href={l.h}
                  className="block rounded-md border border-bg-border bg-bg-hover/40 px-3 py-2 text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
                >
                  {l.l}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-6 text-[11px] text-ink-tertiary">
          Tip: press{" "}
          <kbd className="rounded border border-bg-border bg-bg-card px-1 py-0.5 text-[10px]">⌘K</kbd>
          {" "}from inside the app to jump to anything.
        </p>
      </div>
    </div>
  );
}
