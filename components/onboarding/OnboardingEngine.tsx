"use client";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  RotateCw,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  shouldShowQuestion,
  shouldShowStep,
  validateStep,
  type Persona,
  type Question,
  type Step,
} from "@/lib/onboarding";

/**
 * Generic step/question renderer used by every persona page. Reads
 * the flow definition from lib/onboarding.ts, hydrates current
 * answers from the session via GET /api/onboarding/save, auto-saves
 * on Next, finalizes via POST /api/onboarding/complete.
 *
 * Slice 1 ships this scaffolding so the chooser end-to-end works.
 * The renderer handles every QuestionType already; slices 2-6 just
 * add real questions to the flow registry.
 */

type Flow = { persona: Persona; steps: Step[] };

type EngineProps = {
  flow: Flow;
  /** Title shown above the step indicator (e.g. "Set up your workspace") */
  title: string;
  /** Optional sub-blurb under the title */
  blurb?: string;
};

type SessionPayload = {
  id: string;
  persona: Persona | null;
  status: "active" | "completed" | "abandoned";
  answers: Record<string, Record<string, unknown>>;
  currentStepId: string | null;
  email?: string;
};

export default function OnboardingEngine({ flow, title, blurb }: EngineProps) {
  const router = useRouter();
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Record<string, unknown>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate from session
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/onboarding/save", { cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          const sess: SessionPayload | undefined = d.session;
          if (sess && !cancelled) {
            setSession(sess);
            setAnswers(sess.answers ?? {});
            // Resume on the step the user was on, if it still exists in
            // this flow + isn't gated out by showIf.
            if (sess.currentStepId) {
              const visible = flow.steps.filter((s) => shouldShowStep(s, sess.answers));
              const idx = visible.findIndex((s) => s.id === sess.currentStepId);
              if (idx >= 0) setStepIndex(idx);
            }
          }
        } else if (r.status === 404) {
          // No session yet -- mint one with this flow's persona so
          // resume works on next reload.
          await fetch("/api/onboarding/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ persona: flow.persona }),
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load session");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [flow.persona, flow.steps]);

  // Steps that should actually render given current answers
  const visibleSteps = useMemo(
    () => flow.steps.filter((s) => shouldShowStep(s, answers)),
    [flow.steps, answers],
  );
  const currentStep: Step | undefined = visibleSteps[stepIndex];
  const isLast = stepIndex === visibleSteps.length - 1;

  function setAnswer(stepId: string, qid: string, value: unknown) {
    setAnswers((prev) => ({
      ...prev,
      [stepId]: { ...(prev[stepId] ?? {}), [qid]: value },
    }));
    // Clear that question's error on edit
    setErrors((prev) => {
      if (!prev[qid]) return prev;
      const next = { ...prev };
      delete next[qid];
      return next;
    });
  }

  const saveStep = useCallback(
    async (stepId: string, stepAnswers: Record<string, unknown>): Promise<boolean> => {
      setSaving(true);
      setError(null);
      try {
        const r = await fetch("/api/onboarding/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            persona: flow.persona,
            stepId,
            answers: stepAnswers,
            validate: true,
          }),
        });
        if (r.status === 422) {
          const d = await r.json();
          setErrors(d.errors ?? {});
          return false;
        }
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error ?? `Save failed (${r.status})`);
        }
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [flow.persona],
  );

  async function next() {
    if (!currentStep) return;
    const stepAnswers = answers[currentStep.id] ?? {};
    // Client-side validation for instant feedback
    const localErrors = validateStep(currentStep, stepAnswers);
    if (localErrors) {
      setErrors(localErrors);
      return;
    }
    const ok = await saveStep(currentStep.id, stepAnswers);
    if (!ok) return;
    if (!isLast) {
      setStepIndex((i) => Math.min(visibleSteps.length - 1, i + 1));
      setErrors({});
    } else {
      // Complete
      setCompleting(true);
      try {
        const r = await fetch("/api/onboarding/complete", { method: "POST" });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Couldn't complete onboarding");
        if (typeof d.landingHref === "string") {
          router.push(d.landingHref);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't complete onboarding");
      } finally {
        setCompleting(false);
      }
    }
  }

  function back() {
    setStepIndex((i) => Math.max(0, i - 1));
    setErrors({});
  }

  if (loading) {
    return (
      <div className="mx-auto flex h-64 max-w-3xl items-center justify-center text-ink-tertiary">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your setup…
      </div>
    );
  }

  if (!currentStep) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-xl border border-bg-border bg-bg-card p-10 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-accent-green" />
          <div className="text-base font-semibold">Nothing to set up here yet</div>
          <p className="mt-1 text-[12px] text-ink-tertiary">
            All steps are hidden by current answers. Restart from{" "}
            <Link href="/onboarding/start" className="text-accent-blue underline">
              the chooser
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
          Setup · {flow.persona === "team" ? "Team member" : flow.persona}
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{title}</h1>
        {blurb && <p className="mt-1 text-sm text-ink-secondary">{blurb}</p>}
      </div>

      {/* Step indicator */}
      <div className="mb-6 flex items-center gap-1">
        {visibleSteps.map((s, i) => (
          <div
            key={s.id}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < stepIndex
                ? "bg-accent-green"
                : i === stepIndex
                  ? "bg-accent-blue"
                  : "bg-bg-border"
            }`}
            title={s.label}
          />
        ))}
      </div>

      {/* Step body */}
      <div className="rounded-xl border border-bg-border bg-bg-card p-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">{currentStep.label}</h2>
          {currentStep.blurb && (
            <p className="mt-1 text-[12px] text-ink-tertiary">{currentStep.blurb}</p>
          )}
        </div>

        <div className="space-y-4">
          {currentStep.questions.map((q) => {
            if (!shouldShowQuestion(q, answers[currentStep.id] ?? {})) return null;
            return (
              <QuestionField
                key={q.id}
                question={q}
                value={answers[currentStep.id]?.[q.id]}
                error={errors[q.id]}
                onChange={(v) => setAnswer(currentStep.id, q.id, v)}
              />
            );
          })}
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={back}
            disabled={stepIndex === 0 || saving || completing}
            className="inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-app px-3 py-1.5 text-[12px] text-ink-secondary hover:bg-bg-hover disabled:opacity-30"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <div className="text-[10px] text-ink-tertiary">
            Step {stepIndex + 1} of {visibleSteps.length}
            {session && (
              <>
                {" · "}
                <span className="text-ink-secondary">auto-saved</span>
                <RotateCw className="ml-0.5 inline h-2.5 w-2.5" />
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => void next()}
            disabled={saving || completing}
            className="inline-flex items-center gap-1 rounded-md bg-accent-blue px-4 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {(saving || completing) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isLast ? (completing ? "Finishing…" : "Complete setup") : "Continue"}
            {!saving && !completing && (isLast ? <Check className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Question renderer ──────────────────────────────────────────────

function QuestionField({
  question,
  value,
  error,
  onChange,
}: {
  question: Question;
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
}) {
  const required = question.required ? <span className="ml-1 text-accent-red">*</span> : null;

  const labelBlock = (
    <div className="mb-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
        {question.label}
        {required}
      </div>
      {question.helper && (
        <div className="mt-0.5 text-[11px] text-ink-tertiary">{question.helper}</div>
      )}
    </div>
  );

  const errorBlock = error ? (
    <div className="mt-1 text-[11px] text-accent-red">{error}</div>
  ) : null;

  switch (question.type) {
    case "text":
    case "country":
      return (
        <div>
          {labelBlock}
          <input
            type="text"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={question.placeholder}
            maxLength={question.maxLength}
            className={`h-10 w-full rounded-md border bg-bg-app px-3 text-sm focus:outline-none focus:ring-1 ${
              error ? "border-accent-red focus:ring-accent-red/50" : "border-bg-border focus:ring-accent-blue/50"
            } ${question.type === "country" ? "uppercase font-mono" : ""}`}
          />
          {errorBlock}
        </div>
      );
    case "textarea":
      return (
        <div>
          {labelBlock}
          <textarea
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={question.placeholder}
            maxLength={question.maxLength}
            rows={4}
            className={`w-full rounded-md border bg-bg-app px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
              error ? "border-accent-red focus:ring-accent-red/50" : "border-bg-border focus:ring-accent-blue/50"
            }`}
          />
          {errorBlock}
        </div>
      );
    case "number":
      return (
        <div>
          {labelBlock}
          <input
            type="number"
            value={(value as number | string) ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number.parseFloat(e.target.value))}
            min={question.min}
            max={question.max}
            placeholder={question.placeholder}
            className={`h-10 w-full rounded-md border bg-bg-app px-3 text-sm tabular-nums focus:outline-none focus:ring-1 ${
              error ? "border-accent-red focus:ring-accent-red/50" : "border-bg-border focus:ring-accent-blue/50"
            }`}
          />
          {errorBlock}
        </div>
      );
    case "select":
      return (
        <div>
          {labelBlock}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(question.options ?? []).map((opt) => {
              const selected = value === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange(opt.value)}
                  className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    selected
                      ? "border-accent-blue bg-accent-blue/10 text-accent-blue"
                      : "border-bg-border bg-bg-app hover:bg-bg-hover"
                  }`}
                >
                  <div className="font-medium">{opt.label}</div>
                  {opt.description && (
                    <div className="mt-0.5 text-[11px] text-ink-tertiary">{opt.description}</div>
                  )}
                </button>
              );
            })}
          </div>
          {errorBlock}
        </div>
      );
    case "multiselect": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      function toggle(v: string) {
        onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
      }
      return (
        <div>
          {labelBlock}
          <div className="flex flex-wrap gap-1.5">
            {(question.options ?? []).map((opt) => {
              const selected = arr.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                    selected
                      ? "border-accent-blue bg-accent-blue/10 text-accent-blue"
                      : "border-bg-border bg-bg-app text-ink-secondary hover:bg-bg-hover"
                  }`}
                >
                  {selected && <Check className="mr-1 inline h-3 w-3" />}
                  {opt.label}
                </button>
              );
            })}
          </div>
          {errorBlock}
        </div>
      );
    }
    case "boolean":
      return (
        <div className="flex items-center justify-between rounded-md border border-bg-border bg-bg-app px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{question.label}</div>
            {question.helper && (
              <div className="mt-0.5 text-[11px] text-ink-tertiary">{question.helper}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onChange(!value)}
            className={`h-6 w-11 rounded-full transition-colors ${value ? "bg-accent-blue" : "bg-bg-border"}`}
            aria-pressed={!!value}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white transition-transform ${value ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </button>
        </div>
      );
    case "tags": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      const display = arr.join(", ");
      return (
        <div>
          {labelBlock}
          <input
            type="text"
            value={display}
            onChange={(e) =>
              onChange(e.target.value.split(",").map((t) => t.trim()).filter(Boolean))
            }
            placeholder={question.placeholder ?? "Comma-separated"}
            className="h-10 w-full rounded-md border border-bg-border bg-bg-app px-3 text-sm focus:outline-none focus:ring-1 focus:ring-accent-blue/50"
          />
          {errorBlock}
        </div>
      );
    }
    case "address": {
      const a = (value as { city?: string; state?: string; zip?: string; country?: string } | undefined) ?? {};
      function set(k: string, v: string) {
        onChange({ ...a, [k]: v });
      }
      return (
        <div>
          {labelBlock}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <input
              type="text"
              placeholder="City"
              value={a.city ?? ""}
              onChange={(e) => set("city", e.target.value)}
              className="h-10 rounded-md border border-bg-border bg-bg-app px-3 text-sm sm:col-span-2"
            />
            <input
              type="text"
              placeholder="State"
              value={a.state ?? ""}
              onChange={(e) => set("state", e.target.value.toUpperCase())}
              maxLength={3}
              className="h-10 rounded-md border border-bg-border bg-bg-app px-3 text-sm uppercase font-mono"
            />
            <input
              type="text"
              placeholder="ZIP"
              value={a.zip ?? ""}
              onChange={(e) => set("zip", e.target.value)}
              className="h-10 rounded-md border border-bg-border bg-bg-app px-3 text-sm"
            />
            <input
              type="text"
              placeholder="Country (US)"
              value={a.country ?? ""}
              onChange={(e) => set("country", e.target.value.toUpperCase().slice(0, 2))}
              maxLength={2}
              className="h-10 rounded-md border border-bg-border bg-bg-app px-3 text-sm uppercase font-mono sm:col-span-4"
            />
          </div>
          {errorBlock}
        </div>
      );
    }
    case "file":
    case "email-verify":
      // Slice 7 wires these. Render a placeholder that doesn't break the
      // engine but tells the operator/tester the type is reserved.
      return (
        <div className="rounded-md border border-dashed border-bg-border bg-bg-app/40 px-3 py-3 text-[12px] text-ink-tertiary">
          {labelBlock}
          {question.type === "file"
            ? "(File upload — wired in slice 7)"
            : "(Email magic-link verification — wired in slice 7)"}
        </div>
      );
    default:
      return null;
  }
}
