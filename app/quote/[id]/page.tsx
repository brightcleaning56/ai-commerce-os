"use client";
import { CheckCircle2, Clock, Lock, Sparkles, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type QuoteData = {
  id: string;
  createdAt: string;
  buyerCompany: string;
  buyerName: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  total: number;
  currency: string;
  paymentTerms: string;
  leadTimeDays: number;
  validForDays: number;
  shippingTerms: string;
  notes?: string;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  shareExpiresAt: string;
};

function fmt(n: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function QuotePublicPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = params.id;
  const token = search.get("t") || "";
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<"accept" | "reject" | null>(null);

  useEffect(() => {
    fetch(`/api/quotes/${id}?t=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `${res.status}`);
        setQuote(data.quote);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [id, token]);

  async function act(decision: "accepted" | "rejected") {
    setActing(decision === "accepted" ? "accept" : "reject");
    try {
      const res = await fetch(`/api/quotes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: decision }),
      });
      if (!res.ok) throw new Error("Update failed");
      // Refetch to confirm
      const fresh = await fetch(`/api/quotes/${id}?t=${encodeURIComponent(token)}`);
      const data = await fresh.json();
      if (fresh.ok) setQuote(data.quote);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center text-sm text-ink-tertiary">
          Loading quote…
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen bg-bg-base">
        <div className="mx-auto max-w-2xl px-6 py-32 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-bg-card">
            <Lock className="h-7 w-7 text-ink-tertiary" />
          </div>
          <h1 className="mt-6 text-xl font-bold">Quote unavailable</h1>
          <p className="mt-2 text-sm text-ink-secondary">{error}</p>
        </div>
      </div>
    );
  }

  const expired = Date.now() > new Date(quote.shareExpiresAt).getTime();
  const finalState =
    quote.status === "accepted" || quote.status === "rejected" || quote.status === "expired";

  return (
    <div className="min-h-screen bg-bg-base">
      <header className="border-b border-bg-border bg-bg-panel/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/welcome" className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-brand shadow-glow">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-bold leading-tight">AI Commerce OS</div>
              <div className="text-[10px] text-ink-tertiary">Wholesale quote</div>
            </div>
          </Link>
          <span className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
            quote.status === "accepted" ? "bg-accent-green/15 text-accent-green"
            : quote.status === "rejected" ? "bg-accent-red/15 text-accent-red"
            : expired ? "bg-accent-amber/15 text-accent-amber"
            : "bg-brand-500/15 text-brand-200"
          }`}>
            {expired && quote.status !== "accepted" && quote.status !== "rejected"
              ? "Expired"
              : quote.status}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-6 py-10">
        <div className="rounded-2xl border border-brand-500/30 bg-gradient-to-br from-brand-500/10 to-transparent p-8 shadow-glow">
          <div className="text-xs font-semibold uppercase tracking-wider text-brand-300">
            Quote · {quote.id}
          </div>
          <h1 className="mt-2 text-2xl font-bold">
            {quote.productName} for {quote.buyerCompany}
          </h1>
          <p className="mt-1 text-xs text-ink-tertiary">
            Prepared {new Date(quote.createdAt).toLocaleString()} · Valid {quote.validForDays} days
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Unit price" v={fmt(quote.unitPrice, quote.currency)} />
            <Tile label="Quantity" v={quote.quantity.toLocaleString()} />
            <Tile label="Discount" v={`${quote.discountPct}%`} />
            <Tile label="Total" v={fmt(quote.total, quote.currency)} highlight />
          </div>
        </div>

        <div className="rounded-xl border border-bg-border bg-bg-card">
          <div className="border-b border-bg-border px-5 py-3 text-sm font-semibold">Line items</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-tertiary">
                <th className="px-5 py-2">Item</th>
                <th className="px-5 py-2 text-right">Qty</th>
                <th className="px-5 py-2 text-right">Unit</th>
                <th className="px-5 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-bg-border">
                <td className="px-5 py-3">{quote.productName}</td>
                <td className="px-5 py-3 text-right">{quote.quantity.toLocaleString()}</td>
                <td className="px-5 py-3 text-right">{fmt(quote.unitPrice, quote.currency)}</td>
                <td className="px-5 py-3 text-right">{fmt(quote.subtotal, quote.currency)}</td>
              </tr>
              {quote.discountPct > 0 && (
                <tr className="border-t border-bg-border text-accent-green">
                  <td className="px-5 py-3" colSpan={3}>Discount ({quote.discountPct}%)</td>
                  <td className="px-5 py-3 text-right">−{fmt(quote.discountAmount, quote.currency)}</td>
                </tr>
              )}
              <tr className="border-t-2 border-bg-border font-semibold">
                <td className="px-5 py-3" colSpan={3}>Total</td>
                <td className="px-5 py-3 text-right text-lg text-brand-200">
                  {fmt(quote.total, quote.currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Tile label="Payment terms" v={quote.paymentTerms} />
          <Tile label="Lead time" v={`${quote.leadTimeDays} days`} />
          <Tile label="Shipping" v={quote.shippingTerms} />
        </div>

        {quote.notes && (
          <div className="rounded-xl border border-bg-border bg-bg-card p-5 text-sm text-ink-secondary">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Notes
            </div>
            {quote.notes}
          </div>
        )}

        {!finalState && !expired && (
          <div className="rounded-xl border border-bg-border bg-bg-card p-5">
            <div className="mb-3 text-sm font-semibold">Decision</div>
            <p className="mb-3 text-xs text-ink-secondary">
              Click below to accept or decline this quote. Both parties will be notified by email.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => act("accepted")}
                disabled={acting !== null}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-brand px-4 py-3 text-sm font-semibold shadow-glow disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                {acting === "accept" ? "Accepting…" : "Accept quote"}
              </button>
              <button
                onClick={() => act("rejected")}
                disabled={acting !== null}
                className="flex items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card px-4 py-3 text-sm hover:bg-bg-hover disabled:opacity-60"
              >
                <XCircle className="h-4 w-4" />
                {acting === "reject" ? "Declining…" : "Decline"}
              </button>
            </div>
          </div>
        )}

        {finalState && (
          <div
            className={`rounded-xl border p-5 ${
              quote.status === "accepted"
                ? "border-accent-green/40 bg-accent-green/5"
                : "border-accent-red/40 bg-accent-red/5"
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              {quote.status === "accepted" ? (
                <CheckCircle2 className="h-4 w-4 text-accent-green" />
              ) : (
                <XCircle className="h-4 w-4 text-accent-red" />
              )}
              Quote {quote.status}
            </div>
            <p className="mt-1 text-xs text-ink-secondary">
              {quote.status === "accepted"
                ? "Thank you. Our team has been notified and will follow up with the PO + onboarding details."
                : "Understood. Feel free to reach out if circumstances change — we can revisit terms."}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 text-[10px] text-ink-tertiary">
          <Clock className="h-3 w-3" /> Quote valid until {new Date(quote.shareExpiresAt).toLocaleString()}
        </div>
      </main>
    </div>
  );
}

function Tile({ label, v, highlight }: { label: string; v: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${highlight ? "text-brand-200" : ""}`}>{v}</div>
    </div>
  );
}
