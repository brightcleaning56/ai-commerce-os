"use client";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Bot, Brain, Building2, Calendar, Check,
  CheckCircle2, ChevronRight, Globe, Lock, Mail, MessageSquare,
  Phone, Shield, ShieldCheck, Sparkles, TrendingUp, Users, X, Zap,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";

// ── Static data ────────────────────────────────────────────────────────────────

const STEPS = [
  { id: "business",     label: "Business Details" },
  { id: "requirements", label: "Requirements" },
  { id: "solutions",    label: "Solutions" },
  { id: "review",       label: "Review" },
] as const;

const COMPANY_SIZES = ["1–10", "11–50", "51–200", "201–1,000", "1,000+"];

const INDUSTRIES = [
  "E-commerce / DTC", "Wholesale / B2B", "Retail Chain", "Marketplace Seller",
  "Brand / Manufacturer", "Logistics / 3PL", "Agency / Consultancy", "Other",
];

const USE_CASES = [
  { id: "trends",     label: "Product sourcing & trend discovery" },
  { id: "outreach",   label: "Buyer outreach automation" },
  { id: "suppliers",  label: "Supplier intelligence" },
  { id: "pipeline",   label: "Wholesale deal pipeline" },
  { id: "custom",     label: "Custom AI agent development" },
  { id: "whitelabel", label: "White-label deployment" },
];

const TIMELINES = ["ASAP", "Within 1 month", "1–3 months", "Exploring options"];

const WORKFLOW_NODES = [
  { label: "AI Agent Orchestration",   desc: "Multi-agent system built for your goals",      color: "#7c3aed" },
  { label: "Data & Intelligence Layer", desc: "Real-time data aggregation & analysis",        color: "#6366f1" },
  { label: "Automation Engine",         desc: "Outreach, negotiation & deal automation",      color: "#3b82f6" },
  { label: "Deal Pipeline",             desc: "AI-powered pipeline management",               color: "#06b6d4" },
  { label: "Revenue Intelligence",      desc: "Predictive analytics & growth insights",       color: "#22c55e" },
];

const ENTERPRISE_FEATURES = [
  { Icon: Brain,        label: "Custom AI agents",        desc: "Built specifically for your workflows" },
  { Icon: Shield,       label: "Dedicated infrastructure", desc: "Private cloud, your data stays yours" },
  { Icon: Users,        label: "SSO + SCIM",              desc: "Enterprise identity & provisioning" },
  { Icon: Globe,        label: "White-label",             desc: "Deploy under your own brand" },
  { Icon: Zap,          label: "Priority SLA",            desc: "99.99% uptime guarantee" },
  { Icon: Calendar,     label: "Onboarding team",         desc: "Dedicated success manager" },
];

const PLATFORM_STATS = [
  { value: "99.99%", label: "Uptime SLA",       icon: TrendingUp },
  { value: "24/7",   label: "AI Monitoring",    icon: Brain },
  { value: "Global", label: "Enterprise Scale", icon: Globe },
  { value: "12,458+",label: "Commerce Teams",  icon: Users },
];

const COMPLIANCE = [
  { label: "SOC 2",  sub: "Type II" },
  { label: "GDPR",   sub: "Compliant" },
  { label: "CCPA",   sub: "Compliant" },
  { label: "HIPAA",  sub: "Ready" },
  { label: "AES-256",sub: "Encryption" },
];

