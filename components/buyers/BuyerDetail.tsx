"use client";
import {
  Building2,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Linkedin,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  PhoneCall,
  Send,
  Sparkles,
  Target,
  Workflow,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Buyer } from "@/lib/buyers";
import BuyerHistory from "@/components/buyers/BuyerHistory";

type LocalTask = {
  id: string;
  buyerId: string;
  buyerCompany: string;
  buyerName: string;
  // Optional contact fields snapshotted at task-creation so /tasks can wire
  // tel: / mailto: actions even when the underlying buyer record is later
  // unavailable. Older tasks created before these fields existed get them
  // back-filled at /tasks render-time via the live buyer lookup.
  buyerPhone?: string;
  buyerEmail?: string;
  type: "phone" | "sequence";
  createdAt: string;
};

type DraftPayload = {
  email: { subject: string; body: string };
  linkedin: { body: string };
  sms: { body: string };
};

const STATUS_TONE: Record<string, string> = {
  New: "bg-bg-hover text-ink-secondary",
  Contacted: "bg-accent-blue/15 text-accent-blue",
  Replied: "bg-accent-cyan/15 text-accent-cyan",
  Negotiating: "bg-accent-amber/15 text-accent-amber",
  "Closed Won": "bg-accent-green/15 text-accent-green",
  "Closed Lost": "bg-accent-red/15 text-accent-red",
};

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-bg-border bg-bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className="mt-1 text-base font-semibold">{value}</div>
      {hint && <div className="text-[11px] text-ink-tertiary">{hint}</div>}
    </div>
  );
}

