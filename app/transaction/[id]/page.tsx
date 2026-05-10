"use client";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Lock,
  Package,
  ShieldCheck,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Txn = {
  id: string;
  state: string;
  buyerCompany: string;
  buyerName: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  discountPctBps: number;
  discountCents: number;
  shippingCents: number;
  productTotalCents: number;
  paymentTerms: string;
  shippingTerms: string;
  leadTimeDays: number;
  refundPolicy?: string;
  contractSignedAt?: string;
  contractSignerName?: string;
  paymentReceivedAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  trackingNumber?: string;
  carrierName?: string;
  shareExpiresAt: string;
  stateHistory: { ts: string; state: string; actor: string; detail: string }[];
};

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

const STAGES = [
  { id: "proposed", label: "Review", icon: FileText },
  { id: "signed", label: "Sign", icon: CheckCircle2 },
  { id: "escrow_held", label: "Pay (escrow)", icon: CreditCard },
  { id: "shipped", label: "Ship", icon: Truck },
  { id: "delivered", label: "Deliver", icon: Package },
  { id: "completed", label: "Complete", icon: ShieldCheck },
];

const STATE_RANK: Record<string, number> = {
  draft: 0,
  proposed: 1,
  signed: 2,
  payment_pending: 2,
  escrow_held: 3,
  shipped: 4,
  delivered: 5,
  released: 6,
  completed: 6,
  disputed: -1,
  refunded: -2,
  cancelled: -3,
};

export default function TransactionPublicPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg-base p-12 text-center text-sm text-ink-tertiary">Loading…</div>}>
      <TransactionView />
    </Suspense>
  );
}

