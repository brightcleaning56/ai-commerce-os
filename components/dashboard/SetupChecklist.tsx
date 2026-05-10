"use client";
import { ArrowRight, CheckCircle2, Circle, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type Stats = {
  hasAnyData: boolean;
  totals: {
    opportunities: number;
    buyersContacted: number;
    dealsInPipeline: number;
  };
  counts: {
    products: number;
    buyers: number;
    drafts: number;
    runs: number;
    transactions: number;
  };
};

type Operator = { name?: string; email?: string };

type Step = {
  key: string;
  title: string;
  hint: string;
  done: boolean;
  cta: { label: string; href: string };
};

const DISMISS_KEY = "avyn:setup-checklist-dismissed";

export default function SetupChecklist() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [op, setOp] = useState<Operator | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {}

    Promise.all([
      fetch("/api/dashboard/stats", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/operator", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([s, o]) => {
      if (cancelled) return;
      if (s) setStats(s);
      if (o) setOp(o);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (dismissed || !stats) return null;

  const steps: Step[] = [
    {
      key: "operator",
      title: "Set up your operator profile",
      hint: "Identity used for outreach signatures, quotes, and contracts",
      done: !!op?.name && !!op?.email && op.email !== "you@example.com",
      cta: { label: "Open Settings", href: "/settings" },
    },
    {
      key: "pipeline",
      title: "Run your first pipeline",
      hint: "Trend Hunter → Buyer Discovery → Outreach end-to-end (~90s)",
      done: stats.counts.runs > 0 || stats.counts.products > 0,
      cta: { label: "Run Pipeline", href: "/pipeline" },
    },
    {
      key: "approve",
      title: "Approve a draft",
      hint: "Review AI-generated outreach in the approval queue",
      done: stats.counts.drafts > 0,
      cta: { label: "Open Approvals", href: "/approvals" },
    },
    {
      key: "send",
      title: "Send your first outreach",
      hint: "Email a buyer with the AI-drafted message",
      done: stats.totals.buyersContacted > 0,
      cta: { label: "Open Outreach", href: "/outreach" },
    },
    {
      key: "transact",
      title: "Open your first transaction",
      hint: "Buyer signs contract → escrow holds funds → supplier paid on delivery",
      done: stats.counts.transactions > 0,
      cta: { label: "Open Deals", href: "/deals" },
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const total = steps.length;
  const allDone = completed === total;

  // Hide once everything is done — but offer dismiss explicitly so the user can
  // hide it anytime.
  if (allDone) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  return (
    <div className="rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-500/8 to-transparent p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/15">
            <Sparkles className="h-4 w-4 text-brand-300" />
          </div>
          <div>
            <div className="text-sm font-semibold">
              Quick start · {completed} of {total} complete
            </div>
            <div className="text-[11px] text-ink-tertiary">
              Tracking real progress through your AVYN workspace.
            </div>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
          aria-label="Dismiss"
          title="Hide quick start"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-hover">
        <div
          className="h-full rounded-full bg-gradient-brand transition-all"
          style={{ width: `${(completed / total) * 100}%` }}
        />
      </div>

      {/* Steps */}
      <div className="mt-4 grid grid-cols-1 gap-2">
        {steps.map((s, i) => (
          <div
            key={s.key}
            className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${
              s.done
                ? "border-accent-green/30 bg-accent-green/5"
                : "border-bg-border bg-bg-card"
            }`}
          >
            <div className="flex items-start gap-3">
              {s.done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-green" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ink-tertiary" />
              )}
              <div>
                <div className={`text-sm font-medium ${s.done ? "text-ink-secondary line-through" : ""}`}>
                  Step {i + 1}: {s.title}
                </div>
                <div className="text-[11px] text-ink-tertiary">{s.hint}</div>
              </div>
            </div>
            {!s.done && (
              <Link
                href={s.cta.href}
                className="flex shrink-0 items-center gap-1.5 self-center rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow"
              >
                {s.cta.label} <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
