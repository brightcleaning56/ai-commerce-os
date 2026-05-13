"use client";
import Link from "next/link";
import { ArrowRight, Bot, Eye, EyeOff, Shield } from "lucide-react";
import { AvynMark, AvynWordmark } from "@/components/AvynLogo";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type ActivityItem = { agent: string; msg: string; ago: string; color: string };
type StatItem = { v: string; l: string; d: string };

const STATIC_ACTIVITY: ActivityItem[] = [
  { agent: "Trend Hunter", msg: "Found Magnetic Phone Charger trending +180%", ago: "2m", color: "#a78bfa" },
  { agent: "Outreach Agent", msg: "Sent 156 personalized emails — 12 replied", ago: "8m", color: "#22d3ee" },
  { agent: "Negotiation Agent", msg: "Secured 5% volume discount with Mumbai Goods", ago: "22m", color: "#22c55e" },
  { agent: "Buyer Discovery", msg: "Added 847 new qualified prospects today", ago: "1h", color: "#f59e0b" },
];

const STATIC_WHILE_AWAY: StatItem[] = [
  { v: "47", l: "New opportunities", d: "Trend Hunter · 2h ago" },
  { v: "12", l: "Buyers replied", d: "Outreach Agent · 8m ago" },
  { v: "3", l: "Quotes accepted", d: "Negotiation Agent · today" },
  { v: "$24K", l: "New pipeline", d: "Negotiation Agent · today" },
];

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#07071a" }}>
        <div className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Loading…</div>
      </div>
    }>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const queryToken = params.get("t") ?? "";
  const [token, setToken] = useState(queryToken);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [whileAway, setWhileAway] = useState<StatItem[]>(STATIC_WHILE_AWAY);
  const [activity, setActivity] = useState<ActivityItem[]>(STATIC_ACTIVITY);
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  useEffect(() => {
    fetch("/api/signin-summary")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.whileAway?.length) setWhileAway(data.whileAway);
        if (data?.activity?.length) setActivity(data.activity);
      })
      .catch(() => {/* keep static fallback */});
  }, []);

  // Magic-link sign-in: when ?t=<token> is present, auto-submit so the
  // user doesn't have to copy-paste a 200-char HMAC token. Strip the
  // token from the URL after submit so it doesn't sit in browser
  // history. We only fire ONCE per mount (autoSubmitted guard).
  useEffect(() => {
    if (autoSubmitted) return;
    if (!queryToken) return;
    setAutoSubmitted(true);
    void doSignIn(queryToken);
    // Drop the ?t= from the URL — pushState avoids re-rendering the
    // route. Best-effort: ignore errors in non-browser environments.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("t");
      window.history.replaceState({}, "", url.toString());
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryToken]);

  async function doSignIn(submittedToken: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: submittedToken }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status}`);
      }
      router.push(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await doSignIn(token);
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,58,237,0.1) 0%, transparent 60%), #07071a" }}
    >
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-2" style={{ minHeight: "100vh" }}>

        {/* Left — form */}
        <div className="mx-auto w-full max-w-md">
          {/* Logo */}
          <Link href="/welcome" className="mb-8 flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: "#0a0014", boxShadow: "0 0 16px rgba(147,51,234,0.5)" }}
            >
              <AvynMark size={28} />
            </div>
            <div>
              <div className="flex items-baseline gap-1 text-sm font-bold">
                <AvynWordmark /><span className="text-white">Commerce</span>
              </div>
              <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>AI · Automation · Growth</div>
            </div>
          </Link>

          <h1 className="text-4xl font-bold text-white">Welcome back</h1>
          <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
            Your agents have been working while you were away.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {/* Token input */}
            <label className="block">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                Access Token
              </div>
              <div className="relative">
                <Shield className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.25)" }} />
                <input
                  type={show ? "text" : "password"}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste your access token"
                  autoFocus
                  className="h-12 w-full rounded-xl border pl-10 pr-12 text-sm text-white placeholder:text-white/20 focus:outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(124,58,237,0.6)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
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

            {error && (
              <div
                className="rounded-xl border px-4 py-2.5 text-xs"
                style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#fca5a5" }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !token}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-30"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                boxShadow: token ? "0 0 24px rgba(124,58,237,0.45)" : "none",
              }}
            >
              {loading ? "Signing in…" : <>Sign in <ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
            <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>or</span>
            <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
          </div>

          <Link
            href="/signup"
            className="flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold text-white/60 transition-all hover:bg-white/5 hover:text-white"
            style={{ borderColor: "rgba(255,255,255,0.1)" }}
          >
            Request access → Start Free Trial
          </Link>

          <p className="mt-6 text-center text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>
            Token is the value of <code className="rounded px-1" style={{ background: "rgba(255,255,255,0.06)" }}>ADMIN_TOKEN</code> in your .env
          </p>

          {/* Trust */}
          <div
            className="mt-6 flex items-center justify-center gap-4 rounded-xl border p-3 text-[10px]"
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
            style={{ background: "rgba(13,13,31,0.85)", borderColor: "rgba(255,255,255,0.08)", backdropFilter: "blur(16px)" }}
          >
            {/* Glow */}
            <div
              className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full"
              style={{ background: "radial-gradient(circle, rgba(124,58,237,0.2) 0%, transparent 70%)" }}
            />

            <div className="flex items-center gap-2 mb-1">
              <div className="h-2 w-2 rounded-full bg-green-400" style={{ animation: "livePulse 1.8s ease-in-out infinite" }} />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-violet-400">While you were away</span>
            </div>
            <p className="text-[12px] mb-5" style={{ color: "rgba(255,255,255,0.35)" }}>
              Your agents never stopped working
            </p>

            {/* Stat grid */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              {whileAway.map((s) => (
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
                {activity.map((a, i) => (
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
