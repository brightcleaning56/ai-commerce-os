"use client";
import Link from "next/link";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);

  return (
    <div className="mx-auto grid min-h-[calc(100vh-180px)] max-w-7xl items-center px-6 py-12 lg:grid-cols-2 lg:gap-16">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-3xl font-bold">Sign in</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Welcome back. Your agents have been busy.
        </p>

        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            window.location.href = "/";
          }}
        >
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card py-2.5 text-sm hover:bg-bg-hover"
          >
            <span className="grid h-4 w-4 place-items-center rounded bg-white text-[10px] font-bold text-black">
              G
            </span>
            Continue with Google
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card py-2.5 text-sm hover:bg-bg-hover"
          >
            <ShieldCheck className="h-4 w-4 text-brand-300" />
            Continue with SSO
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-bg-border" />
            <span className="text-[10px] uppercase tracking-wider text-ink-tertiary">
              Or
            </span>
            <div className="h-px flex-1 bg-bg-border" />
          </div>

          <label className="block">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Email
            </div>
            <div className="relative mt-1">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourcompany.com"
                className="h-11 w-full rounded-lg border border-bg-border bg-bg-card pl-10 pr-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
                autoComplete="email"
              />
            </div>
          </label>

          <label className="block">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
                Password
              </span>
              <span className="text-[11px] text-brand-300 hover:text-brand-200 cursor-pointer">
                Forgot?
              </span>
            </div>
            <div className="relative mt-1">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 w-full rounded-lg border border-bg-border bg-bg-card pl-10 pr-10 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-ink-tertiary hover:text-ink-primary"
              >
                {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-3.5 w-3.5 accent-brand-500"
            />
            <span className="text-ink-secondary">Keep me signed in for 30 days</span>
          </label>

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-brand py-2.5 text-sm font-semibold shadow-glow"
          >
            Sign in <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="mt-8 text-center text-xs text-ink-secondary">
          New to AI Commerce OS?{" "}
          <Link href="/signup" className="font-semibold text-brand-300 hover:text-brand-200">
            Start a free trial
          </Link>
        </div>
      </div>

      {/* Right panel — animated state */}
      <aside className="hidden lg:block">
        <div className="relative overflow-hidden rounded-2xl border border-bg-border bg-gradient-to-br from-brand-500/10 via-bg-card to-transparent p-8">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -top-20 right-0 h-64 w-64 rounded-full bg-brand-500/30 blur-3xl" />
            <div className="absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-accent-cyan/20 blur-3xl" />
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-300">
            <Sparkles className="h-3.5 w-3.5" /> While you were away
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[
              { v: "47", l: "New opportunities", d: "Trend Hunter · 2h ago" },
              { v: "12", l: "Buyers replied", d: "Outreach Agent · 8m ago" },
              { v: "3", l: "Meetings booked", d: "CRM · today" },
              { v: "$24K", l: "New pipeline", d: "Negotiation Agent · today" },
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-xl border border-bg-border bg-bg-card p-4"
              >
                <div className="text-2xl font-bold">{s.v}</div>
                <div className="text-[11px] font-medium">{s.l}</div>
                <div className="text-[10px] text-ink-tertiary">{s.d}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-bg-border bg-bg-card p-4">
            <div className="text-xs font-semibold">Latest agent activity</div>
            <ul className="mt-3 space-y-2.5 text-xs">
              {[
                { t: "Trend Hunter found Magnetic Phone Charger trending +180%", ago: "2m" },
                { t: "Outreach Agent sent 156 personalized emails", ago: "8m" },
                { t: "Negotiation Agent secured 5% volume discount with Mumbai Goods", ago: "22m" },
                { t: "Risk Agent flagged unverified supplier", ago: "1h" },
              ].map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-ink-secondary">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                  <span className="flex-1">{a.t}</span>
                  <span className="text-[10px] text-ink-tertiary">{a.ago}</span>
                </li>
              ))}
            </ul>
          </div>

          <blockquote className="mt-6 border-l-2 border-brand-500/60 pl-4 text-sm text-ink-secondary">
            &ldquo;Logging in feels like coming back to a sales team that actually
            worked overnight.&rdquo;
            <div className="mt-2 text-[11px]">
              <span className="font-semibold">— Sarah Chen</span>
              <span className="text-ink-tertiary"> · Buying Director, FitLife Stores</span>
            </div>
          </blockquote>
        </div>
      </aside>
    </div>
  );
}
