"use client";
import Link from "next/link";
import { ArrowRight, Bot, Brain, Eye, EyeOff, Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";

const ACTIVITY = [
  { agent: "Trend Hunter", msg: "Found Magnetic Phone Charger trending +180%", ago: "2m", color: "#a78bfa" },
  { agent: "Outreach Agent", msg: "Sent 156 personalized emails, 12 replied", ago: "8m", color: "#22d3ee" },
  { agent: "Negotiation Agent", msg: "Secured 5% volume discount with Mumbai Goods", ago: "22m", color: "#22c55e" },
  { agent: "Buyer Discovery", msg: "Added 847 new qualified prospects", ago: "1h", color: "#f59e0b" },
];

const WHILE_AWAY = [
  { v: "47", l: "New opportunities", d: "Trend Hunter · 2h ago" },
  { v: "12", l: "Buyers replied", d: "Outreach Agent · 8m ago" },
  { v: "3", l: "Meetings booked", d: "CRM Agent · today" },
  { v: "$24K", l: "New pipeline", d: "Negotiation Agent · today" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);

  return (
    <div
      className="min-h-[calc(100vh-64px)]"
      style={{ background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,58,237,0.1) 0%, transparent 60%), #07071a" }}
    >
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-2">

        {/* Left — form */}
        <div className="mx-auto w-full max-w-md">
          {/* Logo */}
          <div className="mb-8 flex items-center gap-2.5">
            <div
              className="grid h-9 w-9 place-items-center rounded-xl"
              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 0 16px rgba(124,58,237,0.5)" }}
            >
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">AVYN Commerce</div>
              <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>AI · Automation · Growth</div>
            </div>
          </div>

          <h1 className="text-4xl font-bold text-white">Welcome back</h1>
          <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
            Your agents have been working while you were away.
          </p>

          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => { e.preventDefault(); window.location.href = "/"; }}
          >
            {/* Social buttons */}
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border py-3 text-sm font-medium text-white/70 transition-all hover:bg-white/5"
              style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}
            >
              <span
                className="grid h-5 w-5 place-items-center rounded text-[11px] font-black text-black"
                style={{ background: "white" }}
              >G</span>
              Continue with Google
            </button>
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border py-3 text-sm font-medium text-white/70 transition-all hover:bg-white/5"
              style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}
            >
              <ShieldCheck className="h-4 w-4 text-violet-400" />
              Continue with SSO
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.08)" }} />
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>or</span>
              <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.08)" }} />
            </div>

            {/* Email */}
            <label className="block">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                Email
              </div>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.25)" }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourcompany.com"
                  className="h-12 w-full rounded-xl border pl-10 pr-4 text-sm text-white placeholder:text-white/20 focus:outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(124,58,237,0.6)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                  autoComplete="email"
                />
              </div>
            </label>

            {/* Password */}
            <label className="block">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Password
                </span>
                <span className="cursor-pointer text-[11px] text-violet-400 hover:text-violet-300">
                  Forgot password?
                </span>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.25)" }} />
                <input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 w-full rounded-xl border pl-10 pr-12 text-sm text-white placeholder:text-white/20 focus:outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(124,58,237,0.6)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg transition-all hover:bg-white/5"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                >
                  {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </label>

            {/* Remember */}
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-violet-500"
              />
              <span style={{ color: "rgba(255,255,255,0.4)" }}>Keep me signed in for 30 days</span>
            </label>

            {/* Submit */}
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white transition-all hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                boxShadow: "0 0 24px rgba(124,58,237,0.45)",
              }}
            >
              Sign in <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <p className="mt-6 text-center text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            New to AVYN Commerce?{" "}
            <Link href="/signup" className="font-semibold text-violet-400 hover:text-violet-300">
              Start free trial
            </Link>
          </p>

          {/* Trust bar */}
          <div
            className="mt-8 flex items-center justify-center gap-4 rounded-xl border p-3 text-[10px]"
            style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.3)" }}
          >
            <span>🔒 SOC 2 Type II</span>
            <span>·</span>
            <span>GDPR Compliant</span>
            <span>·</span>
            <span>256-bit encryption</span>
          </div>
        </div>

        {/* Right — live activity panel */}
        <aside className="hidden lg:block">
          <div
            className="relative overflow-hidden rounded-2xl border p-6"
            style={{
              background: "rgba(13,13,31,0.85)",
              borderColor: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(16px)",
            }}
          >
            {/* Glow */}
            <div
              className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full"
              style={{ background: "radial-gradient(circle, rgba(124,58,237,0.25) 0%, transparent 70%)" }}
            />

            <div className="flex items-center gap-2 mb-1">
              <div className="h-2 w-2 rounded-full bg-green-400" style={{ animation: "livePulse 1.8s ease-in-out infinite" }} />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-violet-400">
                While you were away
              </span>
            </div>
            <p className="text-[12px] mb-5" style={{ color: "rgba(255,255,255,0.35)" }}>
              Your agents never stopped working
            </p>

            {/* Stat grid */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              {WHILE_AWAY.map((s) => (
                <div
                  key={s.l}
                  className="rounded-xl border p-3.5"
                  style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}
                >
                  <div className="text-2xl font-bold text-white">{s.v}</div>
                  <div className="text-[11px] font-medium text-white/70">{s.l}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{s.d}</div>
                </div>
              ))}
            </div>

            {/* Activity feed */}
            <div
              className="rounded-xl border p-4 mb-5"
              style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
                Latest agent activity
              </div>
              <ul className="space-y-3">
                {ACTIVITY.map((a, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <div
                      className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md"
                      style={{ background: `${a.color}18` }}
                    >
                      <Bot className="h-3 w-3" style={{ color: a.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-white/70 leading-snug">{a.msg}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{a.agent} · {a.ago} ago</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Testimonial */}
            <blockquote
              className="rounded-xl border-l-2 pl-4 text-sm"
              style={{ borderColor: "rgba(124,58,237,0.5)", color: "rgba(255,255,255,0.5)" }}
            >
              "Logging in feels like coming back to a team that actually worked overnight."
              <div className="mt-2 text-[11px]">
                <span className="font-semibold text-white/70">— Sarah Chen</span>
                <span style={{ color: "rgba(255,255,255,0.3)" }}> · Buying Director, FitLife Stores</span>
              </div>
            </blockquote>
          </div>
        </aside>
      </div>

      <style>{`
        @keyframes livePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.8)} }
      `}</style>
    </div>
  );
}
