"use client";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { useState } from "react";
import { PLANS, type Plan } from "@/lib/billing";

const STEPS = [
  { id: "account", label: "Account" },
  { id: "company", label: "Company" },
  { id: "goal", label: "Use Case" },
  { id: "agents", label: "Agents" },
  { id: "plan", label: "Plan" },
] as const;

const GOALS = [
  { id: "find-buyers", label: "Find new buyers", desc: "Build a pipeline of retailers + e-commerce brands", Icon: Building2 },
  { id: "find-products", label: "Find winning products", desc: "Source viral trends + verified suppliers", Icon: Sparkles },
  { id: "automate-outbound", label: "Automate outbound", desc: "Replace SDRs with AI personalization", Icon: Mail },
  { id: "scale-procurement", label: "Scale procurement", desc: "Corporate buying with audit trail", Icon: ShieldCheck },
];

const STARTER_AGENTS = [
  { id: "trend", name: "Trend Hunter", default: true },
  { id: "demand", name: "Demand Intelligence", default: true },
  { id: "supplier", name: "Supplier Finder", default: false },
  { id: "buyer", name: "Buyer Discovery", default: true },
  { id: "outreach", name: "Outreach Agent", default: true },
  { id: "negotiation", name: "Negotiation Agent", default: false },
  { id: "crm", name: "CRM Intelligence", default: true },
  { id: "risk", name: "Risk Agent", default: false },
  { id: "learning", name: "Learning Agent", default: true },
];

