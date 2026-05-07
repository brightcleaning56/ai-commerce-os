"use client";
import { Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

// useSearchParams() forces dynamic rendering — wrap in Suspense so Next.js
// can statically pre-render the shell while the form bails out to client-only.
export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg-base">
          <div className="mx-auto max-w-md px-6 py-32 text-center text-sm text-ink-tertiary">
            Loading…
          </div>
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `${res.status}`);
      }
      // On success the API sets the cookie; redirect to next
      router.push(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="mx-auto max-w-md px-6 py-32">
        <Link href="/welcome" className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-brand shadow-glow">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">AI Commerce OS</div>
            <div className="text-[11px] text-ink-tertiary">Operator sign-in</div>
          </div>
        </Link>

        <div className="mt-12 rounded-2xl border border-bg-border bg-bg-card p-8 shadow-glow">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/15">
              <Lock className="h-5 w-5 text-brand-300" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Sign in</h1>
              <p className="text-[11px] text-ink-tertiary">
                Bearer token required to access the operator dashboard
              </p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                Admin token
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="ADMIN_TOKEN from .env"
                className="w-full rounded-md border border-bg-border bg-bg-panel px-3 py-2 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
                autoFocus
              />
            </div>
            {error && (
              <div className="rounded-md border border-accent-red/30 bg-accent-red/5 px-3 py-2 text-xs text-accent-red">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading || !token}
              className="w-full rounded-md bg-gradient-brand px-4 py-2.5 text-sm font-semibold shadow-glow disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-6 border-t border-bg-border pt-4 text-[11px] text-ink-tertiary">
            <strong className="text-ink-secondary">Production:</strong> token is the
            value of <code className="rounded bg-bg-hover px-1">ADMIN_TOKEN</code> in your env. <br />
            <strong className="text-ink-secondary">Dev:</strong> if{" "}
            <code className="rounded bg-bg-hover px-1">ADMIN_TOKEN</code> is unset, no
            sign-in is required — just go to{" "}
            <Link href="/" className="text-brand-300">/</Link>.
          </div>
        </div>
      </div>
    </div>
  );
}
