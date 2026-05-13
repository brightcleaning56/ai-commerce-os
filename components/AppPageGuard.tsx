"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, ShieldAlert } from "lucide-react";
import { useCapabilities } from "@/components/CapabilityContext";
import { requiredCapabilityForPath } from "@/lib/nav";

/**
 * Layout-level capability guard.
 *
 * Looks up the capability required for the current pathname via
 * lib/nav.ts (longest-prefix match against NAV_SECTIONS + ADMIN_NAV).
 * If the signed-in session lacks it, renders a friendly denial wall
 * instead of the page content. Otherwise renders {children}.
 *
 * Why a wall instead of redirect: silently bouncing users to / hides
 * what they tried to access and makes "shareable URLs to forbidden
 * pages" look broken. Showing a wall is honest: "you don't have
 * voice:read; ask the workspace owner."
 *
 * Paths with no nav-mapped capability fall through ungated. That's
 * deliberate: pages like /settings (personal config) and any future
 * routes we haven't classified yet stay accessible until someone
 * adds a `requires` entry for them in lib/nav.ts.
 *
 * Owner always passes (can() short-circuits for Owner inside
 * CapabilityContext). While capabilities are still loading we show
 * a thin shimmer to avoid flashing "denied" then revealing the page.
 */
export default function AppPageGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { can, me, loading } = useCapabilities();

  const required = requiredCapabilityForPath(pathname || "/");

  // No specific capability for this path → render through.
  if (!required) return <>{children}</>;

  // Until we know the user's caps, show a thin skeleton instead of
  // flashing "denied" → page contents.
  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-2 py-8">
        <div className="h-6 w-48 animate-pulse rounded bg-bg-hover" />
        <div className="h-32 w-full animate-pulse rounded bg-bg-hover" />
      </div>
    );
  }

  if (can(required)) return <>{children}</>;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-2xl border border-bg-border bg-bg-card p-6 text-center">
        <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-accent-amber/10">
          <Lock className="h-5 w-5 text-accent-amber" />
        </div>
        <h1 className="text-lg font-semibold">You don&apos;t have access to this page</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          Your role is{" "}
          <span className="font-mono text-ink-primary">{me?.role ?? "unknown"}</span>
          {" "}and it doesn&apos;t include{" "}
          <span className="font-mono text-ink-primary">{required}</span>.
        </p>
        <p className="mt-2 text-[12px] text-ink-tertiary">
          Ask the workspace owner to grant the capability on{" "}
          <span className="font-mono">/admin/users</span>, or sign in with a role that has it.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Link
            href="/"
            className="rounded-lg bg-gradient-brand px-4 py-2 text-sm font-semibold shadow-glow"
          >
            Back to Command Center
          </Link>
          <Link
            href="/signin"
            className="inline-flex items-center gap-1 rounded-lg border border-bg-border bg-bg-app px-3 py-2 text-sm text-ink-secondary hover:text-ink-primary"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Switch user
          </Link>
        </div>
      </div>
    </div>
  );
}