function TransactionView() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = params.id;
  const token = search.get("t") || "";

  const [txn, setTxn] = useState<Txn | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sign form
  const [signerName, setSignerName] = useState("");
  const [agreeChecked, setAgreeChecked] = useState(false);
  const [signing, setSigning] = useState(false);

  // Pay
  const [paying, setPaying] = useState(false);

  // Confirm delivery
  const [confirming, setConfirming] = useState(false);

  // Dispute
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputing, setDisputing] = useState(false);

  async function load() {
    try {
      const res = await fetch(`/api/transactions/${id}?t=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      setTxn(data.transaction);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  async function sign() {
    if (signerName.trim().length < 2 || !agreeChecked) return;
    setSigning(true);
    try {
      const res = await fetch(`/api/transactions/${id}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, signerName: signerName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      setTxn(data.transaction);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign failed");
    } finally {
      setSigning(false);
    }
  }

  async function pay() {
    setPaying(true);
    try {
      const res = await fetch(`/api/transactions/${id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      // Simulated mode: refresh state. Sandbox/live: redirect to Stripe.
      if (data.mode === "simulated") {
        await load();
      } else if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  }

  async function confirmDelivery() {
    setConfirming(true);
    try {
      const res = await fetch(`/api/transactions/${id}/deliver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, confirmedBy: "buyer" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      setTxn(data.transaction);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confirm failed");
    } finally {
      setConfirming(false);
    }
  }

  async function dispute() {
    if (disputeReason.trim().length < 10) return;
    setDisputing(true);
    try {
      const res = await fetch(`/api/transactions/${id}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reason: disputeReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      setTxn(data.transaction);
      setDisputeOpen(false);
      setDisputeReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dispute failed");
    } finally {
      setDisputing(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-bg-base p-12 text-center text-sm text-ink-tertiary">Loading…</div>;
  }

  if (error || !txn) {
    return (
      <div className="min-h-screen bg-bg-base">
        <div className="mx-auto max-w-2xl px-6 py-32 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-bg-card">
            <Lock className="h-7 w-7 text-ink-tertiary" />
          </div>
          <h1 className="mt-6 text-xl font-bold">Transaction unavailable</h1>
          <p className="mt-2 text-sm text-ink-secondary">{error}</p>
        </div>
      </div>
    );
  }

  const rank = STATE_RANK[txn.state] ?? 0;

  return (
    <div className="min-h-screen bg-bg-base">
      <header className="border-b border-bg-border bg-bg-panel/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/welcome" className="text-sm font-bold">AI Commerce OS</Link>
          <span className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
            txn.state === "completed" ? "bg-accent-green/15 text-accent-green"
            : txn.state === "disputed" ? "bg-accent-amber/15 text-accent-amber"
            : txn.state === "refunded" || txn.state === "cancelled" ? "bg-accent-red/15 text-accent-red"
            : "bg-brand-500/15 text-brand-200"
          }`}>
            {txn.state.replace(/_/g, " ")}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-6 py-10">
        {/* Headline */}
        <div className="rounded-2xl border border-brand-500/30 bg-gradient-to-br from-brand-500/10 to-transparent p-8">
          <div className="text-xs font-semibold uppercase tracking-wider text-brand-300">
            Wholesale Transaction · {txn.id}
          </div>
          <h1 className="mt-2 text-2xl font-bold">
            {txn.productName} for {txn.buyerCompany}
          </h1>
          <p className="mt-1 text-xs text-ink-tertiary">
            {txn.quantity.toLocaleString()} units · Total <strong className="text-brand-200">{fmt(txn.productTotalCents)}</strong> · {txn.paymentTerms}
          </p>
        </div>

        {/* Progress strip */}
        <div className="rounded-xl border border-bg-border bg-bg-card p-4">
          <div className="flex items-center justify-between gap-1">
            {STAGES.map((s, i) => {
              const stageRank = i + 1;
              const done = rank >= stageRank;
              const current = rank === stageRank;
              const Icon = s.icon;
              return (
                <div key={s.id} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center">
                    <div className={`grid h-9 w-9 place-items-center rounded-full ${
                      done ? "bg-accent-green/15 text-accent-green" :
                      current ? "bg-brand-500/15 text-brand-200" :
                      "bg-bg-hover text-ink-tertiary"
                    }`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className={`mt-1 text-[10px] uppercase tracking-wider ${
                      done || current ? "text-ink-secondary" : "text-ink-tertiary"
                    }`}>{s.label}</div>
                  </div>
                  {i < STAGES.length - 1 && (
                    <div className={`mx-1 h-0.5 flex-1 ${done ? "bg-accent-green/40" : "bg-bg-hover"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* State-specific action panel */}
        {txn.state === "proposed" && (
          <div className="rounded-xl border border-bg-border bg-bg-card p-5">
            <h2 className="text-sm font-semibold">Review and sign the agreement</h2>
            <p className="mt-1 text-xs text-ink-secondary">
              By signing, you agree to the wholesale purchase terms below. Funds are held in escrow on payment until delivery is confirmed (or 7 days after expected delivery).
            </p>
            <div className="mt-4 rounded-lg border border-bg-border bg-bg-panel p-4 text-xs space-y-1.5 text-ink-secondary">
              <div><strong className="text-ink-primary">Product:</strong> {txn.productName} × {txn.quantity.toLocaleString()}</div>
              <div><strong className="text-ink-primary">Unit price:</strong> {fmt(txn.unitPriceCents)}</div>
              <div><strong className="text-ink-primary">Subtotal:</strong> {fmt(txn.subtotalCents)}</div>
              {txn.discountCents > 0 && <div><strong className="text-ink-primary">Discount ({(txn.discountPctBps / 100).toFixed(1)}%):</strong> −{fmt(txn.discountCents)}</div>}
              {txn.shippingCents > 0 && <div><strong className="text-ink-primary">Shipping:</strong> {fmt(txn.shippingCents)}</div>}
              <div className="border-t border-bg-border pt-1.5"><strong className="text-ink-primary">Total:</strong> <span className="text-base font-semibold text-brand-200">{fmt(txn.productTotalCents)}</span></div>
              <div><strong className="text-ink-primary">Payment terms:</strong> {txn.paymentTerms}</div>
              <div><strong className="text-ink-primary">Shipping terms:</strong> {txn.shippingTerms}</div>
              <div><strong className="text-ink-primary">Lead time:</strong> {txn.leadTimeDays} days</div>
              {txn.refundPolicy && <div><strong className="text-ink-primary">Refund policy:</strong> {txn.refundPolicy}</div>}
            </div>
            <label className="mt-3 flex items-start gap-2 text-xs text-ink-secondary">
              <input type="checkbox" checked={agreeChecked} onChange={(e) => setAgreeChecked(e.target.checked)} className="mt-0.5" />
              <span>
                I, the undersigned, agree to be legally bound by these terms under the U.S. ESIGN Act. My IP, timestamp, and full name will be recorded as proof of signing.
              </span>
            </label>
            <div className="mt-3">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">Full legal name</label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Jane Doe"
                className="mt-1 h-10 w-full rounded-md border border-bg-border bg-bg-panel px-3 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
            <button
              onClick={sign}
              disabled={signing || !agreeChecked || signerName.trim().length < 2}
              className="mt-4 w-full rounded-lg bg-gradient-brand px-4 py-3 text-sm font-semibold shadow-glow disabled:opacity-50"
            >
              {signing ? "Signing…" : "I agree and sign"}
            </button>
          </div>
        )}

        {txn.state === "signed" && (
          <div className="rounded-xl border border-bg-border bg-bg-card p-5">
            <h2 className="text-sm font-semibold">Pay {fmt(txn.productTotalCents)} to escrow</h2>
            <p className="mt-1 text-xs text-ink-secondary">
              Your payment is held by the platform's escrow until delivery is confirmed. You can dispute any time before delivery confirmation. Signed by <strong className="text-ink-primary">{txn.contractSignerName}</strong> on {new Date(txn.contractSignedAt!).toLocaleString()}.
            </p>
            <button
              onClick={pay}
              disabled={paying}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-brand px-4 py-3 text-sm font-semibold shadow-glow disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" />
              {paying ? "Redirecting…" : `Pay ${fmt(txn.productTotalCents)}`}
            </button>
            <p className="mt-2 text-center text-[10px] text-ink-tertiary">Powered by Stripe · 256-bit encrypted</p>
          </div>
        )}

        {(txn.state === "escrow_held" || txn.state === "shipped" || txn.state === "delivered" || txn.state === "disputed") && (
          <div className="rounded-xl border border-bg-border bg-bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-accent-green" />
              {fmt(txn.productTotalCents)} held in escrow
            </div>
            <p className="mt-1 text-xs text-ink-secondary">
              Paid {txn.paymentReceivedAt ? new Date(txn.paymentReceivedAt).toLocaleString() : ""}. Funds release to supplier once delivery is confirmed or 7 days after expected delivery, whichever comes first.
            </p>

            {txn.state === "shipped" && txn.trackingNumber && (
              <div className="mt-4 rounded-lg border border-bg-border bg-bg-panel p-3 text-xs">
                <div className="flex items-center gap-2 font-semibold text-ink-primary">
                  <Truck className="h-3.5 w-3.5 text-brand-300" />
                  Shipped via {txn.carrierName ?? "carrier"}
                </div>
                <div className="mt-1 text-ink-secondary">
                  Tracking #: <span className="font-mono">{txn.trackingNumber}</span>
                </div>
              </div>
            )}

            {txn.state === "delivered" && (
              <div className="mt-4">
                <div className="rounded-lg border border-accent-green/30 bg-accent-green/5 p-3 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-accent-green">
                    <Package className="h-3.5 w-3.5" />
                    Delivered {txn.deliveredAt ? new Date(txn.deliveredAt).toLocaleString() : ""}
                  </div>
                  <div className="mt-1 text-ink-secondary">
                    Inspect the goods. If everything matches the order, confirm delivery to release escrow. You have 7 days to raise a dispute.
                  </div>
                </div>
                <button
                  onClick={confirmDelivery}
                  disabled={confirming}
                  className="mt-3 w-full rounded-lg bg-gradient-brand px-4 py-3 text-sm font-semibold shadow-glow disabled:opacity-50"
                >
                  {confirming ? "Confirming…" : "Confirm delivery — release escrow"}
                </button>
              </div>
            )}

            {txn.state === "disputed" && (
              <div className="mt-4 rounded-lg border border-accent-amber/30 bg-accent-amber/5 p-3 text-xs">
                <div className="flex items-center gap-2 font-semibold text-accent-amber">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Dispute raised — funds frozen
                </div>
                <div className="mt-1 text-ink-secondary">
                  The seller and platform mediator are reviewing. You'll be notified by email when resolved.
                </div>
              </div>
            )}

            {(txn.state === "escrow_held" || txn.state === "shipped" || txn.state === "delivered") && (
              <div className="mt-4">
                {!disputeOpen ? (
                  <button
                    onClick={() => setDisputeOpen(true)}
                    className="text-[11px] text-ink-tertiary hover:text-accent-red"
                  >
                    Something's wrong? Raise a dispute →
                  </button>
                ) : (
                  <div className="rounded-lg border border-bg-border bg-bg-panel p-3">
                    <textarea
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                      placeholder="Describe the issue (min 10 characters). Be specific — this is logged in the audit trail."
                      rows={4}
                      className="w-full rounded-md border border-bg-border bg-bg-card p-2 text-xs placeholder:text-ink-tertiary focus:border-accent-red focus:outline-none"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={dispute}
                        disabled={disputing || disputeReason.trim().length < 10}
                        className="rounded-md bg-accent-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {disputing ? "Submitting…" : "Submit dispute"}
                      </button>
                      <button
                        onClick={() => { setDisputeOpen(false); setDisputeReason(""); }}
                        className="rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {(txn.state === "completed" || txn.state === "released") && (
          <div className="rounded-xl border border-accent-green/40 bg-accent-green/5 p-5 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-accent-green" />
            <h2 className="mt-3 text-lg font-bold">Transaction complete</h2>
            <p className="mt-1 text-xs text-ink-secondary">
              Escrow released. Supplier paid. Thank you for your business.
            </p>
          </div>
        )}

        {txn.state === "refunded" && (
          <div className="rounded-xl border border-accent-amber/40 bg-accent-amber/5 p-5 text-center">
            <Clock className="mx-auto h-10 w-10 text-accent-amber" />
            <h2 className="mt-3 text-lg font-bold">Refund processed</h2>
            <p className="mt-1 text-xs text-ink-secondary">
              Funds returned per dispute resolution. Refunds typically clear within 5-10 business days.
            </p>
          </div>
        )}

        {/* Activity timeline */}
        <div className="rounded-xl border border-bg-border bg-bg-card">
          <div className="border-b border-bg-border px-5 py-3 text-sm font-semibold">Activity</div>
          <ul className="divide-y divide-bg-border">
            {[...txn.stateHistory].reverse().slice(0, 10).map((e, i) => (
              <li key={i} className="flex items-start gap-3 px-5 py-3 text-xs">
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand-500/15 text-[9px] font-bold uppercase tracking-wider text-brand-200">
                  {e.actor.slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink-primary">{e.detail}</div>
                  <div className="text-[10px] text-ink-tertiary">
                    {new Date(e.ts).toLocaleString()} · state → {e.state.replace(/_/g, " ")}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="text-center text-[10px] text-ink-tertiary">
          Secure transaction · escrow-protected · {fmt(txn.productTotalCents)} held by AI Commerce OS until delivery confirmed.
        </div>
      </main>
    </div>
  );
}
