"use client";
import Link from "next/link";
import { Sparkles, Menu, X } from "lucide-react";
import { useState } from "react";

const NAV_LINKS = [
  { label: "Product", href: "/welcome#features" },
  { label: "Solutions", href: "/welcome#agents" },
  { label: "Demo", href: "/demo" },
  { label: "Pricing", href: "/welcome#pricing" },
  { label: "Enterprise", href: "/contact" },
];

export default function MarketingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-bg-border bg-bg-base/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/welcome" className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-brand shadow-glow">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">AVYN Commerce</div>
            <div className="text-[10px] text-ink-tertiary">AI · Automation · Growth</div>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-7 text-sm text-ink-secondary md:flex">
          {NAV_LINKS.map((l) => (
            <Link key={l.label} href={l.href} className="hover:text-ink-primary">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/signin"
            className="hidden rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover sm:inline-block"
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-semibold shadow-glow"
          >
            Start Free Trial
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </Link>
          {/* Mobile hamburger */}
          <button
            onClick={() => setOpen((o) => !o)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-bg-border bg-bg-card text-ink-secondary hover:bg-bg-hover hover:text-ink-primary md:hidden"
            aria-label="Toggle menu"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="border-t border-bg-border bg-bg-panel px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 border-t border-bg-border pt-2">
              <Link
                href="/signin"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
              >
                Log In
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