export default function SignupPage() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const [company, setCompany] = useState("");
  const [companyType, setCompanyType] = useState("");
  const [size, setSize] = useState("");

  const [goal, setGoal] = useState<string | null>(null);
  const [agents, setAgents] = useState<string[]>(STARTER_AGENTS.filter((a) => a.default).map((a) => a.id));
  const [planId, setPlanId] = useState<Plan["id"]>("growth");
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const canContinue = (() => {
    switch (step) {
      case 0: return !!email && !!name && password.length >= 8;
      case 1: return !!company && !!companyType;
      case 2: return !!goal;
      case 3: return agents.length > 0;
      case 4: return !!planId;
      default: return true;
    }
  })();

  if (done) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-brand shadow-glow">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-3xl font-bold">Workspace ready</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          We&apos;ve provisioned your agent network and queued the first scan. Your dashboard is loading.
        </p>
        <div className="mx-auto mt-8 max-w-md rounded-xl border border-bg-border bg-bg-card p-5 text-left">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-secondary">Workspace</span>
            <span className="font-semibold">{company || "Your Workspace"}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-ink-secondary">Plan</span>
            <span className="font-semibold">
              {PLANS.find((p) => p.id === planId)?.name} · ${PLANS.find((p) => p.id === planId)?.monthly}/mo
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-ink-secondary">Agents activated</span>
            <span className="font-semibold">{agents.length} of {STARTER_AGENTS.length}</span>
          </div>
        </div>
        <Link
          href="/"
          className="mx-auto mt-8 inline-flex items-center gap-2 rounded-lg bg-gradient-brand px-6 py-3 text-sm font-semibold shadow-glow"
        >
          Go to dashboard <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-180px)] max-w-7xl grid-cols-1 px-6 py-12 lg:grid-cols-[1fr_400px] lg:gap-12">
      <div>
        <Link
          href="/welcome"
          className="inline-flex items-center gap-1 text-xs text-ink-tertiary hover:text-ink-primary"
        >
          <ArrowLeft className="h-3 w-3" /> Back to homepage
        </Link>

        <div className="mt-8 max-w-xl">
          {/* Stepper */}
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <div
                  className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold ${
                    i < step
                      ? "bg-accent-green/20 text-accent-green"
                      : i === step
                      ? "bg-gradient-brand text-white shadow-glow"
                      : "bg-bg-hover text-ink-tertiary"
                  }`}
                >
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`h-px w-8 ${
                      i < step ? "bg-accent-green/40" : "bg-bg-border"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-ink-tertiary">
            Step {step + 1} of {STEPS.length} · {STEPS[step].label}
          </div>

          {/* Step content */}
          <div className="mt-8">
            {step === 0 && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-3xl font-bold">Create your account</h1>
                  <p className="mt-1 text-sm text-ink-secondary">
                    14 days free · no credit card required.
                  </p>
                </div>
                <Field label="Work email" value={email} onChange={setEmail} placeholder="you@yourcompany.com" type="email" />
                <Field label="Full name" value={name} onChange={setName} placeholder="Sarah Chen" />
                <Field
                  label="Password (8+ characters)"
                  value={password}
                  onChange={setPassword}
                  type="password"
                />
                <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card py-2.5 text-sm hover:bg-bg-hover">
                  <span className="grid h-4 w-4 place-items-center rounded bg-white text-[10px] font-bold text-black">G</span>
                  Continue with Google
                </button>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-3xl font-bold">Tell us about your company</h1>
                  <p className="mt-1 text-sm text-ink-secondary">
                    We&apos;ll tune the agents to your industry on day one.
                  </p>
                </div>
                <Field label="Company name" value={company} onChange={setCompany} placeholder="Acme Brand Co." />
                <div>
                  <Label>Company type</Label>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {[
                      "E-commerce Brand",
                      "Retail Chain",
                      "Distributor",
                      "Wholesaler",
                      "Boutique",
                      "Marketplace Seller",
                      "Procurement Team",
                      "Agency",
                    ].map((t) => (
                      <button
                        key={t}
                        onClick={() => setCompanyType(t)}
                        className={`rounded-lg border p-3 text-left text-xs ${
                          companyType === t
                            ? "border-brand-500/60 bg-brand-500/10 text-brand-200"
                            : "border-bg-border bg-bg-card text-ink-secondary hover:bg-bg-hover"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Team size</Label>
                  <div className="mt-1 grid grid-cols-4 gap-2">
                    {["1-5", "6-25", "26-100", "100+"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setSize(s)}
                        className={`rounded-lg border py-2 text-xs ${
                          size === s
                            ? "border-brand-500/60 bg-brand-500/10 text-brand-200"
                            : "border-bg-border bg-bg-card text-ink-secondary hover:bg-bg-hover"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-3xl font-bold">What should we automate first?</h1>
                  <p className="mt-1 text-sm text-ink-secondary">
                    Pick a primary goal — you can change it later.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {GOALS.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setGoal(g.id)}
                      className={`rounded-xl border p-4 text-left ${
                        goal === g.id
                          ? "border-brand-500/60 bg-brand-500/10"
                          : "border-bg-border bg-bg-card hover:bg-bg-hover"
                      }`}
                    >
                      <g.Icon className="h-5 w-5 text-brand-300" />
                      <div className="mt-3 text-sm font-semibold">{g.label}</div>
                      <div className="mt-0.5 text-[11px] text-ink-tertiary">{g.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-3xl font-bold">Pick your starting agents</h1>
                  <p className="mt-1 text-sm text-ink-secondary">
                    Default selection is tuned to your goal. Toggle off any you don&apos;t want yet.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {STARTER_AGENTS.map((a) => {
                    const on = agents.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        onClick={() =>
                          setAgents(on ? agents.filter((x) => x !== a.id) : [...agents, a.id])
                        }
                        className={`flex items-center justify-between rounded-lg border p-3 text-left ${
                          on ? "border-brand-500/60 bg-brand-500/10" : "border-bg-border bg-bg-card hover:bg-bg-hover"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Bot className={`h-4 w-4 ${on ? "text-brand-300" : "text-ink-tertiary"}`} />
                          <span className="text-sm font-medium">{a.name}</span>
                        </div>
                        <span
                          className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                            on ? "bg-gradient-brand" : "bg-bg-hover"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                              on ? "left-[18px]" : "left-0.5"
                            }`}
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-3 text-xs text-ink-secondary">
                  <span className="font-semibold text-brand-200">{agents.length}</span> agents selected · activate more later from the Agent Store.
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-3xl font-bold">Pick a plan</h1>
                  <p className="mt-1 text-sm text-ink-secondary">
                    First 14 days are free on every tier — change or cancel any time.
                  </p>
                </div>

                <div className="flex overflow-hidden rounded-lg border border-bg-border bg-bg-card text-xs">
                  <button
                    onClick={() => setCycle("monthly")}
                    className={`flex-1 px-3 py-1.5 ${
                      cycle === "monthly" ? "bg-brand-500/20 text-brand-200" : "text-ink-secondary"
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setCycle("annual")}
                    className={`flex-1 px-3 py-1.5 ${
                      cycle === "annual" ? "bg-brand-500/20 text-brand-200" : "text-ink-secondary"
                    }`}
                  >
                    Annual <span className="text-[10px] text-accent-green">−17%</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {PLANS.map((p) => {
                    const price = cycle === "monthly" ? p.monthly : Math.round(p.annual / 12);
                    return (
                      <button
                        key={p.id}
                        onClick={() => setPlanId(p.id)}
                        className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left ${
                          planId === p.id
                            ? "border-brand-500/60 bg-brand-500/10"
                            : "border-bg-border bg-bg-card hover:bg-bg-hover"
                        }`}
                      >
                        <span
                          className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${
                            planId === p.id ? "border-brand-400 bg-brand-400" : "border-bg-border"
                          }`}
                        >
                          {planId === p.id && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div className="font-semibold">
                              {p.name}
                              {p.badge && (
                                <span className="ml-2 rounded-md bg-bg-hover/60 px-1.5 py-0.5 text-[10px] text-ink-secondary">
                                  {p.badge}
                                </span>
                              )}
                            </div>
                            <div className="font-bold">
                              ${price.toLocaleString()}
                              <span className="text-[11px] font-normal text-ink-tertiary">/mo</span>
                            </div>
                          </div>
                          <div className="text-[11px] text-ink-tertiary">{p.tagline}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="mt-10 flex items-center justify-between">
            {step > 0 ? (
              <button
                onClick={back}
                className="rounded-lg border border-bg-border bg-bg-card px-4 py-2 text-sm hover:bg-bg-hover"
              >
                Back
              </button>
            ) : (
              <span />
            )}
            <button
              onClick={() => (step === STEPS.length - 1 ? setDone(true) : next())}
              disabled={!canContinue}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-brand px-5 py-2.5 text-sm font-semibold shadow-glow disabled:cursor-not-allowed disabled:opacity-40"
            >
              {step === STEPS.length - 1 ? "Create workspace" : "Continue"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Right rail — preview */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-4">
          <div className="rounded-xl border border-bg-border bg-bg-card p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-300">
              <Sparkles className="h-3.5 w-3.5" /> Your workspace · live preview
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="text-ink-tertiary">Owner</span>
                <span className="text-right font-medium">
                  {name || <span className="text-ink-tertiary">—</span>}
                  <div className="text-[11px] text-ink-tertiary">{email || "(no email yet)"}</div>
                </span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-ink-tertiary">Company</span>
                <span className="text-right font-medium">
                  {company || <span className="text-ink-tertiary">—</span>}
                  <div className="text-[11px] text-ink-tertiary">
                    {companyType || "—"} {size && `· ${size}`}
                  </div>
                </span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-ink-tertiary">Goal</span>
                <span className="text-right font-medium">
                  {goal ? GOALS.find((g) => g.id === goal)?.label : <span className="text-ink-tertiary">—</span>}
                </span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-ink-tertiary">Agents</span>
                <span className="text-right font-medium">
                  {agents.length} active
                </span>
              </div>
              <div className="flex items-start justify-between gap-2 border-t border-bg-border pt-3">
                <span className="text-ink-tertiary">Plan</span>
                <span className="text-right font-medium">
                  {PLANS.find((p) => p.id === planId)?.name} · $
                  {cycle === "monthly"
                    ? PLANS.find((p) => p.id === planId)?.monthly
                    : Math.round((PLANS.find((p) => p.id === planId)?.annual ?? 0) / 12)
                  }/mo
                  <div className="text-[11px] text-accent-green">
                    14-day trial · ${cycle === "monthly" ? "0" : "0"}/mo until trial ends
                  </div>
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-bg-border bg-bg-card p-5">
            <div className="text-xs font-semibold">What happens after you click&nbsp;create</div>
            <ol className="mt-3 space-y-2 text-[11px] text-ink-secondary">
              {[
                "Your workspace is provisioned with the agents you picked",
                "Trend Hunter runs its first scan within 60 seconds",
                "Buyer Discovery seeds your first 100 prospects",
                "You get a tour of the dashboard + a 30-min onboarding call",
              ].map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-brand-500/15 text-[9px] font-bold text-brand-200">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border border-bg-border bg-bg-hover/40 p-4 text-[11px] text-ink-secondary">
            <ShieldCheck className="mb-2 h-4 w-4 text-accent-green" />
            SOC 2 Type II · GDPR · CCPA · data encrypted at rest. Your data never trains base models.
          </div>
        </div>
      </aside>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 h-11 w-full rounded-lg border border-bg-border bg-bg-card px-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
      />
    </label>
  );
}
