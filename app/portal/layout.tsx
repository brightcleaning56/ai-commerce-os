"use client";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import ToastProvider from "@/components/Toast";

/**
 * /portal — external supplier-facing UI. Separate route group from
 * /(app) because suppliers should NEVER see the internal staff
 * sidebar, command palette, voice dialer, capability matrix, etc.
 *
 * No CapabilityProvider here — suppliers don't have staff
 * capabilities. Authentication is the supplier-portal token,
 * verified server-side by every /api/portal/* route via
 * requireSupplier.
 *
 * Sign-in is shared with /signin (which now accepts both staff and
 * supplier kinds via the same token paste field). After auth the
 * supplier lands here on /portal.
 */
export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-bg-app text-ink-primary">
        <header className="sticky top-0 z-30 border-b border-bg-border bg-bg-panel/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3">
            <Link href="/portal" className="flex items-center gap-2.5">
              <div
                className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-brand shadow-glow"
                style={{ boxShadow: "0 0 12px rgba(147,51,234,0.4)" }}
              >
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold leading-tight">AVYN Supplier Portal</div>
                <div className="text-[10px] text-ink-tertiary">Verification &middot; Documents</div>
              </div>
            </Link>
            <SignOutButton />
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
      </div>
    </ToastProvider>
  );
}

function SignOutButton() {
  async function signOut() {
    try {
      await fetch("/api/auth/signin", { method: "DELETE", credentials: "include" });
    } catch {
      // Swallow — we redirect either way.
    }
    window.location.href = "/signin";
  }
  return (
    <button
      type="button"
      onClick={() => void signOut()}
      className="rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-[12px] text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
    >
      Sign out
    </button>
  );
}
