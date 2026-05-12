"use client";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  MailX,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

/**
 * Public unsubscribe confirmation page. Reached from the footer link
 * embedded in every outbound email.
 *
 * URL shape: /u/<token>?e=<email>
 *
 * Page flow:
 *   1. Show "Unsubscribe <email> from AVYN emails?" with one Confirm button
 *   2. On click → POST /api/unsubscribe with the token + email
 *   3. Show green confirmation on success, or red error on bad token
 *
 * The token IS the auth — verified server-side via HMAC. The page is
 * also reachable for the RFC 8058 one-click flow (Gmail / iCloud native
 * Unsubscribe UI POSTs directly to /api/unsubscribe and never opens
 * this page), so this is the operator-friendly fallback.
 */

export default function UnsubscribePage() {
  const params = useParams<{ token: string }>();
  const search = useSearchParams();
  const token = typeof params?.token === "string" ? params.token : "";
  const email = (search?.get("e") ?? search?.get("email") ?? "").trim();

  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Validate that we at least have both pieces before showing the button
  const hasBoth = token.length >= 16 && email.length > 0;

  async function confirm() {
    if (!hasBoth || state === "loading") return;
    setState("loading");
    setError(null);
    try {
      const r = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error ?? `Unsubscribe failed (${r.status})`);
        setState("error");
        return;
      }
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setState("error");
    }
  }

  // Auto-focus the confirm button when the page loads so keyboard users
  // can press Enter immediately.
  useEffect(() => {
    if (state === "idle" && hasBoth) {
      const btn = document.getElementById("unsubscribe-confirm");
      btn?.focus();
    }
  }, [state, hasBoth]);

  return (
    <div className="min-h-screen bg-bg-app text-ink-primary">
      <div className="mx-auto max-w-md px-5 py-16">
        {/* Brand */}
        <div className="mb-8 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-brand shadow-glow">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="text-lg font-bold tracking-tight">AVYN Commerce</div>
        </div>

        {!hasBoth ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-accent-red">
              <AlertCircle className="h-6 w-6" />
              <h1 className="text-xl font-bold">Unsubscribe link unusable</h1>
            </div>
            <p className="text-sm text-ink-secondary">
              The link is missing the email address or token. Open the link from your email
              directly — don&apos;t copy parts of it.
            </p>
          </div>
        ) : state === "done" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-accent-green">
              <CheckCircle2 className="h-7 w-7" />
              <h1 className="text-xl font-bold">You&apos;re unsubscribed</h1>
            </div>
            <p className="text-sm text-ink-secondary">
              <span className="font-medium text-ink-primary">{email}</span> will no longer
              receive marketing or outreach emails from AVYN Commerce. We honor unsubscribes
              immediately.
            </p>
            <div className="rounded-xl border border-bg-border bg-bg-card p-4 text-[12px] text-ink-secondary">
              <p className="font-medium text-ink-primary">If this was a mistake</p>
              <p className="mt-1">
                Reply to the email you received and ask to be re-added. We&apos;ll restore you
                manually after confirming.
              </p>
            </div>
            <a
              href="https://avyncommerce.com"
              className="inline-flex items-center gap-1 text-sm text-brand-200 hover:underline"
            >
              avyncommerce.com <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : state === "error" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-accent-red">
              <AlertCircle className="h-6 w-6" />
              <h1 className="text-xl font-bold">Unsubscribe failed</h1>
            </div>
            <p className="text-sm text-ink-secondary">{error}</p>
            <p className="text-[12px] text-ink-tertiary">
              You can reply to the original email and ask to be removed — we honor unsubscribes
              by hand within one business day.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-ink-tertiary">
                Unsubscribe
              </div>
              <h1 className="mt-1 text-2xl font-bold leading-tight">
                Stop emails to this address?
              </h1>
              <p className="mt-2 text-sm text-ink-secondary">
                Click confirm and we&apos;ll stop sending marketing + outreach emails to{" "}
                <span className="font-medium text-ink-primary">{email}</span> immediately.
                We won&apos;t share your address or use it for anything else.
              </p>
            </div>

            <div className="rounded-xl border border-bg-border bg-bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bg-hover">
                  <MailX className="h-4 w-4 text-ink-secondary" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{email}</div>
                  <div className="text-[11px] text-ink-tertiary">
                    Permanent unsubscribe · honored immediately
                  </div>
                </div>
              </div>
            </div>

            <button
              id="unsubscribe-confirm"
              onClick={confirm}
              disabled={state === "loading"}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-brand px-4 py-3 text-sm font-semibold shadow-glow disabled:opacity-60"
            >
              {state === "loading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <MailX className="h-4 w-4" />
                  Confirm unsubscribe
                </>
              )}
            </button>

            <p className="text-center text-[11px] text-ink-tertiary">
              Required by US CAN-SPAM Act. We honor opt-outs immediately and permanently.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
