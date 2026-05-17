"use client";
import { Check, CheckCircle2, Clock, Lock, Printer, Share2, XCircle } from "lucide-react";
import { AvynMark } from "@/components/AvynLogo";
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
  // Slice 57: freight estimate auto-attached on accept (slice 47).
  // Renders as a transparency card alongside the "accepted" message
  // so the buyer sees what the operator sees.
  freightEstimate?: {
    provider: "shippo" | "fallback";
    laneKey: string;
    rates: Array<{
      mode: string;
      estimateUsd: number;
      transitDaysMin: number;
      transitDaysMax: number;
      notes?: string;
    }>;
    computedAt: string;
  };
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
  // Buyer destination form — appears once the buyer clicks "Accept".
  // Submitting it ALSO transitions the quote to "accepted" so we
  // capture status + destination in one PATCH. We don't pre-prompt
  // for destination because we don't want to slow down the rejection
  // path; only Accept needs a ship-to.
  const [showShipForm, setShowShipForm] = useState(false);
  const [shipCountry, setShipCountry] = useState("US");
  const [shipState, setShipState] = useState("");
  const [shipCity, setShipCity] = useState("");
  const [shipZip, setShipZip] = useState("");
  // Slice 58: pre-accept freight preview. Buyer fills in destination,
  // hits "Preview freight", we hit /api/freight/estimate without
  // committing the accept. They can adjust country/state and re-estimate.
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRates, setPreviewRates] = useState<
    | Array<{
        mode: string;
        estimateUsd: number;
        transitDaysMin: number;
        transitDaysMax: number;
        notes?: string;
      }>
    | null
  >(null);
  // Slice 82: copy-URL state. Buyers regularly forward quotes to a
  // colleague (procurement / boss / accountant) before deciding.
  // The current URL includes the share token, so forwarding is just
  // a clipboard copy. Auto-resets the "copied" tick after 2s.
  const [linkCopied, setLinkCopied] = useState(false);

  async function previewFreight() {
    const country = shipCountry.trim().toUpperCase();
    if (country.length !== 2) {
      setPreviewError("Country code must be 2 letters (e.g. US, GB, DE)");
      return;
    }
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      // Public, share-token-gated freight preview. Weight + origin
      // are derived server-side from the quote -- buyer can't spoof.
      const r = await fetch(
        `/api/quotes/${id}/freight-preview?t=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            destCountry: country,
            destState: shipState.trim() || undefined,
          }),
        },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Freight preview failed (${r.status})`);
      setPreviewRates(d.rates ?? []);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Couldn't estimate freight");
    } finally {
      setPreviewBusy(false);
    }
  }

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
      const payload: Record<string, unknown> = { status: decision };
      if (decision === "accepted" && shipCountry.trim()) {
        payload.destination = {
          country: shipCountry.trim(),
          state: shipState.trim() || undefined,
          city: shipCity.trim() || undefined,
          zip: shipZip.trim() || undefined,
        };
      }
      const res = await fetch(`/api/quotes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Update failed");
      // Refetch to confirm
      const fresh = await fetch(`/api/quotes/${id}?t=${encodeURIComponent(token)}`);
      const data = await fresh.json();
      if (fresh.ok) setQuote(data.quote);
      setShowShipForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return (
      <div className="dark min-h-screen bg-bg-base text-ink-primary">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center text-sm text-ink-tertiary">
          Loading quote…
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="dark min-h-screen bg-bg-base text-ink-primary">
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
  // Slice 68: surface expiry urgency to the buyer. The link is
  // already server-side-enforced (the route returns 410 once
  // shareExpiresAt passes), but a buyer mid-decision shouldn't have
  // to compute "how many hours do I have left?" from a timestamp.
  // Three thresholds: <24h = red urgent, <72h = amber heads-up, >=72h
  // = quiet (already shown in the footer). Only renders while
  // actionable: hidden once accepted/rejected/expired.
  const msToExpiry = new Date(quote.shareExpiresAt).getTime() - Date.now();
  const hoursToExpiry = Math.floor(msToExpiry / 3_600_000);
  const showExpiryBanner = !finalState && !expired && hoursToExpiry < 72;

  return (
    <div className="dark min-h-screen bg-bg-base text-ink-primary">
      {/* Slice 84: print stylesheet -- forces light background + black
          text so the dark theme doesn't waste ink, hides interactive
          chrome (buttons, banners, dropdowns) via the print:hidden
          modifiers, and tightens spacing so a single page fits. The
          @page rule keeps the margins sane across browsers. */}
      <style>{`
        @media print {
          @page { margin: 0.5in; }
          html, body { background: white !important; color: black !important; }
          .dark, .dark * {
            background: white !important;
            color: black !important;
            border-color: #e5e7eb !important;
            box-shadow: none !important;
            text-shadow: none !important;
          }
          header, .print\\:hidden { display: none !important; }
          main { padding: 0 !important; }
          a { color: black !important; text-decoration: none !important; }
        }
      `}</style>
      <header className="border-b border-bg-border bg-bg-panel/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/welcome" className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: "#0a0014", boxShadow: "0 0 12px rgba(147,51,234,0.4)" }}>
              <AvynMark size={22} />
            </div>
            <div>
              <div className="text-sm font-bold leading-tight">AVYN Commerce</div>
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
        {showExpiryBanner && (
          <div
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
              hoursToExpiry < 24
                ? "border-accent-red/40 bg-accent-red/10 text-accent-red"
                : "border-accent-amber/40 bg-accent-amber/10 text-accent-amber"
            }`}
          >
            <Clock className="h-4 w-4 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold">
                {hoursToExpiry < 1
                  ? "This quote expires in under an hour"
                  : hoursToExpiry < 24
                    ? `This quote expires in ${hoursToExpiry} hour${hoursToExpiry === 1 ? "" : "s"}`
                    : `This quote expires in ${Math.ceil(hoursToExpiry / 24)} day${Math.ceil(hoursToExpiry / 24) === 1 ? "" : "s"}`}
              </div>
              <div className="text-[11px] opacity-80">
                Accept or reject below before {new Date(quote.shareExpiresAt).toLocaleString()} — after that the link stops working and you&apos;ll need a fresh one from the team.
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-brand-500/30 bg-gradient-to-br from-brand-500/10 to-transparent p-8 shadow-glow">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-brand-300">
              Quote · {quote.id}
            </div>
            {/* Slice 82: forward-to-colleague share button. The current
                URL already includes the share token, so a clipboard copy
                of window.location.href is enough -- no new endpoint.
                Hidden once the quote is in a final state since forwarding
                a closed quote is pointless. */}
            <div className="flex items-center gap-1.5 print:hidden">
              {/* Slice 84: print button -- buyers regularly want a
                  physical copy for procurement files / signature.
                  window.print() + the @media print stylesheet below
                  produce a clean black-on-white version with the
                  interactive elements hidden. Available in any state
                  (an accepted quote is still useful to file). */}
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card/60 px-2 py-1 text-[11px] font-medium text-ink-secondary transition hover:border-brand-500/40 hover:bg-bg-hover"
                title="Print or save as PDF"
              >
                <Printer className="h-3 w-3" /> Print
              </button>
              {!finalState && !expired && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href).then(
                      () => {
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2000);
                      },
                      () => setLinkCopied(false),
                    );
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card/60 px-2 py-1 text-[11px] font-medium text-ink-secondary transition hover:border-brand-500/40 hover:bg-bg-hover"
                  title="Copy this quote link to share with a colleague"
                >
                  {linkCopied ? (
                    <>
                      <Check className="h-3 w-3 text-accent-green" /> Link copied
                    </>
                  ) : (
                    <>
                      <Share2 className="h-3 w-3" /> Share with colleague
                    </>
                  )}
                </button>
              )}
            </div>
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
          {/* Slice 109: lead time tile now also computes an estimated
              delivery date so the buyer doesn't have to do calendar
              math from "21 days." Format is "21 days" + "by Jun 14"
              underneath, where the date is now + leadTimeDays. The
              estimate is intentionally vague (no day-of-week, no
              exact promise) since lead time is upper bound, not
              guaranteed. */}
          <Tile
            label="Lead time"
            v={`${quote.leadTimeDays} days`}
            sub={
              quote.leadTimeDays > 0
                ? `by ${new Date(Date.now() + quote.leadTimeDays * 86_400_000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                : undefined
            }
          />
          <Tile label="Shipping" v={quote.shippingTerms} />
        </div>

        {/* Slice 113: notes section now collapses by default when
            long (> 240 chars). Operator-written quote notes can
            balloon to a multi-paragraph contract clause; the buyer
            doesn't need to scroll past it to find the Accept button.
            Short notes render inline as before. The print stylesheet
            (slice 84) forces all details open via the open attr so
            paper copies don't lose content. */}
        {quote.notes && (
          (() => {
            const isLong = quote.notes.length > 240;
            if (!isLong) {
              return (
                <div className="rounded-xl border border-bg-border bg-bg-card p-5 text-sm text-ink-secondary">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                    Notes
                  </div>
                  <LinkifiedText text={quote.notes} />
                </div>
              );
            }
            return (
              <details
                open={false}
                className="group rounded-xl border border-bg-border bg-bg-card open:p-5 [&:not([open])]:p-3"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-2 list-none">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                    Notes
                    <span className="ml-1.5 normal-case text-ink-tertiary">
                      ({quote.notes.length} characters)
                    </span>
                  </span>
                  <span className="text-[11px] text-brand-300 group-open:hidden">
                    Show
                  </span>
                  <span className="hidden text-[11px] text-brand-300 group-open:inline">
                    Hide
                  </span>
                </summary>
                <div className="mt-3 whitespace-pre-wrap text-sm text-ink-secondary">
                  <LinkifiedText text={quote.notes} />
                </div>
              </details>
            );
          })()
        )}

        {!finalState && !expired && (
          <div
            data-decision-card
            className="rounded-xl border border-bg-border bg-bg-card p-5 print:hidden"
          >
            <div className="mb-3 text-sm font-semibold">Decision</div>
            {!showShipForm ? (
              <>
                <p className="mb-3 text-xs text-ink-secondary">
                  Accept the quote to share your ship-to address; we&apos;ll generate a contract from there.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowShipForm(true)}
                    disabled={acting !== null}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-brand px-4 py-3 text-sm font-semibold shadow-glow disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Accept quote
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
              </>
            ) : (
              <>
                <p className="mb-3 text-xs text-ink-secondary">
                  Where should we ship to? Country is required; state/city/zip are optional but help us
                  plan freight + lead time.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                      Country *
                    </div>
                    <input
                      value={shipCountry}
                      onChange={(e) => setShipCountry(e.target.value.toUpperCase())}
                      maxLength={2}
                      placeholder="US"
                      className="h-10 w-full rounded-md border border-bg-border bg-bg-app px-3 text-sm uppercase font-mono"
                    />
                  </label>
                  <label className="block">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                      State
                    </div>
                    <input
                      value={shipState}
                      onChange={(e) => setShipState(e.target.value.toUpperCase())}
                      maxLength={2}
                      placeholder="TX"
                      className="h-10 w-full rounded-md border border-bg-border bg-bg-app px-3 text-sm uppercase font-mono"
                    />
                  </label>
                  <label className="block">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                      City
                    </div>
                    <input
                      value={shipCity}
                      onChange={(e) => setShipCity(e.target.value)}
                      placeholder="Dallas"
                      className="h-10 w-full rounded-md border border-bg-border bg-bg-app px-3 text-sm"
                    />
                  </label>
                  <label className="block">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                      ZIP / postal code
                    </div>
                    <input
                      value={shipZip}
                      onChange={(e) => setShipZip(e.target.value)}
                      placeholder="75201"
                      className="h-10 w-full rounded-md border border-bg-border bg-bg-app px-3 text-sm"
                    />
                  </label>
                </div>

                {/* Slice 58: preview freight before accepting. Lets the
                    buyer see what shipping will cost without committing
                    to the quote. Same /api/freight/estimate endpoint
                    the auto-attach calls at accept time. */}
                <div className="mt-4 rounded-lg border border-bg-border bg-bg-app/40 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
                      Freight preview (optional)
                    </div>
                    <button
                      type="button"
                      onClick={() => void previewFreight()}
                      disabled={previewBusy || shipCountry.trim().length !== 2}
                      className="rounded-md border border-accent-blue/40 bg-accent-blue/10 px-3 py-1 text-[11px] font-semibold text-accent-blue hover:bg-accent-blue/15 disabled:opacity-50"
                    >
                      {previewBusy ? "Estimating…" : "Preview freight"}
                    </button>
                  </div>
                  <p className="text-[11px] text-ink-secondary">
                    Get a rough freight cost before you commit. Final freight is quoted by
                    the carrier at booking time and may differ.
                  </p>
                  {previewError && (
                    <div className="mt-2 text-[11px] text-accent-red">{previewError}</div>
                  )}
                  {previewRates && previewRates.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {previewRates.slice(0, 4).map((r) => (
                        <div
                          key={r.mode}
                          className="flex items-center justify-between gap-2 rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-[12px]"
                        >
                          <span className="font-mono text-ink-secondary">{r.mode}</span>
                          <div className="flex items-center gap-3 text-ink-tertiary">
                            <span>{r.transitDaysMin}-{r.transitDaysMax}d</span>
                            <span className="font-mono font-semibold text-accent-green">
                              ${r.estimateUsd.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {previewRates && previewRates.length === 0 && (
                    <div className="mt-2 text-[11px] text-ink-tertiary">
                      No freight modes available for this lane.
                    </div>
                  )}
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => act("accepted")}
                    disabled={acting !== null || !shipCountry.trim() || shipCountry.trim().length !== 2}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-brand px-4 py-3 text-sm font-semibold shadow-glow disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {acting === "accept" ? "Accepting…" : "Confirm + accept"}
                  </button>
                  <button
                    onClick={() => setShowShipForm(false)}
                    disabled={acting !== null}
                    className="rounded-lg border border-bg-border bg-bg-card px-4 py-3 text-sm hover:bg-bg-hover disabled:opacity-60"
                  >
                    Back
                  </button>
                </div>
              </>
            )}
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

        {/* Slice 57: freight estimate transparency for the buyer.
            Shown on accepted quotes when the slice-47 estimator landed
            a result. Buyer sees same options + costs the operator sees
            -- no surprise freight charges later. */}
        {quote.status === "accepted" && quote.freightEstimate && quote.freightEstimate.rates.length > 0 && (
          <div className="rounded-xl border border-bg-border bg-bg-card p-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Estimated freight options</div>
              <span className="rounded-md bg-bg-hover px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-tertiary">
                {quote.freightEstimate.provider === "shippo" ? "live carrier rates" : "rate-card estimate"}
              </span>
            </div>
            <p className="mb-3 text-[11px] text-ink-secondary">
              Approximate cost from {quote.freightEstimate.laneKey}. Final freight is
              quoted with the carrier at booking time and may differ based on actual
              weight / dims / fuel surcharge.
            </p>
            <div className="space-y-1">
              {quote.freightEstimate.rates.slice(0, 5).map((r) => (
                <div
                  key={r.mode}
                  className="flex items-center justify-between gap-2 rounded-md border border-bg-border bg-bg-app px-3 py-2 text-[12px]"
                >
                  <span className="font-mono text-ink-secondary">{r.mode}</span>
                  <div className="flex items-center gap-3 text-ink-tertiary">
                    <span>{r.transitDaysMin}-{r.transitDaysMax} days</span>
                    <span className="font-mono font-semibold text-accent-green">
                      ${r.estimateUsd.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[10px] text-ink-tertiary">
              Computed {new Date(quote.freightEstimate.computedAt).toLocaleString()}.
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-[10px] text-ink-tertiary">
          <Clock className="h-3 w-3" /> Quote valid until {new Date(quote.shareExpiresAt).toLocaleString()}
        </div>

        {/* Slice 88: sticky mobile CTA. On phones the decision card
            sits well below the line items + freight preview, so a
            buyer who's reached the Total has to scroll back down to
            act. The fixed-bottom bar surfaces a single tap path.
            Hidden:
              - on sm: breakpoint and up (decision card is in view)
              - when the quote is in a final state (action is moot)
              - when expired
              - when the ship-form is already open (don't conflict)
              - in print (print:hidden)
            Adds bottom padding to <main> via the sm:pb-0 mb-32 trick
            so the bar doesn't cover the last bit of content. */}
        {!finalState && !expired && !showShipForm && (
          <div className="h-24 sm:hidden print:hidden" aria-hidden="true" />
        )}
      </main>
      {!finalState && !expired && !showShipForm && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-bg-border bg-bg-panel/95 px-4 py-3 backdrop-blur sm:hidden print:hidden">
          <button
            onClick={() => {
              // Scroll to the decision card so the ship-form expansion
              // (which happens on click) doesn't disorient the user.
              document
                .querySelector("[data-decision-card]")
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
              setShowShipForm(true);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-brand px-4 py-3 text-sm font-semibold shadow-glow"
          >
            <CheckCircle2 className="h-4 w-4" />
            Accept {fmt(quote.total, quote.currency)} quote
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Slice 116: render free-text content with auto-detected URLs +
 * email addresses turned into clickable links. Conservative pattern:
 *
 *   - URLs: http(s)://... up to whitespace
 *   - Emails: word@word.tld
 *
 * Anything matching renders as a brand-tinted underline link; the
 * rest is plain text. No HTML in the input is parsed (we render
 * text nodes), so this is safe against the buyer pasting <script>
 * tags in a quote note.
 *
 * Newlines preserved via whitespace-pre-wrap on the parent.
 */
function LinkifiedText({ text }: { text: string }) {
  // Combined regex: http(s) URL OR bare-domain email. The non-capturing
  // alternation feeds split() which returns [text, match, text, match, ...].
  const pattern = /(https?:\/\/[^\s<>"']+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        if (part.startsWith("http")) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-300 underline hover:text-brand-200"
            >
              {part}
            </a>
          );
        }
        // email
        return (
          <a
            key={i}
            href={`mailto:${part}`}
            className="text-brand-300 underline hover:text-brand-200"
          >
            {part}
          </a>
        );
      })}
    </>
  );
}

function Tile({
  label,
  v,
  highlight,
  sub,
}: {
  label: string;
  v: string;
  highlight?: boolean;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${highlight ? "text-brand-200" : ""}`}>{v}</div>
      {/* Slice 109: optional sub-line (e.g. "by Jun 14" under lead time) */}
      {sub && <div className="mt-0.5 text-[10px] text-ink-tertiary">{sub}</div>}
    </div>
  );
}
