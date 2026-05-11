"use client";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Brain,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Globe,
  Lock,
  Mail,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";

// ── Static data ────────────────────────────────────────────────────────────────

const STEPS = [
  { id: "contact", label: "Contact" },
  { id: "company", label: "Company" },
  { id: "goal", label: "Your Goal" },
] as const;

const GOALS = [
  { id: "find-buyers",        label: "Find new buyers",        desc: "Build a pipeline of retailers & brands",    icon: Users },
  { id: "find-products",      label: "Source winning products", desc: "Discover trends & verified suppliers",     icon: TrendingUp },
  { id: "automate-outbound",  label: "Automate outbound",      desc: "Replace SDRs with AI personalization",      icon: Mail },
  { id: "scale-revenue",      label: "Scale revenue fast",     desc: "Close more deals with AI negotiation",      icon: Zap },
];

const REVENUE_RANGES = [
  "Under $10K/mo", "$10K–$50K/mo", "$50K–$200K/mo", "$200K–$1M/mo", "$1M+/mo",
];

const AI_MESSAGES = [
  "Analyzing your business profile...",
  "Scanning market opportunities for your category...",
  "Identifying top buyer prospects in your niche...",
  "Building your personalized agent configuration...",
  "Preparing your outreach strategy...",
  "Your AI agent network is ready.",
];

const TESTIMONIALS = [
  {
    quote: "We went from 0 to $180K in wholesale revenue in 4 months. The Outreach Agent books 8–12 retailer calls a week without us touching anything.",
    name: "James M.",
    role: "Founder, ActiveGear Co.",
    initials: "JM",
    color: "#7c3aed",
    stars: 5,
  },
  {
    quote: "I replaced an entire BizDev hire with AVYN Commerce. ROI was positive in week one.",
    name: "Sarah K.",
    role: "CEO, GlowUp Beauty",
    initials: "SK",
    color: "#06b6d4",
    stars: 5,
  },
  {
    quote: "The Demand Intelligence score caught the portable blender trend 6 weeks before our competitors.",
    name: "Alex P.",
    role: "Head of Commerce, FitLife",
    initials: "AP",
    color: "#22c55e",
    stars: 5,
  },
];

const LOGOS = [
  "FitLife Stores", "ActiveGear Co.", "Petopia", "GlowUp Beauty", "Urban Essentials", "TechWorld Hub",
];

const STATS = [
  { value: "12,458+", label: "Active operators" },
  { value: "$1.24B+", label: "Revenue generated" },
  { value: "98.7%",  label: "AI accuracy" },
  { value: "4 min",  label: "Avg setup time" },
];

// ── Spot counter (countdown from a seeded number) ──────────────────────────────
function useSpotCount() {
  const base = 27;
  const [count, setCount] = useState(base);
  useEffect(() => {
    const t = setTimeout(() => setCount((c) => Math.max(8, c - 1)), 45_000);
    return () => clearTimeout(t);
  }, [count]);
  return count;
}

