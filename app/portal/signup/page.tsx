"use client";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Factory,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * /portal/signup — public supplier self-registration form.
 *
 * Does NOT require auth — middleware allow-lists this path. The
 * back-end (/api/portal/signup) rate-limits per IP and runs a
 * honeypot check before creating a SupplierRecord.
 *
 * The flow on success:
 *   1. Supplier submits form
 *   2. Server creates pending SupplierRecord, emails them confirmation
 *   3. Operator reviews on /admin/suppliers + issues a portal token
 *   4. Supplier follows the token link → /portal → uploads docs
 *
 * Suppliers don't get an instant sign-in token to keep abuse low. They
 * wait for the operator to vet them first.
 */

type SupplierKind = "Manufacturer" | "Wholesaler" | "Distributor" | "Dropship";

export default function SupplierSignupPage() {
  const [form, setForm] = useState({
    legalName: "",
    email: "",
    country: "US",
    kind: "Manufacturer" as SupplierKind,
    website: "",
    phone: "",
    city: "",
    state: "",
    categories: "",
    company_url_2: "", // honeypot — never shown
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
    alreadyRegistered?: boolean;
  } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const r = await fetch("/api/portal/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legalName: form.legalName,
          email: form.email,
          country: form.country.toUpperCase().slice(0, 2),
          kind: form.kind,
          website: form.website || undefined,
          phone: form.phone || undefined,
          city: form.city || undefined,
          state: form.state || undefined,
          categories: form.categories.split(",").map((c) => c.trim()).filter(Boolean),
          company_url_2: form.company_url_2,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setResult({ ok: false, message: d.error ?? `Signup failed (${r.status})` });
        return;
      }
      setResult({
        ok: true,
        message: d.message ?? "Signup received.",
        alreadyRegistered: d.alreadyRegistered,
      });
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.ok) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-2xl border border-bg-border bg-bg-card p-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-accent-green/15">
            <CheckCircle2 className="h-6 w-6 text-accent-green" />
          </div>
          <h1 className="text-lg font-bold">
            {result.alreadyRegistered ? "Already on file" : "Signup received"}
          </h1>
          <p className="mt-2 text-sm text-ink-secondary">{result.message}</p>
          {!result.alreadyRegistered && (
            <p className="mt-3 text-[12px] text-ink-tertiary">
              You&apos;ll get a confirmation email shortly. After review (typically 1-2 business days)
              we&apos;ll send a portal sign-in link so you can upload verification documents.
            </p>
          )}
          <a
            href="/"
            className="mt-5 inline-flex items-center gap-1 text-sm text-brand-200 hover:underline"
          >
            Back to home
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-brand shadow-glow">
          <Factory className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Join as a supplier</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Get verified. Get matched. Get paid through escrow you can trust.
        </p>
      </div>

      {/* Value props */}
      <div className="grid gap-3 md:grid-cols-3">
        <ValueProp Icon={ShieldCheck} label="AI Trust Score" body="Show buyers a verified 0-100 score they can rely on." />
        <ValueProp Icon={Building2} label="Self-serve verification" body="Upload your business docs once — we score the rest." />
        <ValueProp Icon={Sparkles} label="Matched to demand" body="Once verified, you appear in buyer searches in your category." />
      </div>

      {/* Form */}
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-bg-border bg-bg-card p-5">
        {result && !result.ok && (
          <div className="rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>{result.message}</div>
            </div>
          </div>
        )}

        <FormRow label="Legal company name *" required>
          <input
            value={form.legalName}
            onChange={(e) => setForm({ ...form, legalName: e.target.value })}
            placeholder="Shenzhen Bright Co., Ltd."
            maxLength={200}
            required
            className="h-10 w-full rounded-md border border-bg-border bg-bg-app px-3 text-sm"
          />
        </FormRow>

        <FormRow label="Business email *" required>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="contact@yourcompany.com"
            maxLength={200}
            required
            className="h-10 w-full rounded-md border border-bg-border bg-bg-app px-3 text-sm"
          />
          <div className="mt-1 text-[10px] text-ink-tertiary">
            Use your company domain — free-mail addresses (gmail, yahoo) reduce your trust score.
          </div>
        </FormRow>

        <div className="grid grid-cols-2 gap-3">
          <FormRow label="Country *" required>
            <input
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })}
              maxLength={2}
              required
              placeholder="US"
              className="h-10 w-full rounded-md border border-bg-border bg-bg-app px-3 text-sm uppercase"
            />
          </FormRow>
          <FormRow label="Supplier kind *" required>
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as SupplierKind })}
              required
              className="h-10 w-full rounded-md border border-bg-border bg-bg-app px-3 text-sm"
            >
              <option value="Manufacturer">Manufacturer</option>
              <option value="Wholesaler">Wholesaler</option>
              <option value="Distributor">Distributor</option>
              <option value="Dropship">Dropship</option>
            </select>
          </FormRow>
        </div>

        <FormRow label="Website">
          <input
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            placeholder="yourcompany.com"
            className="h-10 w-full rounded-md border border-bg-border bg-bg-app px-3 text-sm"
          />
        </FormRow>

        <FormRow label="Phone">
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+1 555 555 1234"
            className="h-10 w-full rounded-md border border-bg-border bg-bg-app px-3 text-sm"
          />
        </FormRow>

        <div className="grid grid-cols-2 gap-3">
          <FormRow label="State / Province">
            <input
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              className="h-10 w-full rounded-md border border-bg-border bg-bg-app px-3 text-sm"
            />
          </FormRow>
          <FormRow label="City">
            <input
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="h-10 w-full rounded-md border border-bg-border bg-bg-app px-3 text-sm"
            />
          </FormRow>
        </div>

        <FormRow label="What categories do you supply?">
          <input
            value={form.categories}
            onChange={(e) => setForm({ ...form, categories: e.target.value })}
            placeholder="Electronics, Cables, Wireless accessories"
            className="h-10 w-full rounded-md border border-bg-border bg-bg-app px-3 text-sm"
          />
          <div className="mt-1 text-[10px] text-ink-tertiary">
            Comma-separated, e.g. &quot;Electronics, Cables, Wireless accessories&quot;.
          </div>
        </FormRow>

        {/* Honeypot — hidden from real users, bots fill everything */}
        <div style={{ position: "absolute", left: "-9999px" }} aria-hidden="true">
          <label>
            If you&apos;re a human, leave this empty:
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={form.company_url_2}
              onChange={(e) => setForm({ ...form, company_url_2: e.target.value })}
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={submitting || !form.legalName || !form.email}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-brand px-4 py-2.5 text-sm font-semibold shadow-glow disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting…
            </>
          ) : (
            <>
              Submit application
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        <p className="text-center text-[10px] text-ink-tertiary">
          Already registered?{" "}
          <Link href="/signin?next=/portal" className="text-brand-200 hover:underline">
            Sign in to the portal
          </Link>
          .
        </p>
      </form>
    </div>
  );
}

function ValueProp({
  Icon,
  label,
  body,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-3">
      <div className="flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-brand-500/15">
          <Icon className="h-3.5 w-3.5 text-brand-200" />
        </div>
        <div className="text-[12px] font-semibold">{label}</div>
      </div>
      <div className="mt-1 text-[11px] text-ink-secondary">{body}</div>
    </div>
  );
}

function FormRow({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
        {label} {required && <span className="text-accent-amber">*</span>}
      </div>
      {children}
    </label>
  );
}
