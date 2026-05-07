"use client";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect } from "react";

/**
 * Global error boundary for the App Router. Catches uncaught exceptions in
 * any (app) page or layout and renders a graceful fallback instead of a
 * blank screen.
 *
 * The `reset()` callback re-renders the segment — useful for transient errors.
 *
 * Errors are logged to the browser console + sent to Sentry if configured.
 * (Sentry's nextjs SDK auto-captures these when wrapped, but we also log
 * client-side so dev sees them in DevTools.)
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console; Sentry's @sentry/nextjs auto-captures errors.tsx errors
    // if installed.
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="mx-auto max-w-2xl px-6 py-32 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-accent-red/15">
          <AlertTriangle className="h-7 w-7 text-accent-red" />
        </div>
        <h1 className="mt-6 text-xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          The page hit an unexpected error. We've logged it. You can try
          reloading or go back to the dashboard.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-[10px] text-ink-tertiary">
            ref: {error.digest}
          </p>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => reset()}
            className="flex items-center gap-2 rounded-lg bg-gradient-brand px-4 py-2 text-sm font-semibold shadow-glow"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
          <a
            href="/"
            className="rounded-lg border border-bg-border bg-bg-card px-4 py-2 text-sm hover:bg-bg-hover"
          >
            Back to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