// ── Animated testimonial ticker ────────────────────────────────────────────────
function TestimonialTicker() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % TESTIMONIALS.length), 5000);
    return () => clearInterval(t);
  }, []);
  const t = TESTIMONIALS[idx];
  return (
    <div className="relative overflow-hidden rounded-xl border p-4 transition-all"
      style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
      <div className="flex gap-0.5 mb-2">
        {Array.from({ length: t.stars }).map((_, i) => (
          <Star key={i} className="h-3 w-3 fill-yellow-400 text-yellow-400" />
        ))}
      </div>
      <p className="text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }}>
        "{t.quote}"
      </p>
      <div className="mt-3 flex items-center gap-2">
        <div
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold"
          style={{ background: `${t.color}30`, color: t.color }}
        >
          {t.initials}
        </div>
        <div>
          <div className="text-[11px] font-semibold text-white/80">{t.name}</div>
          <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>{t.role}</div>
        </div>
      </div>
      {/* Dot indicators */}
      <div className="mt-3 flex items-center gap-1.5">
        {TESTIMONIALS.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className="rounded-full transition-all"
            style={{
              width: i === idx ? 16 : 6,
              height: 4,
              background: i === idx ? t.color : "rgba(255,255,255,0.15)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Live activity feed ─────────────────────────────────────────────────────────
const LIVE_ITEMS = [
  { icon: "🏢", msg: "FitLife Stores — joined 2m ago" },
  { icon: "📧", msg: "Outreach Agent sent 12 emails · 3 replied" },
  { icon: "🔥", msg: "Trend: Silicone Food Bags +220% detected" },
  { icon: "💼", msg: "PetSupply Co. — joined 8m ago" },
  { icon: "🤝", msg: "Negotiation Agent booked 3 calls today" },
  { icon: "📊", msg: "LED Ring Light demand score hit 91/100" },
];

function LiveFeed() {
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setVisible((v) => Math.min(v + 1, LIVE_ITEMS.length - 1)), 2800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="space-y-1.5">
      {LIVE_ITEMS.slice(0, visible + 1).map((item, i) => (
        <div
          key={i}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-[11px]"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            animation: i === visible ? "slideIn 0.3s ease-out" : "none",
          }}
        >
          <span>{item.icon}</span>
          <span style={{ color: "rgba(255,255,255,0.6)" }}>{item.msg}</span>
          {i === 0 && (
            <span className="ml-auto flex items-center gap-1 text-[9px] font-semibold text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              LIVE
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Form field components ──────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5"
      style={{ color: "rgba(255,255,255,0.35)" }}>
      {children}
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text", autoFocus,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="h-12 w-full rounded-xl border px-4 text-sm text-white placeholder:text-white/20 focus:outline-none transition-all"
        style={{
          background: focused ? "rgba(124,58,237,0.08)" : "rgba(255,255,255,0.04)",
          borderColor: focused ? "rgba(124,58,237,0.6)" : "rgba(255,255,255,0.1)",
          boxShadow: focused ? "0 0 0 3px rgba(124,58,237,0.1)" : "none",
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </label>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "12px" }}>{label}</span>
      <span className="text-right text-xs font-medium text-white/80 max-w-[160px] truncate">{value}</span>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <span style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
      <span className={`text-right font-medium ${highlight ? "text-violet-300" : "text-white/80"}`}>{value}</span>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function SignupPage() {
  const spots = useSpotCount();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [aiStep, setAiStep] = useState(0);

  const [name, setName]           = useState("");
  const [email, setEmail]         = useState("");
  const [phone, setPhone]         = useState("");
  const [company, setCompany]     = useState("");
  const [companyType, setCompanyType] = useState("");
  const [revenue, setRevenue]     = useState("");
  const [goal, setGoal]           = useState<string | null>(null);

  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const canContinue = (() => {
    if (step === 0) return !!name.trim() && !!email.trim();
    if (step === 1) return !!company.trim() && !!companyType;
    if (step === 2) return !!goal;
    return true;
  })();

  async function submitSignup() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "signup-form",
          name, email, phone,
          company,
          industry: companyType,
          budget: revenue,
          useCases: goal ? [goal] : [],
          message:
            `Goal: ${goal ?? "—"}\n` +
            `Company type: ${companyType || "—"}\n` +
            `Revenue range: ${revenue || "—"}`,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setDone(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!done) return;
    const interval = setInterval(() => {
      setAiStep((s) => {
        if (s >= AI_MESSAGES.length - 1) { clearInterval(interval); return s; }
        return s + 1;
      });
    }, 900);
    return () => clearInterval(interval);
  }, [done]);

  // ── Completion screen ────────────────────────────────────────────────────────
  if (done) {
    const firstName = name.trim().split(" ")[0] || "there";
    return (
      <div
        className="flex min-h-[calc(100vh-64px)] items-center justify-center px-6 py-16"
        style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(124,58,237,0.15) 0%, transparent 70%), #07071a" }}
      >
        <div className="w-full max-w-lg text-center">
          {/* Pulsing brain */}
          <div className="relative mx-auto mb-6 flex h-24 w-24 items-center justify-center">
            <div className="absolute inset-0 rounded-full animate-ping"
              style={{ background: "rgba(124,58,237,0.2)", animationDuration: "2s" }} />
            <div className="absolute inset-2 rounded-full"
              style={{ background: "radial-gradient(circle, rgba(124,58,237,0.4) 0%, transparent 70%)", filter: "blur(8px)" }} />
            <div className="relative grid h-20 w-20 place-items-center rounded-full border"
              style={{ background: "linear-gradient(135deg, #1a0a3a, #0d0d1f)", borderColor: "rgba(168,125,255,0.4)" }}>
              <Brain className="h-9 w-9 text-violet-400" />
            </div>
          </div>

          <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-violet-400">
            {aiStep < AI_MESSAGES.length - 1 ? "AI Processing" : "Access Granted"}
          </div>
          <h1 className="text-3xl font-bold text-white">
            {aiStep < AI_MESSAGES.length - 1 ? "Setting up your agents" : `Welcome aboard, ${firstName}!`}
          </h1>

          <div className="mt-4 min-h-[24px]">
            <p key={aiStep} className="text-sm text-violet-300" style={{ animation: "fadeSlideIn 0.4s ease-out" }}>
              {AI_MESSAGES[aiStep]}
            </p>
          </div>

          {/* Progress bar */}
          <div className="mx-auto mt-4 h-1.5 max-w-xs overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${((aiStep + 1) / AI_MESSAGES.length) * 100}%`,
                background: "linear-gradient(90deg, #7c3aed, #06b6d4)",
                boxShadow: "0 0 8px rgba(124,58,237,0.6)",
              }}
            />
          </div>

          {/* Summary card */}
          <div className="mt-8 rounded-2xl border p-6 text-left"
            style={{ background: "rgba(13,13,31,0.9)", backdropFilter: "blur(12px)", borderColor: "rgba(255,255,255,0.1)" }}>
            <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-violet-400">
              Your AI Configuration
            </div>
            <div className="space-y-3 text-sm">
              <Row label="Name"    value={name} />
              <Row label="Email"   value={email} />
              <Row label="Company" value={`${company}${companyType ? ` · ${companyType}` : ""}`} />
              {revenue && <Row label="Revenue" value={revenue} />}
              <Row label="Primary Goal" value={GOALS.find((g) => g.id === goal)?.label ?? "—"} />
              <div className="border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                <Row label="Outreach ETA"    value="Within 24 hours" highlight />
                <Row label="Personalized for" value="Your exact niche" highlight />
              </div>
            </div>
          </div>

          {/* What's next */}
          <div className="mt-6 space-y-2.5 text-left">
            {[
              { icon: Brain,    text: "AI reviews your business profile & niche fit" },
              { icon: Mail,     text: `Personalized intro sent to ${email}` },
              { icon: Bot,      text: "Agent network configured around your goal" },
              { icon: Sparkles, text: "First results delivered within 24 hours of access" },
            ].map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-center gap-3 text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                  style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)" }}>
                  <Icon className="h-3.5 w-3.5 text-violet-400" />
                </div>
                {text}
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col items-center gap-3">
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 0 32px rgba(124,58,237,0.45)" }}
            >
              Preview the Platform <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
              Check your inbox for access details · No credit card needed
            </p>
          </div>
        </div>

        <style>{`
          @keyframes fadeSlideIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        `}</style>
      </div>
    );
  }

  // ── Main multi-step form ─────────────────────────────────────────────────────
  return (
    <div className="min-h-[calc(100vh-64px)] relative overflow-hidden"
      style={{ background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,58,237,0.12) 0%, transparent 60%), #07071a" }}>

      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-20 h-80 w-80 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)", filter: "blur(60px)" }} />
        <div className="absolute -right-20 bottom-40 h-60 w-60 rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)", filter: "blur(60px)" }} />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-10">

        {/* ── Top bar ── */}
        <div className="mb-8 flex items-center justify-between">
          <Link href="/welcome"
            className="inline-flex items-center gap-1.5 text-xs transition-colors hover:text-white/70"
            style={{ color: "rgba(255,255,255,0.4)" }}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to homepage
          </Link>
          <div className="flex items-center gap-3">
            {/* Spots badge */}
            <div className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold"
              style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#fca5a5" }}>
              <Clock className="h-3 w-3" />
              Only {spots} spots left this week
            </div>
            <Link href="/signin"
              className="text-[11px] transition-colors hover:text-white/70"
              style={{ color: "rgba(255,255,255,0.35)" }}>
              Already have access? <span className="text-violet-400 hover:text-violet-300">Sign in →</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_400px]">

          {/* ════════════════ LEFT — FORM ════════════════ */}
          <div>

            {/* Stats strip */}
            <div className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.label}
                  className="rounded-xl border px-3 py-2.5 text-center"
                  style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}>
                  <div className="text-lg font-bold text-white">{s.value}</div>
                  <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-3 mb-2">
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold transition-all"
                      style={{
                        background: i < step
                          ? "rgba(34,197,94,0.2)"
                          : i === step
                          ? "linear-gradient(135deg, #7c3aed, #4f46e5)"
                          : "rgba(255,255,255,0.06)",
                        color: i < step ? "#22c55e" : i === step ? "#fff" : "rgba(255,255,255,0.3)",
                        boxShadow: i === step ? "0 0 14px rgba(124,58,237,0.55)" : "none",
                      }}
                    >
                      {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span className="hidden text-xs sm:block"
                      style={{ color: i === step ? "#c4b5fd" : "rgba(255,255,255,0.3)" }}>
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="h-px w-8 transition-all"
                      style={{ background: i < step ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.1)" }} />
                  )}
                </div>
              ))}
            </div>
            <p className="mb-8 text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
              Step {step + 1} of {STEPS.length} · Free · No credit card
            </p>

            {/* Step content */}
            <div className="max-w-lg" key={step} style={{ animation: "fadeSlideIn 0.25s ease-out" }}>

              {step === 0 && (
                <div className="space-y-5">
                  <div>
                    <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-300"
                      style={{ borderColor: "rgba(124,58,237,0.3)", background: "rgba(124,58,237,0.08)" }}>
                      <Sparkles className="h-3 w-3" /> Early Access
                    </div>
                    <h1 className="mt-3 text-4xl font-bold leading-tight text-white">
                      Get early access
                    </h1>
                    <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Our AI reviews every application and configures your agent network personally. No templates.
                    </p>
                  </div>
                  <Field label="Full name" value={name} onChange={setName} placeholder="Sarah Chen" autoFocus />
                  <Field label="Work email" value={email} onChange={setEmail} placeholder="sarah@yourbrand.com" type="email" />
                  <Field label="Phone (optional)" value={phone} onChange={setPhone} placeholder="+1 (555) 000-0000" type="tel" />

                  {/* Logo strip */}
                  <div className="pt-2">
                    <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.2)" }}>
                      Trusted by operators from
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {LOGOS.map((l) => (
                        <span key={l} className="rounded-md border px-2.5 py-1 text-[10px]"
                          style={{ borderColor: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.02)" }}>
                          {l}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-5">
                  <div>
                    <h1 className="text-4xl font-bold text-white">About your business</h1>
                    <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
                      This personalizes your agent network and outreach strategy.
                    </p>
                  </div>
                  <Field label="Company name" value={company} onChange={setCompany} placeholder="Your company name" autoFocus />

                  <div>
                    <FieldLabel>Business type</FieldLabel>
                    <div className="grid grid-cols-2 gap-2">
                      {["E-commerce Brand", "Retail Chain", "Distributor", "Wholesaler", "Boutique", "Marketplace Seller", "Agency", "Other"].map((t) => (
                        <button key={t} onClick={() => setCompanyType(t)}
                          className="rounded-lg border p-3 text-left text-xs transition-all"
                          style={{
                            background: companyType === t ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.03)",
                            borderColor: companyType === t ? "rgba(124,58,237,0.55)" : "rgba(255,255,255,0.08)",
                            color: companyType === t ? "#c4b5fd" : "rgba(255,255,255,0.5)",
                            boxShadow: companyType === t ? "0 0 0 1px rgba(124,58,237,0.2)" : "none",
                          }}>
                          {companyType === t && <CheckCircle2 className="mb-1 h-3 w-3 text-violet-400" />}
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <FieldLabel>Monthly revenue (optional)</FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {REVENUE_RANGES.map((r) => (
                        <button key={r} onClick={() => setRevenue(r === revenue ? "" : r)}
                          className="rounded-lg border px-3 py-2 text-xs transition-all"
                          style={{
                            background: revenue === r ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.03)",
                            borderColor: revenue === r ? "rgba(124,58,237,0.55)" : "rgba(255,255,255,0.08)",
                            color: revenue === r ? "#c4b5fd" : "rgba(255,255,255,0.5)",
                          }}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <div>
                    <h1 className="text-4xl font-bold text-white">What's your #1 goal?</h1>
                    <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Your agent network will be configured around this objective.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {GOALS.map((g) => {
                      const selected = goal === g.id;
                      return (
                        <button key={g.id} onClick={() => setGoal(g.id)}
                          className="rounded-xl border p-4 text-left transition-all"
                          style={{
                            background: selected ? "rgba(124,58,237,0.12)" : "rgba(255,255,255,0.03)",
                            borderColor: selected ? "rgba(124,58,237,0.55)" : "rgba(255,255,255,0.08)",
                            boxShadow: selected ? "0 0 24px rgba(124,58,237,0.12)" : "none",
                          }}>
                          <div className="flex items-start justify-between">
                            <g.icon className="h-5 w-5" style={{ color: selected ? "#a78bfa" : "rgba(255,255,255,0.35)" }} />
                            {selected && (
                              <div className="grid h-5 w-5 place-items-center rounded-full"
                                style={{ background: "rgba(124,58,237,0.3)" }}>
                                <Check className="h-3 w-3 text-violet-300" />
                              </div>
                            )}
                          </div>
                          <div className="mt-3 text-sm font-semibold text-white">{g.label}</div>
                          <div className="mt-0.5 text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>{g.desc}</div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Security badge */}
                  <div className="flex items-center gap-3 rounded-xl border px-4 py-3 text-[11px]"
                    style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.4)" }}>
                    <Shield className="h-4 w-4 text-green-400 shrink-0" />
                    SOC 2 Type II · GDPR · CCPA compliant · Data never used to train models
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="mt-10 flex items-center justify-between">
                {step > 0 ? (
                  <button onClick={back}
                    className="flex items-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm transition-all hover:bg-white/5"
                    style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                ) : <span />}
                <button
                  onClick={step === STEPS.length - 1 ? () => void submitSignup() : next}
                  disabled={!canContinue || submitting}
                  className="inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold text-white transition-all disabled:opacity-30"
                  style={{
                    background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                    boxShadow: canContinue && !submitting ? "0 0 28px rgba(124,58,237,0.5)" : "none",
                  }}>
                  {step === STEPS.length - 1
                    ? (submitting ? "Submitting…" : "Request AI Outreach")
                    : "Continue"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              {submitError && (
                <div className="mt-3 rounded-lg border px-3 py-2 text-[12px]"
                  style={{ borderColor: "rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)", color: "#fca5a5" }}>
                  {submitError}
                </div>
              )}
            </div>
          </div>

          {/* ════════════════ RIGHT — SIDEBAR ════════════════ */}
          <aside className="hidden lg:flex lg:flex-col lg:gap-4">
            <div className="sticky top-8 space-y-4">

              {/* AI Profile Preview */}
              <div className="rounded-2xl border p-5"
                style={{ background: "rgba(13,13,31,0.85)", borderColor: "rgba(255,255,255,0.09)", backdropFilter: "blur(16px)" }}>
                <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-violet-400">
                  <Brain className="h-3.5 w-3.5" /> Your AI Profile
                </div>
                <div className="space-y-2.5 text-sm">
                  <PreviewRow label="Name"    value={name    || "—"} />
                  <PreviewRow label="Email"   value={email   || "—"} />
                  <PreviewRow label="Company" value={company || "—"} />
                  <PreviewRow label="Type"    value={companyType || "—"} />
                  {revenue && <PreviewRow label="Revenue" value={revenue} />}
                  <PreviewRow label="Goal"    value={goal ? GOALS.find((g) => g.id === goal)?.label ?? "—" : "—"} />
                  <div className="mt-3 rounded-lg border p-3"
                    style={{ borderColor: "rgba(124,58,237,0.3)", background: "rgba(124,58,237,0.08)" }}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-400">AI Outreach ETA</div>
                    <div className="mt-1 text-xl font-bold text-white">Within 24 hours</div>
                    <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                      Personalized to your exact business
                    </div>
                  </div>
                </div>
              </div>

              {/* Testimonial carousel */}
              <TestimonialTicker />

              {/* Live activity */}
              <div className="rounded-2xl border p-4"
                style={{ background: "rgba(13,13,31,0.8)", borderColor: "rgba(255,255,255,0.07)" }}>
                <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-violet-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                  Live activity
                </div>
                <LiveFeed />
              </div>

              {/* What happens after */}
              <div className="rounded-2xl border p-4"
                style={{ background: "rgba(13,13,31,0.8)", borderColor: "rgba(255,255,255,0.07)" }}>
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
                  What happens after you submit
                </div>
                <ol className="space-y-2.5">
                  {[
                    "AI analyzes your profile & niche fit",
                    "Personalized strategy deck prepared",
                    "Dedicated account agent assigned",
                    "First products & buyers identified in your category",
                  ].map((s, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[12px]"
                      style={{ color: "rgba(255,255,255,0.55)" }}>
                      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-bold"
                        style={{ background: "rgba(124,58,237,0.2)", color: "#a78bfa" }}>
                        {i + 1}
                      </span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Trust */}
              <div className="flex items-center justify-center gap-4 rounded-xl border px-4 py-3 text-[10px]"
                style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.3)" }}>
                <span>🔒 SOC 2 Type II</span>
                <span>·</span>
                <span>GDPR Compliant</span>
                <span>·</span>
                <span>256-bit encryption</span>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
