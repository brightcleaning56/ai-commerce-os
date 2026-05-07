"use client";
import { Calculator, Download, FileText, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { downloadCSV } from "@/lib/csv";

type Line = { id: string; product: string; sku: string; qty: number; cost: number; price: number };

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
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { toast } = useToast();

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

  function handleSend() {
    if (lines.length === 0) {
      toast("Add at least one line item before sending", "error");
      return;
    }
    setSentTo(`${contact} (${buyer})`);
    toast(`Quote sent to ${buyer} · $${totals.total.toFixed(2)} · valid ${validDays}d`);
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
            <p className="text-xs text-ink-secondary">Build a wholesale quote in seconds</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sentTo && (
            <span className="rounded-md bg-accent-green/15 px-2 py-1 text-[11px] font-semibold text-accent-green">
              Sent to {sentTo}
            </span>
          )}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
          <button
            onClick={handleSend}
            className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow"
          >
            <Send className="h-4 w-4" /> Send Quote
          </button>
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