export default function BuyerDetail({ b }: { b: Buyer & { rationale?: string; forProduct?: string } }) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<DraftPayload | null>(null);
  const [meta, setMeta] = useState<{ usedFallback: boolean; cost?: number; model: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"email" | "linkedin" | "sms">("email");
  const [taskAdded, setTaskAdded] = useState<"phone" | "sequence" | null>(null);
  // Cadence picker state — opens an inline panel that lists active
  // cadences and enrolls the buyer with one click. Lazy-loaded on
  // first open so the buyer page doesn't pay for /api/cadences when
  // the operator never opens the picker.
  const [cadencePickerOpen, setCadencePickerOpen] = useState(false);
  const [cadences, setCadences] = useState<
    | Array<{ id: string; name: string; description?: string; steps: Array<{ channel: string }>; active: boolean }>
    | null
  >(null);
  const [cadencesLoading, setCadencesLoading] = useState(false);
  const [enrollMessage, setEnrollMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const targetProduct = b.forProduct || b.matchedProducts[0] || "Trending Product";
  const productCategory = b.industry; // best guess from buyer industry

  /**
   * Create a task in localStorage. Returns the new task id so callers can
   * route the operator into the call session (Place call now flow).
   */
  function addTask(type: "phone" | "sequence"): string {
    const id = `t_${Date.now().toString(36)}`;
    const taskRecord: LocalTask = {
      id,
      buyerId: b.id,
      buyerCompany: b.company,
      buyerName: b.decisionMaker,
      // Snapshot contact info so /tasks can render tel:/mailto: actions
      // without re-fetching the buyer (works even if the buyer record
      // is later edited or removed).
      buyerPhone: b.phone,
      buyerEmail: b.email,
      type,
      createdAt: new Date().toISOString(),
    };
    // Dual-write during the localStorage → /api/tasks migration:
    //   - localStorage stays primary for instant UI feedback + offline use
    //   - /api/tasks POST makes the task visible to teammates on other
    //     browsers/devices. Server failure doesn't block the local write,
    //     so this operator still sees the task either way.
    // Once /tasks fully migrates to server-read, the localStorage write
    // can drop. Same id on both sides so dedupe works in the meantime.
    try {
      const raw = localStorage.getItem("aicos:tasks:v1");
      const tasks: LocalTask[] = raw ? JSON.parse(raw) : [];
      tasks.unshift(taskRecord);
      localStorage.setItem("aicos:tasks:v1", JSON.stringify(tasks.slice(0, 50)));
    } catch {}
    fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(taskRecord),
    }).catch(() => {});
    setTaskAdded(type);
    setTimeout(() => setTaskAdded(null), 2500);
    return id;
  }

  /**
   * One-click call flow: create the phone task AND navigate to /tasks
   * with ?focus=<id> so the call-session drawer auto-opens. Operator
   * goes from buyer → call session in one motion.
   */
  function placeCallNow() {
    const id = addTask("phone");
    router.push(`/tasks?focus=${encodeURIComponent(id)}`);
  }

  async function openCadencePicker() {
    setCadencePickerOpen(true);
    if (cadences) return; // already cached
    setCadencesLoading(true);
    try {
      const r = await fetch("/api/cadences", {
        cache: "no-store",
        credentials: "include",
      });
      if (!r.ok) throw new Error(`Load failed (${r.status})`);
      const d = await r.json();
      setCadences(d.cadences ?? []);
    } catch (e) {
      setEnrollMessage({
        tone: "err",
        text: e instanceof Error ? e.message : "Couldn't load cadences",
      });
    } finally {
      setCadencesLoading(false);
    }
  }

  async function enrollIn(cadenceId: string) {
    setEnrollMessage(null);
    try {
      const r = await fetch(`/api/cadences/${cadenceId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          buyerId: b.id,
          buyerName: b.decisionMaker,
          buyerCompany: b.company,
          buyerEmail: b.email,
          buyerPhone: b.phone,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        // 409 = already enrolled — surface the duplicate-protection
        // error verbatim so the operator knows why the click did nothing.
        throw new Error(d.error ?? `Enroll failed (${r.status})`);
      }
      setEnrollMessage({
        tone: "ok",
        text: `Enrolled in cadence — first step scheduled.`,
      });
      setCadencePickerOpen(false);
    } catch (e) {
      setEnrollMessage({
        tone: "err",
        text: e instanceof Error ? e.message : "Enroll failed",
      });
    }
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerId: b.id,
          buyerCompany: b.company,
          buyerName: b.decisionMaker,
          buyerTitle: b.decisionMakerTitle,
          buyerIndustry: b.industry,
          buyerType: b.type,
          buyerLocation: b.location,
          buyerRationale: b.rationale,
          productName: targetProduct,
          productCategory,
          productNiche: productCategory,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setDraft({
        email: data.draft.email,
        linkedin: data.draft.linkedin,
        sms: data.draft.sms,
      });
      setMeta({
        usedFallback: data.draft.usedFallback,
        cost: data.draft.estCostUsd,
        model: data.draft.modelUsed,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-5 p-5">
      <div className="flex items-start gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-xl bg-gradient-card text-xl font-bold text-brand-200">
          {b.company.split(" ").slice(0, 2).map((w) => w[0]).join("")}
        </div>
        <div className="flex-1">
          <div className="text-xl font-bold">{b.company}</div>
          <div className="flex items-center gap-2 text-xs text-ink-tertiary">
            <span>{b.type}</span>·<span>{b.industry}</span>
          </div>
          {/* Slice 131: copy buyer ID -- mirror of slice 112/117/128/130
              clipboard pattern. */}
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(b.id).catch(() => {});
            }}
            className="mt-1 inline-flex items-center gap-1 rounded bg-bg-hover px-1.5 py-0.5 font-mono text-[10px] text-ink-tertiary transition hover:bg-bg-app hover:text-brand-300"
            title={`Copy ${b.id}`}
          >
            {b.id}
            <Clipboard className="h-2.5 w-2.5" />
          </button>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-md bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-200">
              Intent {b.intentScore}
            </span>
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[b.status]}`}>
              {b.status}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Fit Score" value={`${b.fit}%`} />
        <Stat label="Revenue" value={b.revenue} />
        <Stat label="Employees" value={b.employees} />
      </div>

      {/* Relationship history — drafts + transactions for this buyer */}
      <BuyerHistory buyerCompany={b.company} />

      <div className="rounded-lg border border-bg-border bg-bg-card">
        <div className="border-b border-bg-border px-4 py-2.5 text-xs font-semibold">
          Decision Maker
        </div>
        <div className="space-y-2 px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-brand text-xs font-bold">
              {b.decisionMaker.split(" ").map((n) => n[0]).join("")}
            </div>
            <div>
              <div className="font-medium">{b.decisionMaker}</div>
              <div className="text-[11px] text-ink-tertiary">{b.decisionMakerTitle}</div>
            </div>
          </div>
          <a href={`mailto:${b.email}`} className="flex items-center gap-2 text-xs text-brand-300 hover:text-brand-200">
            <Mail className="h-3.5 w-3.5 text-ink-tertiary" />
            {b.email}
          </a>
          {b.phone && (
            <a href={`tel:${b.phone}`} className="flex items-center gap-2 text-xs text-brand-300 hover:text-brand-200">
              <Phone className="h-3.5 w-3.5 text-ink-tertiary" />
              {b.phone}
            </a>
          )}
          <div className="flex items-center gap-2 text-xs text-ink-secondary">
            <Linkedin className="h-3.5 w-3.5 text-ink-tertiary" />
            {b.linkedin}
          </div>
          <div className="flex items-center gap-2 text-xs text-ink-secondary">
            <Building2 className="h-3.5 w-3.5 text-ink-tertiary" />
            {b.website}
          </div>
          <div className="flex items-center gap-2 text-xs text-ink-secondary">
            <MapPin className="h-3.5 w-3.5 text-ink-tertiary" />
            {b.location}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
          <Target className="h-3.5 w-3.5 text-brand-300" />
          Matched Products ({b.matchedProducts.length})
        </div>
        <div className="space-y-1.5">
          {b.matchedProducts.map((p) => (
            <div
              key={p}
              className="flex items-center justify-between rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-xs"
            >
              <span className="text-ink-secondary">{p}</span>
              <span className="font-semibold text-accent-green">High fit</span>
            </div>
          ))}
        </div>
      </div>

      {!draft ? (
        <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand-200">
            <Sparkles className="h-4 w-4" /> Outreach Agent
          </div>
          <p className="mt-2 text-xs text-ink-secondary">
            Generate a personalized outreach package (email, LinkedIn, SMS) for{" "}
            <span className="text-ink-primary font-medium">{b.decisionMaker}</span> at{" "}
            <span className="text-ink-primary font-medium">{b.company}</span> about{" "}
            <span className="text-brand-300">{targetProduct}</span>. Uses Claude Sonnet 4.6.
          </p>
          {error && (
            <div className="mt-2 rounded-md border border-accent-red/30 bg-accent-red/5 p-2 text-[11px] text-accent-red">
              {error}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-accent-green/30 bg-accent-green/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-accent-green">
              <CheckCircle2 className="h-4 w-4" /> Drafts ready
            </div>
            <span className="text-[10px] text-ink-tertiary">
              {meta?.model}
              {meta && !meta.usedFallback && meta.cost != null && (
                <> · ${meta.cost.toFixed(5)}</>
              )}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-1 rounded-md border border-bg-border bg-bg-card p-1 text-xs">
            {(
              [
                ["email", "Email", Mail],
                ["linkedin", "LinkedIn", Linkedin],
                ["sms", "SMS", MessageSquare],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => setActiveTab(k)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 ${
                  activeTab === k
                    ? "bg-brand-500/15 text-brand-200"
                    : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-md border border-bg-border bg-bg-card p-3">
            {activeTab === "email" && (
              <div className="space-y-2 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                    Subject
                  </div>
                  <div className="font-semibold">{draft.email.subject}</div>
                </div>
                <div className="border-t border-bg-border pt-2">
                  <pre className="whitespace-pre-wrap font-sans text-ink-secondary">
                    {draft.email.body}
                  </pre>
                </div>
              </div>
            )}
            {activeTab === "linkedin" && (
              <pre className="whitespace-pre-wrap font-sans text-xs text-ink-secondary">
                {draft.linkedin.body}
              </pre>
            )}
            {activeTab === "sms" && (
              <div className="text-xs">
                <pre className="whitespace-pre-wrap font-sans text-ink-secondary">
                  {draft.sms.body}
                </pre>
                <div className="mt-2 text-[10px] text-ink-tertiary">
                  {draft.sms.body.length} / 160 chars
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {taskAdded && (
        <div className="rounded-lg border border-accent-green/30 bg-accent-green/5 p-2.5 text-xs">
          <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-accent-green" />
          {taskAdded === "phone" ? "Phone task added to your queue." : "Sequence drafted — added to outreach queue."}
        </div>
      )}

      {enrollMessage && (
        <div
          className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${
            enrollMessage.tone === "ok"
              ? "border-accent-green/30 bg-accent-green/5 text-accent-green"
              : "border-accent-red/30 bg-accent-red/5 text-accent-red"
          }`}
        >
          {enrollMessage.tone === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : null}
          <div className="flex-1">{enrollMessage.text}</div>
          <button onClick={() => setEnrollMessage(null)}>
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {cadencePickerOpen && (
        <div className="rounded-lg border border-accent-blue/40 bg-accent-blue/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[12px] font-semibold">Enroll {b.decisionMaker} in a cadence</div>
            <button
              onClick={() => setCadencePickerOpen(false)}
              className="text-ink-tertiary hover:text-ink-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {cadencesLoading ? (
            <div className="flex items-center gap-2 py-2 text-[11px] text-ink-tertiary">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading cadences…
            </div>
          ) : cadences == null ? null : cadences.length === 0 ? (
            <div className="py-2 text-[11px] text-ink-tertiary">
              No cadences yet.{" "}
              <Link href="/cadences" className="text-accent-blue underline">
                Create one
              </Link>{" "}
              first.
            </div>
          ) : cadences.filter((c) => c.active).length === 0 ? (
            <div className="py-2 text-[11px] text-ink-tertiary">
              All cadences are inactive.{" "}
              <Link href="/cadences" className="text-accent-blue underline">
                Activate one
              </Link>{" "}
              to enroll.
            </div>
          ) : (
            <div className="space-y-1.5">
              {cadences
                .filter((c) => c.active)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void enrollIn(c.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-md border border-bg-border bg-bg-card px-2.5 py-1.5 text-left text-[12px] hover:border-accent-blue/50 hover:bg-bg-hover"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{c.name}</div>
                      {c.description && (
                        <div className="truncate text-[10px] text-ink-tertiary">{c.description}</div>
                      )}
                    </div>
                    <div className="text-[10px] text-ink-tertiary">
                      {c.steps.length} step{c.steps.length === 1 ? "" : "s"}
                    </div>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 pb-2">
        <button
          onClick={generate}
          disabled={generating}
          className="flex items-center justify-center gap-2 rounded-lg bg-gradient-brand py-2.5 text-sm font-semibold shadow-glow disabled:opacity-60"
        >
          {generating ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Drafting…</>
          ) : draft ? (
            <><Sparkles className="h-4 w-4" /> Regenerate</>
          ) : (
            <><Send className="h-4 w-4" /> Generate Outreach</>
          )}
        </button>
        <button
          onClick={() => addTask("sequence")}
          className="flex items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card py-2.5 text-sm hover:bg-bg-hover"
        >
          <MessageSquare className="h-4 w-4" /> Draft Sequence
        </button>
        <button
          onClick={() => addTask("phone")}
          className="flex items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card py-2.5 text-sm hover:bg-bg-hover"
        >
          <Phone className="h-4 w-4" /> Add Phone Task
        </button>
        {/* One-click "Place call" -- creates the task AND routes to /tasks
            with ?focus=<id> so the call-session drawer auto-opens. Operator
            goes from buyer record to active call session in one click.
            Only shown when the buyer has a phone on record (gate matches
            the call action; no point creating a task that can't dial). */}
        {b.phone && (
          <button
            onClick={placeCallNow}
            title={`Create phone task and open call session for ${b.phone}`}
            className="flex items-center justify-center gap-2 rounded-lg bg-accent-green/15 py-2.5 text-sm font-semibold text-accent-green hover:bg-accent-green/25"
          >
            <PhoneCall className="h-4 w-4" /> Place Call
          </button>
        )}
        <button
          onClick={() => void openCadencePicker()}
          title="Add this buyer to a multi-touch cadence"
          className="flex items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card py-2.5 text-sm hover:bg-bg-hover"
        >
          <Workflow className="h-4 w-4" /> Enroll in Cadence
        </button>
        <Link
          href={`/crm?company=${encodeURIComponent(b.company)}`}
          className="flex items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card py-2.5 text-sm hover:bg-bg-hover"
        >
          <ExternalLink className="h-4 w-4" /> Open in CRM
        </Link>
      </div>
    </div>
  );
}
