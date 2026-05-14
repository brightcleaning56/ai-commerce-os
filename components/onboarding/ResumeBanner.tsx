"use client";
import { ArrowRight, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Floating "Resume your in-progress setup" banner.
 *
 * Mounted on the chooser + marketing pages so any visitor with an
 * active onboarding session (cookie present, status="active") gets a
 * one-click way to resume. Dismissible per-tab via sessionStorage so
 * the banner doesn't keep nagging within a single browsing session.
 *
 * Skips render entirely when:
 *   - No onboarding session cookie (GET /api/onboarding/save returns 404)
 *   - Session is completed or abandoned
 *   - User dismissed within this tab
 *
 * Hint shown in the banner: persona label + step count progress.
 */

const PERSONA_LANDING: Record<string, string> = {
  admin: "/onboarding/admin",
  team: "/onboarding/team",
  buyer: "/onboarding/buyer",
  supplier: "/onboarding/supplier",
  distributor: "/onboarding/distributor",
};

const PERSONA_LABEL: Record<string, string> = {
  admin: "Platform owner setup",
  team: "Team-member setup",
  buyer: "Buyer setup",
  supplier: "Supplier setup",
  distributor: "Distributor setup",
};

type SessionPayload = {
  persona: string | null;
  status: "active" | "completed" | "abandoned";
  answers: Record<string, Record<string, unknown>>;
  currentStepId: string | null;
};

export default function ResumeBanner() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("avyn_resume_dismissed") === "1") {
      setHidden(true);
      return;
    }
    let cancelled = false;
    fetch("/api/onboarding/save", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const s: SessionPayload | undefined = d?.session;
        if (s && s.persona && s.status === "active") setSession(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    setHidden(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("avyn_resume_dismissed", "1");
    }
  }

  if (hidden || !session?.persona) return null;
  const label = PERSONA_LABEL[session.persona] ?? "Setup";
  const href = PERSONA_LANDING[session.persona] ?? "/onboarding/start";
  // Step progress -- count how many step buckets have any answers
  const completed = Object.values(session.answers).filter(
    (b) => Object.values(b).some((v) => v != null && v !== "" && (!Array.isArray(v) || v.length > 0)),
  ).length;

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm rounded-xl border border-accent-blue/40 bg-bg-panel/95 px-4 py-3 shadow-2xl backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-blue/20">
          <ArrowRight className="h-4 w-4 text-accent-blue" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-ink-primary">{label} in progress</div>
          <div className="text-[11px] text-ink-tertiary">
            You answered {completed} step{completed === 1 ? "" : "s"} so far. Pick up where you left off.
          </div>
          <Link
            href={href}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-accent-blue hover:underline"
          >
            Resume setup <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <button
          onClick={dismiss}
          className="text-ink-tertiary hover:text-ink-primary"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