const NEXT_STEPS = [
  { n: "1", label: "We analyze",         sub: "your business" },
  { n: "2", label: "Architect review",   sub: "& discovery call" },
  { n: "3", label: "Custom AI stack",    sub: "& solution design" },
  { n: "4", label: "Live demo",          sub: "& pricing proposal" },
  { n: "5", label: "Deployment",         sub: "& onboarding" },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider"
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
        type={type} value={value} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-xl border px-4 text-sm text-white placeholder:text-white/20 focus:outline-none transition-all"
        style={{
          background: focused ? "rgba(124,58,237,0.07)" : "rgba(255,255,255,0.04)",
          borderColor: focused ? "rgba(124,58,237,0.6)" : "rgba(255,255,255,0.1)",
          boxShadow: focused ? "0 0 0 3px rgba(124,58,237,0.1)" : "none",
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </label>
  );
}

// ── Animated enterprise workflow diagram ────────────────────────────────────────
function WorkflowDiagram() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setActive((a) => (a + 1) % WORKFLOW_NODES.length), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="rounded-2xl border p-5"
      style={{ background: "rgba(8,8,26,0.9)", borderColor: "rgba(255,255,255,0.08)" }}>
      <div className="mb-4 text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: "rgba(255,255,255,0.35)" }}>
        Your Enterprise AI Workflow
      </div>

      {/* Central glow platform */}
      <div className="relative mb-4 flex items-center justify-center" style={{ height: 120 }}>
        <div className="absolute inset-0 flex items-end justify-center">
          <div className="h-8 w-48 rounded-full"
            style={{ background: "radial-gradient(ellipse, rgba(6,182,212,0.35) 0%, transparent 70%)", filter: "blur(8px)" }} />
        </div>
        <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl"
          style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(6,182,212,0.2))", border: "1px solid rgba(124,58,237,0.4)", boxShadow: "0 0 30px rgba(124,58,237,0.25), 0 0 60px rgba(6,182,212,0.1)" }}>
          <Brain className="h-8 w-8 text-violet-300" style={{ filter: "drop-shadow(0 0 8px rgba(168,125,255,0.8))" }} />
        </div>
        {/* Ring */}
        <div className="absolute h-32 w-32 rounded-full border border-violet-500/20 animate-ping"
          style={{ animationDuration: "3s" }} />
        <div className="absolute h-24 w-24 rounded-full border border-cyan-500/15" />
      </div>

      {/* Workflow nodes */}
      <div className="space-y-2">
        {WORKFLOW_NODES.map((n, i) => (
          <div key={n.label}
            className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all"
            style={{
              borderColor: active === i ? `${n.color}40` : "rgba(255,255,255,0.06)",
              background: active === i ? `${n.color}10` : "rgba(255,255,255,0.02)",
              boxShadow: active === i ? `0 0 12px ${n.color}15` : "none",
            }}>
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
              style={{ background: `${n.color}20`, border: `1px solid ${n.color}30` }}>
              <span className="text-[10px] font-bold" style={{ color: n.color }}>{i + 1}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white/80">{n.label}</div>
              <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>{n.desc}</div>
            </div>
            {active === i && (
              <div className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: n.color }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── AI advisor chat widget ──────────────────────────────────────────────────────
function AIAdvisor() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [messages, setMessages] = useState([
    { from: "ai", text: "Need help designing your custom AI commerce stack?" },
  ]);
  function send() {
    if (!msg.trim()) return;
    setMessages((m) => [
      ...m,
      { from: "user", text: msg },
      { from: "ai", text: "Great question. Our solutions team will cover that in your discovery call. Let's get you connected!" },
    ]);
    setMsg("");
  }
  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="mb-3 w-72 overflow-hidden rounded-2xl border shadow-2xl"
          style={{ background: "rgba(10,10,28,0.97)", borderColor: "rgba(124,58,237,0.3)", backdropFilter: "blur(20px)" }}>
          <div className="flex items-center justify-between border-b px-4 py-3"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2.5">
              <div className="relative grid h-8 w-8 place-items-center rounded-full"
                style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                <Bot className="h-4 w-4 text-white" />
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 bg-green-400"
                  style={{ borderColor: "rgba(10,10,28,1)" }} />
              </div>
              <div>
                <div className="text-xs font-bold text-white">AI Enterprise Advisor</div>
                <div className="flex items-center gap-1 text-[10px] text-green-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> Online
                </div>
              </div>
            </div>
            <button onClick={() => setOpen(false)}
              className="grid h-6 w-6 place-items-center rounded-md text-white/30 hover:bg-white/5 hover:text-white/60">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="max-h-52 overflow-y-auto space-y-2 p-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs`}
                  style={{
                    background: m.from === "user" ? "rgba(124,58,237,0.3)" : "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.8)",
                    borderRadius: m.from === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  }}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t px-3 py-2.5" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-2">
              <input
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Ask anything..."
                className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none"
                style={{ borderColor: "rgba(255,255,255,0.1)" }}
              />
              <button onClick={send}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                <ArrowRight className="h-3.5 w-3.5 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}
      <button onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm font-semibold text-white shadow-2xl transition-all hover:scale-105"
        style={{
          background: "linear-gradient(135deg, #1a0a3a, #0d0820)",
          borderColor: "rgba(124,58,237,0.4)",
          boxShadow: "0 0 24px rgba(124,58,237,0.3)",
        }}>
        <div className="relative grid h-8 w-8 place-items-center rounded-full"
          style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
          <Bot className="h-4 w-4 text-white" />
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 bg-green-400"
            style={{ borderColor: "rgba(10,10,28,0.97)" }} />
        </div>
        <div className="text-left">
          <div className="text-xs font-bold">AI Enterprise Advisor</div>
          <div className="text-[10px] font-normal" style={{ color: "rgba(255,255,255,0.4)" }}>Chat with AI →</div>
        </div>
      </button>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ContactPage() {
  const [step, setStep]         = useState(0);
  const [done, setDone]         = useState(false);

  // Step 0 — Business Details
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [company, setCompany]   = useState("");
  const [phone, setPhone]       = useState("");
  const [size, setSize]         = useState("");
  const [industry, setIndustry] = useState("");

  // Step 1 — Requirements
  const [selected, setSelected] = useState<string[]>([]);
  const [timeline, setTimeline] = useState("");
  const [budget, setBudget]     = useState("");

  // Step 2 — Solutions
  const [message, setMessage]   = useState("");

  const toggleUseCase = (id: string) =>
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  const canNext = (() => {
    if (step === 0) return !!name.trim() && !!email.trim() && !!company.trim();
    if (step === 1) return selected.length > 0;
    if (step === 2) return true;
    return true;
  })();

  // ── Success screen ────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-6"
        style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(124,58,237,0.14) 0%, transparent 70%), #07071a" }}>
        <div className="w-full max-w-lg text-center">
          <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-2xl"
            style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.25), rgba(79,70,229,0.2))", border: "1px solid rgba(124,58,237,0.5)", boxShadow: "0 0 40px rgba(124,58,237,0.3)" }}>
            <CheckCircle2 className="h-10 w-10 text-violet-300" />
          </div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-violet-400">Submitted</div>
          <h1 className="text-3xl font-bold text-white">Request received</h1>
          <p className="mt-3 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
            Our enterprise team will reach out to <span className="text-violet-300">{email}</span> within 1 business day with a custom proposal for <span className="text-white/80">{company}</span>.
          </p>
          <div className="mx-auto mt-8 max-w-sm rounded-2xl border p-5 text-left space-y-3"
            style={{ background: "rgba(13,13,31,0.9)", borderColor: "rgba(255,255,255,0.08)" }}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-violet-400 mb-3">What happens next</div>
            {NEXT_STEPS.map((s, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold"
                  style={{ background: "rgba(124,58,237,0.2)", color: "#a78bfa" }}>
                  {s.n}
                </span>
                {s.label} — {s.sub}
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-col items-center gap-3">
            <Link href="/demo"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 0 24px rgba(124,58,237,0.4)" }}>
              Preview the platform <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/welcome" className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
              Back to homepage
            </Link>
          </div>
        </div>
        <AIAdvisor />
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-64px)] overflow-hidden"
      style={{ background: "radial-gradient(ellipse 70% 40% at 50% 0%, rgba(124,58,237,0.1) 0%, transparent 60%), #07071a" }}>

      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-10 h-72 w-72 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)", filter: "blur(60px)" }} />
        <div className="absolute -right-16 top-40 h-56 w-56 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)", filter: "blur(60px)" }} />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 py-10 pb-24">
        <Link href="/welcome"
          className="mb-8 inline-flex items-center gap-1.5 text-xs transition-colors hover:text-white/70"
          style={{ color: "rgba(255,255,255,0.35)" }}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to homepage
        </Link>

        <div className="grid gap-8 lg:grid-cols-[1fr_380px_260px]">

          {/* ════════ LEFT — FORM ════════ */}
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
              style={{ borderColor: "rgba(124,58,237,0.35)", background: "rgba(124,58,237,0.1)", color: "#c4b5fd" }}>
              <Building2 className="h-3 w-3" /> Enterprise & Custom Plans
            </div>
            <h1 className="text-4xl font-bold leading-tight text-white">
              Let&apos;s build something<br />
              <span style={{ background: "linear-gradient(90deg, #c084fc, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                custom for your team
              </span>
            </h1>
            <p className="mt-3 max-w-md text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
              Tell us about your business. Our solutions team will prepare a personalized demo and custom pricing within 24 hours.
            </p>

            {/* Step indicator */}
            <div className="mt-8 mb-8 flex items-center gap-0">
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center">
                  <div className="flex items-center gap-2">
                    <div className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold transition-all"
                      style={{
                        background: i < step ? "rgba(34,197,94,0.25)" : i === step ? "linear-gradient(135deg, #7c3aed, #4f46e5)" : "rgba(255,255,255,0.07)",
                        color: i < step ? "#22c55e" : i === step ? "#fff" : "rgba(255,255,255,0.3)",
                        boxShadow: i === step ? "0 0 14px rgba(124,58,237,0.5)" : "none",
                      }}>
                      {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span className="hidden text-[11px] sm:block"
                      style={{ color: i === step ? "#c4b5fd" : "rgba(255,255,255,0.3)" }}>
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="mx-3 h-px w-8"
                      style={{ background: i < step ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.1)" }} />
                  )}
                </div>
              ))}
            </div>

            {/* Step content */}
            <div key={step} style={{ animation: "fadeSlideIn 0.25s ease-out" }}>

              {step === 0 && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Full name"    value={name}    onChange={setName}    placeholder="Sarah Chen"           autoFocus />
                    <Field label="Work email"   value={email}   onChange={setEmail}   placeholder="sarah@company.com"   type="email" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Company"      value={company} onChange={setCompany} placeholder="Your company name" />
                    <Field label="Phone (optional)" value={phone} onChange={setPhone} placeholder="+1 (555) 000-0000" type="tel" />
                  </div>
                  <div>
                    <FieldLabel>Company size</FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {COMPANY_SIZES.map((s) => (
                        <button key={s} onClick={() => setSize(s === size ? "" : s)}
                          className="rounded-lg border px-3 py-2 text-xs transition-all"
                          style={{
                            background: size === s ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.03)",
                            borderColor: size === s ? "rgba(124,58,237,0.55)" : "rgba(255,255,255,0.08)",
                            color: size === s ? "#c4b5fd" : "rgba(255,255,255,0.5)",
                          }}>
                          {s} employees
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Industry</FieldLabel>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {INDUSTRIES.map((ind) => (
                        <button key={ind} onClick={() => setIndustry(ind === industry ? "" : ind)}
                          className="rounded-lg border px-2 py-2 text-[11px] text-left transition-all"
                          style={{
                            background: industry === ind ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.03)",
                            borderColor: industry === ind ? "rgba(124,58,237,0.55)" : "rgba(255,255,255,0.08)",
                            color: industry === ind ? "#c4b5fd" : "rgba(255,255,255,0.5)",
                          }}>
                          {ind}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <FieldLabel>What do you need? (select all that apply)</FieldLabel>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {USE_CASES.map((u) => {
                        const on = selected.includes(u.id);
                        return (
                          <button key={u.id} onClick={() => toggleUseCase(u.id)}
                            className="flex items-center gap-3 rounded-xl border p-3.5 text-left text-xs transition-all"
                            style={{
                              background: on ? "rgba(124,58,237,0.12)" : "rgba(255,255,255,0.03)",
                              borderColor: on ? "rgba(124,58,237,0.55)" : "rgba(255,255,255,0.08)",
                              color: on ? "#c4b5fd" : "rgba(255,255,255,0.55)",
                            }}>
                            <div className="grid h-5 w-5 shrink-0 place-items-center rounded"
                              style={{
                                background: on ? "rgba(124,58,237,0.3)" : "rgba(255,255,255,0.06)",
                                border: on ? "1px solid rgba(124,58,237,0.6)" : "1px solid rgba(255,255,255,0.12)",
                              }}>
                              {on && <Check className="h-3 w-3 text-violet-300" />}
                            </div>
                            {u.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Timeline</FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {TIMELINES.map((t) => (
                        <button key={t} onClick={() => setTimeline(t === timeline ? "" : t)}
                          className="rounded-lg border px-3 py-2 text-xs transition-all"
                          style={{
                            background: timeline === t ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.03)",
                            borderColor: timeline === t ? "rgba(124,58,237,0.55)" : "rgba(255,255,255,0.08)",
                            color: timeline === t ? "#c4b5fd" : "rgba(255,255,255,0.5)",
                          }}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Estimated budget (optional)</FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {["< $5K/mo", "$5K–$15K/mo", "$15K–$50K/mo", "$50K+/mo", "Custom / Enterprise"].map((b) => (
                        <button key={b} onClick={() => setBudget(b === budget ? "" : b)}
                          className="rounded-lg border px-3 py-2 text-xs transition-all"
                          style={{
                            background: budget === b ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.03)",
                            borderColor: budget === b ? "rgba(124,58,237,0.55)" : "rgba(255,255,255,0.08)",
                            color: budget === b ? "#c4b5fd" : "rgba(255,255,255,0.5)",
                          }}>
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <FieldLabel>Anything else? (optional)</FieldLabel>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Tell us about your current stack, specific challenges, integrations needed, or timeline..."
                      rows={5}
                      className="mt-1 w-full rounded-xl border px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none resize-none transition-all"
                      style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)" }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(124,58,237,0.6)"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                    />
                  </div>
                  <div className="flex items-start gap-3 rounded-xl border px-4 py-3 text-[11px]"
                    style={{ borderColor: "rgba(34,197,94,0.2)", background: "rgba(34,197,94,0.04)", color: "rgba(255,255,255,0.5)" }}>
                    <ShieldCheck className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    Your data is secure and encrypted. We never share it with third parties. SOC 2 Type II certified.
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <h2 className="text-xl font-bold text-white">Review your request</h2>
                  <div className="space-y-3 rounded-2xl border p-5"
                    style={{ background: "rgba(13,13,31,0.8)", borderColor: "rgba(255,255,255,0.08)" }}>
                    {[
                      { label: "Name",       value: name },
                      { label: "Email",      value: email },
                      { label: "Company",    value: company },
                      { label: "Size",       value: size ? `${size} employees` : "—" },
                      { label: "Industry",   value: industry || "—" },
                      { label: "Needs",      value: selected.map((id) => USE_CASES.find((u) => u.id === id)?.label).join(", ") || "—" },
                      { label: "Timeline",   value: timeline || "—" },
                      { label: "Budget",     value: budget || "—" },
                    ].map((r) => (
                      <div key={r.label} className="flex items-start justify-between gap-3 text-sm border-b pb-2"
                        style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                        <span style={{ color: "rgba(255,255,255,0.4)", minWidth: 80 }}>{r.label}</span>
                        <span className="text-right text-white/80">{r.value}</span>
                      </div>
                    ))}
                    {message && (
                      <div className="pt-1">
                        <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>Notes</div>
                        <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>{message}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Nav buttons */}
            <div className="mt-8 flex items-center justify-between">
              {step > 0 ? (
                <button onClick={() => setStep((s) => s - 1)}
                  className="flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm transition-all hover:bg-white/5"
                  style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
              ) : <span />}
              <button
                onClick={() => {
                  if (step < STEPS.length - 1) setStep((s) => s + 1);
                  else setDone(true);
                }}
                disabled={!canNext}
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition-all disabled:opacity-30"
                style={{
                  background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                  boxShadow: canNext ? "0 0 28px rgba(124,58,237,0.45)" : "none",
                }}>
                {step === STEPS.length - 1 ? "Submit Request" : `Next Step: ${STEPS[step + 1]?.label}`}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>
              <Lock className="mr-1 inline h-3 w-3" /> Your data is secure and encrypted
            </p>
          </div>

          {/* ════════ MIDDLE — WORKFLOW + ENTERPRISE FEATURES ════════ */}
          <div className="hidden lg:flex lg:flex-col lg:gap-4">
            <WorkflowDiagram />

            {/* Enterprise Includes */}
            <div className="rounded-2xl border p-5"
              style={{ background: "rgba(13,13,31,0.85)", borderColor: "rgba(255,255,255,0.08)" }}>
              <div className="mb-4 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "rgba(255,255,255,0.35)" }}>
                Enterprise Includes
              </div>
              <div className="space-y-3">
                {ENTERPRISE_FEATURES.map(({ Icon, label, desc }) => (
                  <div key={label} className="flex items-start gap-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                      style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.2)" }}>
                      <Icon className="h-3.5 w-3.5 text-violet-400" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white/80">{label}</div>
                      <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Direct contact */}
            <div className="rounded-2xl border p-5"
              style={{ background: "rgba(13,13,31,0.8)", borderColor: "rgba(255,255,255,0.08)" }}>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "rgba(255,255,255,0.35)" }}>
                Prefer to reach us directly?
              </div>
              <div className="space-y-2.5">
                <a href="mailto:enterprise@avyncommerce.com"
                  className="flex items-center gap-2.5 text-[11px] transition-colors hover:text-white"
                  style={{ color: "rgba(255,255,255,0.55)" }}>
                  <Mail className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                  enterprise@avyncommerce.com
                </a>
                <a href="tel:+18005550100"
                  className="flex items-center gap-2.5 text-[11px] transition-colors hover:text-white"
                  style={{ color: "rgba(255,255,255,0.55)" }}>
                  <Phone className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                  +1 (800) 555-0100
                </a>
                <span className="flex items-center gap-2.5 text-[11px]"
                  style={{ color: "rgba(255,255,255,0.55)" }}>
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                  Live chat (Mon–Fri, 9am–6pm EST)
                </span>
              </div>
            </div>
          </div>

          {/* ════════ RIGHT — STATS + COMPLIANCE + NEXT STEPS ════════ */}
          <div className="hidden lg:flex lg:flex-col lg:gap-4">
            {/* Platform stats */}
            <div className="grid grid-cols-2 gap-2">
              {PLATFORM_STATS.map(({ value, label, icon: Icon }) => (
                <div key={label} className="rounded-xl border p-3 text-center"
                  style={{ background: "rgba(13,13,31,0.8)", borderColor: "rgba(255,255,255,0.08)" }}>
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <Icon className="h-3 w-3 text-violet-400" />
                  </div>
                  <div className="text-lg font-bold text-white">{value}</div>
                  <div className="text-[9px] uppercase tracking-wider mt-0.5"
                    style={{ color: "rgba(255,255,255,0.35)" }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Security & Compliance */}
            <div className="rounded-2xl border p-4"
              style={{ background: "rgba(13,13,31,0.85)", borderColor: "rgba(255,255,255,0.08)" }}>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "rgba(255,255,255,0.35)" }}>
                Security & Compliance
              </div>
              <div className="grid grid-cols-2 gap-2">
                {COMPLIANCE.map((c) => (
                  <div key={c.label} className="flex items-center gap-2 rounded-lg border p-2"
                    style={{ borderColor: "rgba(34,197,94,0.15)", background: "rgba(34,197,94,0.05)" }}>
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-green-400" />
                    <div>
                      <div className="text-[11px] font-semibold text-white/80">{c.label}</div>
                      <div className="text-[9px]" style={{ color: "rgba(255,255,255,0.35)" }}>{c.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* What happens next */}
            <div className="rounded-2xl border p-4"
              style={{ background: "rgba(13,13,31,0.8)", borderColor: "rgba(255,255,255,0.08)" }}>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "rgba(255,255,255,0.35)" }}>
                What Happens Next?
              </div>
              <div className="space-y-2.5">
                {NEXT_STEPS.map((s, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-bold mt-0.5"
                      style={{ background: "rgba(124,58,237,0.2)", color: "#a78bfa" }}>
                      {s.n}
                    </span>
                    <div>
                      <div className="text-[11px] font-semibold text-white/75">{s.label}</div>
                      <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{s.sub}</div>
                    </div>
                    {i < NEXT_STEPS.length - 1 && (
                      <ChevronRight className="ml-auto h-3 w-3 shrink-0 text-white/20 mt-0.5" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <AIAdvisor />

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
