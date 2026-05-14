"use client";
import { Calculator, CheckCircle2, Clock, Copy, Download, ExternalLink, FileText, Link2, Loader2, Plus, Send, Sparkles, Trash2, X, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { downloadCSV } from "@/lib/csv";

type Line = { id: string; product: string; sku: string; qty: number; cost: number; price: number };

type RealQuote = {
  id: string;
  createdAt: string;
  buyerCompany: string;
  buyerName: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  total: number;
  paymentTerms: string;
  leadTimeDays: number;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  shareToken: string;
  shareExpiresAt: string;
};

const QUOTE_STATUS_TONE: Record<RealQuote["status"], { bg: string; text: string; Icon: React.ComponentType<{ className?: string }> }> = {
  draft: { bg: "bg-bg-hover", text: "text-ink-secondary", Icon: FileText },
  sent: { bg: "bg-accent-blue/15", text: "text-accent-blue", Icon: Send },
  accepted: { bg: "bg-accent-green/15", text: "text-accent-green", Icon: CheckCircle2 },
  rejected: { bg: "bg-accent-red/15", text: "text-accent-red", Icon: XCircle },
  expired: { bg: "bg-accent-amber/15", text: "text-accent-amber", Icon: Clock },
};

function fmtRelTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const PRODUCT_CATALOG = [
  { name: "Portable Blender Cup", sku: "PBC-001", cost: 6.4, price: 24.99 },
  { name: "Pet Hair Remover Roller", sku: "PHR-014", cost: 4.2, price: 19.99 },
  { name: "LED Strip Lights (5m)", sku: "LED-205", cost: 5.8, price: 22.49 },
  { name: "Smart Water Bottle", sku: "SWB-102", cost: 9.6, price: 34.95 },
  { name: "Massage Gun", sku: "MSG-330", cost: 22.0, price: 89.99 },
  { name: "Wireless Earbuds Pro", sku: "WEP-409", cost: 17.5, price: 79.0 },
];

let nextId = 1;

export default function DealsPage() {
  const [buyer, setBuyer] = useState("FitLife Stores");
  const [contact, setContact] = useState("Sarah Chen — Head of Buying");
  const [validDays, setValidDays] = useState(14);
  const [discount, setDiscount] = useState(5);
  const [shipping, setShipping] = useState(450);
  const [terms, setTerms] = useState("Net 30");
  const [lines, setLines] = useState<Line[]>([
    { id: "L1", product: "Portable Blender Cup", sku: "PBC-001", qty: 500, cost: 6.4, price: 18.5 },
    { id: "L2", product: "Pet Hair Remover Roller", sku: "PHR-014", qty: 300, cost: 4.2, price: 13.5 },
  ]);
  const [realQuotes, setRealQuotes] = useState<RealQuote[] | null>(null);
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    quotes: Array<{ id: string; productName: string; total: number; shareToken: string; quantity: number }>;
  } | null>(null);
  const { toast } = useToast();

  // Live quotes from /api/quotes — these are AI-generated from accepted
  // outreach drafts via lib/agents/quote.ts. The builder above is a manual
  // bulk-quote preview; the real flow is Outreach → Draft → Quote.
  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch("/api/quotes", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled) return;
          const list: RealQuote[] = d?.quotes ?? [];
          // Newest first
          list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setRealQuotes(list);
        })
        .catch(() => {
          if (!cancelled) setRealQuotes([]);
        });
    }
    load();
    const id = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  function addLine() {
    const c = PRODUCT_CATALOG[0];
    setLines((l) => [
      ...l,
      { id: `L${++nextId}`, product: c.name, sku: c.sku, qty: 100, cost: c.cost, price: c.price * 0.7 },
    ]);
  }
  function update(id: string, patch: Partial<Line>) {
    setLines((l) => l.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }
  function remove(id: string) {
    setLines((l) => l.filter((row) => row.id !== id));
  }

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
    const totalCost = lines.reduce((s, l) => s + l.qty * l.cost, 0);
    const discountAmt = subtotal * (discount / 100);
    const total = subtotal - discountAmt + shipping;
    const grossMargin = total - totalCost - shipping;
    const marginPct = total ? (grossMargin / total) * 100 : 0;
    return { subtotal, totalCost, discountAmt, total, grossMargin, marginPct };
  }, [lines, discount, shipping]);

  function handleExport() {
    const rows = lines.map((l) => ({
      product: l.product,
      sku: l.sku,
      qty: l.qty,
      unit_cost: l.cost,
      unit_price: l.price,
      line_total: +(l.qty * l.price).toFixed(2),
      line_margin: +(l.qty * (l.price - l.cost)).toFixed(2),
    }));
    rows.push(
      { product: "", sku: "", qty: 0, unit_cost: 0, unit_price: 0, line_total: -totals.discountAmt, line_margin: 0 } as any
    );
    rows.push(
      { product: "Shipping", sku: "", qty: 0, unit_cost: 0, unit_price: 0, line_total: shipping, line_margin: 0 } as any
    );
    rows.push(
      { product: "TOTAL", sku: "", qty: 0, unit_cost: 0, unit_price: 0, line_total: +totals.total.toFixed(2), line_margin: +totals.grossMargin.toFixed(2) } as any
    );
    const safe = buyer.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
    downloadCSV(`quote-${safe}-${Date.now()}.csv`, rows);
    toast(`Quote exported · $${totals.total.toFixed(2)} for ${buyer}`);
  }

  // Bulk-quote create — wires the builder to POST /api/quotes which
  // creates one Quote record per line item. Each quote gets its own
  // shareToken so the operator can paste a per-line buyer link from
  // the result modal. Pricing strategy mirrors the builder's own
  // math (subtotal − discount + pro-rata shipping).
  async function handleCreateBulk() {
    if (lines.length === 0) {
      toast("Add at least one line item before creating quotes", "error");
      return;
    }
    if (!buyer.trim()) {
      toast("Buyer company is required", "error");
      return;
    }
    setBulkCreating(true);
    try {
      const r = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          buyerCompany: buyer.trim(),
          buyerName: contact.trim() || buyer.trim(),
          paymentTerms: terms,
          shippingTerms: "FOB Origin",
          validForDays: validDays,
          discountPct: discount,
          shippingCents: Math.round(shipping * 100),
          lines: lines.map((l) => ({
            product: l.product,
            sku: l.sku,
            qty: l.qty,
            price: l.price,
          })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Create failed (${r.status})`);
      const quotes = (d.quotes ?? []) as typeof bulkResult extends null
        ? never
        : NonNullable<typeof bulkResult>["quotes"];
      setBulkResult({ quotes });
      toast(`Created ${quotes.length} quote${quotes.length === 1 ? "" : "s"}`, "success");
      // Refresh the live-quotes panel so the new ones appear there too.
      try {
        const rr = await fetch("/api/quotes", { cache: "no-store" });
        const dd = await rr.json();
        const list: RealQuote[] = dd?.quotes ?? [];
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setRealQuotes(list);
      } catch {}
    } catch (e) {
      toast(e instanceof Error ? e.message : "Create failed", "error");
    } finally {
      setBulkCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Deals &amp; Quotes</h1>
            <p className="text-xs text-ink-secondary">
              {realQuotes ? `${realQuotes.length} live quote${realQuotes.length === 1 ? "" : "s"}` : "Loading…"}
              {" · bulk quote builder below"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
            title="Download the bulk-quote draft as a CSV — useful for procurement teams who want the line items in a spreadsheet"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
          <button
            onClick={handleCreateBulk}
            disabled={bulkCreating || lines.length === 0 || !buyer.trim()}
            className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow disabled:opacity-60"
            title="Create one Quote per line in the store. Each quote gets its own shareable buyer link."
          >
            {bulkCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Creating…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" /> Create {lines.length} quote{lines.length === 1 ? "" : "s"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live quotes — auto-generated from accepted outreach drafts */}
      <RealQuotesPanel quotes={realQuotes} />

      {/* Two-flow note explaining when to use which path. */}
      <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 px-4 py-3">
        <div className="flex items-start gap-3 text-[12px]">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand-500/15">
            <Sparkles className="h-3.5 w-3.5 text-brand-300" />
          </div>
          <div className="flex-1">
            <span className="font-semibold text-brand-200">Two ways to create quotes</span>
            <span className="text-ink-secondary">
              {" "}
              — <strong>Auto:</strong> AI Outreach Agent drafts → buyer accepts → Quote Agent prices.
              Lands in the panel above. <strong>Manual bulk:</strong> use the builder below for
              multi-line / RFP-style quotes. <strong>Create N quotes</strong> in the header writes
              one Quote per line to the store; each gets its own shareable buyer link.
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4 rounded-xl border border-bg-border bg-bg-card p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Buyer Company" value={buyer} onChange={setBuyer} />
            <Field label="Contact" value={contact} onChange={setContact} />
            <Field label="Valid (days)" value={String(validDays)} onChange={(v) => setValidDays(+v || 0)} type="number" />
            <Field label="Payment Terms" value={terms} onChange={setTerms} />
          </div>

          <div className="rounded-lg border border-bg-border bg-bg-panel">
            <div className="flex items-center justify-between border-b border-bg-border px-4 py-2.5">
              <div className="text-sm font-semibold">Line Items</div>
              <button
                onClick={addLine}
                className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-hover/40 px-2 py-1 text-xs text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
              >
                <Plus className="h-3 w-3" /> Add line
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Product</th>
                    <th className="px-2 py-2 text-left font-medium">SKU</th>
                    <th className="px-2 py-2 text-left font-medium">Qty</th>
                    <th className="px-2 py-2 text-left font-medium">Cost</th>
                    <th className="px-2 py-2 text-left font-medium">Price</th>
                    <th className="px-2 py-2 text-left font-medium">Margin</th>
                    <th className="px-2 py-2 text-left font-medium">Total</th>
                    <th className="px-3 py-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const rowTotal = l.qty * l.price;
                    const margin = l.qty * (l.price - l.cost);
                    const marginPct = l.price ? ((l.price - l.cost) / l.price) * 100 : 0;
                    return (
                      <tr key={l.id} className="border-t border-bg-border">
                        <td className="px-3 py-2">
                          <select
                            value={l.product}
                            onChange={(e) => {
                              const p = PRODUCT_CATALOG.find((x) => x.name === e.target.value)!;
                              update(l.id, {
                                product: p.name,
                                sku: p.sku,
                                cost: p.cost,
                                price: +(p.price * 0.7).toFixed(2),
                              });
                            }}
                            className="w-44 rounded-md border border-bg-border bg-bg-card px-2 py-1 text-xs"
                          >
                            {PRODUCT_CATALOG.map((p) => (
                              <option key={p.sku}>{p.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2 text-xs text-ink-tertiary">{l.sku}</td>
                        <td className="px-2 py-2">
                          <NumInput value={l.qty} onChange={(v) => update(l.id, { qty: v })} w="w-20" />
                        </td>
                        <td className="px-2 py-2">
                          <NumInput value={l.cost} onChange={(v) => update(l.id, { cost: v })} w="w-20" step={0.1} />
                        </td>
                        <td className="px-2 py-2">
                          <NumInput value={l.price} onChange={(v) => update(l.id, { price: v })} w="w-20" step={0.1} />
                        </td>
                        <td className="px-2 py-2 text-xs">
                          <span className={marginPct > 30 ? "text-accent-green" : "text-accent-amber"}>
                            {marginPct.toFixed(0)}%
                          </span>
                          <div className="text-[10px] text-ink-tertiary">${margin.toFixed(0)}</div>
                        </td>
                        <td className="px-2 py-2 font-semibold">${rowTotal.toFixed(0)}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => remove(l.id)}
                            className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-accent-red/10 hover:text-accent-red"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Volume Discount %"
              value={String(discount)}
              onChange={(v) => setDiscount(+v || 0)}
              type="number"
            />
            <Field
              label="Shipping ($)"
              value={String(shipping)}
              onChange={(v) => setShipping(+v || 0)}
              type="number"
            />
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border border-bg-border bg-bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Calculator className="h-4 w-4 text-brand-300" /> Quote Summary
            </div>
            <div className="mt-3 space-y-1.5 text-sm">
              <Row label="Subtotal" value={`$${totals.subtotal.toFixed(2)}`} />
              <Row
                label={`Discount (${discount}%)`}
                value={`-$${totals.discountAmt.toFixed(2)}`}
                tone="text-accent-amber"
              />
              <Row label="Shipping" value={`$${shipping.toFixed(2)}`} />
              <div className="my-2 border-t border-bg-border" />
              <Row label="Total" value={`$${totals.total.toFixed(2)}`} bold />
              <Row
                label="Gross Margin"
                value={`$${totals.grossMargin.toFixed(0)} (${totals.marginPct.toFixed(0)}%)`}
                tone="text-accent-green"
              />
            </div>
          </div>

          <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand-200">
              <Sparkles className="h-4 w-4" /> AI Pricing Hint
            </div>
            <p className="mt-1 text-xs text-ink-secondary">
              {totals.marginPct < 25
                ? "Margin is below your floor — try lifting unit prices by 8% or trim shipping."
                : totals.marginPct < 35
                ? "Healthy margin. Buyers in this segment usually push for an extra 3-5% off — leave room."
                : "Strong margin. Consider offering a tighter discount to widen the gap."}
            </p>
          </div>
        </aside>
      </div>

      {bulkResult && (
        <BulkResultModal
          quotes={bulkResult.quotes}
          buyerName={contact || buyer}
          onClose={() => setBulkResult(null)}
          onCopied={(label) => toast(`${label} copied to clipboard`, "success")}
        />
      )}
    </div>
  );
}

function BulkResultModal({
  quotes,
  buyerName,
  onClose,
  onCopied,
}: {
  quotes: Array<{ id: string; productName: string; total: number; shareToken: string; quantity: number }>;
  buyerName: string;
  onClose: () => void;
  onCopied: (label: string) => void;
}) {
  // Build the per-quote share URL the operator would paste in an email.
  // Origin comes from window so this works on whatever domain we're on.
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      onCopied(label);
    } catch {
      // Older browsers / non-https — fall back to a prompt so the
      // operator can still grab the value.
      window.prompt(`Copy this ${label.toLowerCase()}:`, text);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-app/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-bg-border bg-bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-accent-green" />
            <div>
              <div className="text-base font-semibold">
                Created {quotes.length} quote{quotes.length === 1 ? "" : "s"}
              </div>
              <div className="text-[11px] text-ink-tertiary">
                For {buyerName} — each line is its own Quote with a shareable buyer link
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 max-h-[50vh] overflow-y-auto rounded-md border border-bg-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-bg-card">
              <tr className="border-b border-bg-border text-left text-[10px] uppercase tracking-wider text-ink-tertiary">
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const url = `${origin}/quote/${q.id}?t=${encodeURIComponent(q.shareToken)}`;
                return (
                  <tr key={q.id} className="border-t border-bg-border">
                    <td className="px-3 py-2">
                      <div className="font-medium text-ink-primary truncate max-w-[260px]" title={q.productName}>
                        {q.productName}
                      </div>
                      <div className="text-[10px] text-ink-tertiary font-mono">{q.id}</div>
                    </td>
                    <td className="px-3 py-2 text-right text-ink-secondary">{q.quantity}</td>
                    <td className="px-3 py-2 text-right text-ink-primary font-mono">
                      ${q.total.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => copy(url, "Buyer link")}
                          title="Copy the share URL the buyer can open"
                          className="inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-app px-2 py-1 text-[10px] text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
                        >
                          <Copy className="h-3 w-3" />
                          Copy link
                        </button>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          title="Open the buyer view in a new tab"
                          className="grid h-6 w-6 place-items-center rounded-md border border-bg-border bg-bg-app text-ink-tertiary hover:text-ink-primary"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-[10px] text-ink-tertiary">
            All quotes start in <strong>draft</strong> status — open one + send the link to the buyer.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gradient-brand px-3 py-2 text-[12px] font-semibold shadow-glow"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-xs">
      <div className="mb-1 font-medium uppercase tracking-wider text-ink-tertiary">
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-bg-border bg-bg-card px-3 text-sm focus:border-brand-500 focus:outline-none"
      />
    </label>
  );
}

function NumInput({
  value,
  onChange,
  w = "w-24",
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  w?: string;
  step?: number;
}) {
  return (
    <input
      type="number"
      step={step}
      value={value}
      onChange={(e) => onChange(+e.target.value)}
      className={`h-8 ${w} rounded-md border border-bg-border bg-bg-card px-2 text-xs focus:border-brand-500 focus:outline-none`}
    />
  );
}

function Row({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-secondary">{label}</span>
      <span className={`${bold ? "text-base font-bold" : ""} ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

function RealQuotesPanel({ quotes }: { quotes: RealQuote[] | null }) {
  if (!quotes) {
    return (
      <div className="rounded-xl border border-bg-border bg-bg-card p-5 text-sm text-ink-tertiary">
        Loading quotes…
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-500/5 to-transparent p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/15">
            <FileText className="h-5 w-5 text-brand-300" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">No quotes generated yet</div>
            <p className="mt-1 text-xs text-ink-secondary">
              Quotes are auto-generated from accepted outreach drafts. Send a draft from{" "}
              <Link href="/outreach" className="text-brand-300 hover:text-brand-200 underline">/outreach</Link>{" "}
              and the Quote Agent prices it. Each quote gets its own public buyer link.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/outreach"
                className="flex items-center gap-1.5 rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow"
              >
                <Send className="h-3 w-3" /> Open Outreach
              </Link>
              <Link
                href="/pipeline"
                className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-xs hover:bg-bg-hover"
              >
                <Sparkles className="h-3 w-3" /> Run pipeline
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card">
      <div className="flex items-center justify-between border-b border-bg-border px-5 py-3.5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4 text-brand-300" /> Live Quotes — auto-generated from drafts
        </div>
        <span className="text-[11px] text-ink-tertiary">{quotes.length} total · refreshes every 20s</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
            <tr>
              <th className="px-5 py-2.5 text-left font-medium">Quote</th>
              <th className="px-3 py-2.5 text-left font-medium">Buyer</th>
              <th className="px-3 py-2.5 text-left font-medium">Product</th>
              <th className="px-3 py-2.5 text-right font-medium">Total</th>
              <th className="px-3 py-2.5 text-left font-medium">Terms</th>
              <th className="px-3 py-2.5 text-left font-medium">Status</th>
              <th className="px-5 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {quotes.slice(0, 10).map((q) => {
              const tone = QUOTE_STATUS_TONE[q.status];
              return (
                <tr key={q.id} className="border-t border-bg-border hover:bg-bg-hover/30">
                  <td className="px-5 py-3">
                    <div className="font-mono text-[11px] text-ink-tertiary">{q.id.slice(0, 14)}…</div>
                    <div className="text-[10px] text-ink-tertiary">{fmtRelTime(q.createdAt)}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{q.buyerCompany}</div>
                    <div className="text-[11px] text-ink-tertiary">{q.buyerName}</div>
                  </td>
                  <td className="px-3 py-3 text-ink-secondary">
                    {q.productName} <span className="text-ink-tertiary">× {q.quantity.toLocaleString()}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="font-bold">${q.total.toLocaleString()}</div>
                    <div className="text-[10px] text-ink-tertiary">${q.unitPrice.toFixed(2)}/u</div>
                  </td>
                  <td className="px-3 py-3 text-[11px] text-ink-secondary">
                    {q.paymentTerms}
                    <div className="text-[10px] text-ink-tertiary">{q.leadTimeDays}d lead</div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${tone.bg} ${tone.text}`}>
                      <tone.Icon className="h-3 w-3" />
                      {q.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <Link
                        href={`/quote/${q.id}?t=${q.shareToken}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="grid h-7 w-7 place-items-center rounded-md border border-bg-border text-ink-secondary hover:text-ink-primary"
                        title="Open buyer view"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/quote/${q.id}?t=${q.shareToken}`;
                          navigator.clipboard.writeText(url).catch(() => {});
                        }}
                        className="grid h-7 w-7 place-items-center rounded-md border border-bg-border text-ink-secondary hover:text-ink-primary"
                        title="Copy public link"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {quotes.length > 10 && (
        <div className="border-t border-bg-border px-5 py-2.5 text-center text-[11px] text-ink-tertiary">
          Showing 10 of {quotes.length}. Older quotes still accessible via direct buyer link.
        </div>
      )}
    </div>
  );
}
