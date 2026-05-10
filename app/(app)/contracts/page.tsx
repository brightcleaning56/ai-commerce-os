"use client";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  PenLine,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type TxnState =
  | "draft" | "proposed" | "signed" | "payment_pending" | "escrow_held"
  | "shipped" | "delivered" | "released" | "completed" | "disputed"
  | "refunded" | "cancelled";

type Transaction = {
  id: string;
  buyerCompany: string;
  buyerName: string;
  buyerEmail?: string;
  productName: string;
  quantity: number;
  productTotalCents: number;
  state: TxnState;
  createdAt: string;
  contractSignedAt?: string;
  contractSignerName?: string;
  contractSignerIp?: string;
  contractDocUrl?: string;
  paymentTerms: string;
  shippingTerms: string;
  leadTimeDays: number;
  shareToken: string;
};

type ContractFilter = "all" | "awaiting" | "signed" | "executed";

const FILTERS: { key: ContractFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "awaiting", label: "Awaiting Signature" },
  { key: "signed", label: "Signed" },
  { key: "executed", label: "Executed" },
];

function bucketOf(t: Transaction): ContractFilter | null {
  if (t.state === "proposed") return "awaiting";
  if (t.state === "signed" || t.state === "payment_pending") return "signed";
  if (
    t.state === "escrow_held" ||
    t.state === "shipped" ||
    t.state === "delivered" ||
    t.state === "released" ||
    t.state === "completed"
  )
    return "executed";
  return null;
}

function fmtCents(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n / 100);
}

function relTime(iso?: string): string {
  if (!iso) return "—";
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

export default function ContractsPage() {
  const [txns, setTxns] = useState<Transaction[] | null>(null);
  const [filter, setFilter] = useState<ContractFilter>("all");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/transactions", { cache: "no-store" });
        if (!r.ok) {
          if (!cancelled) setTxns([]);
          return;
        }
        const d = await r.json();
        if (!cancelled) setTxns(d.transactions ?? []);
      } catch {
        if (!cancelled) setTxns([]);
      }
    }
    load();
    const id = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const contractTxns = useMemo(() => (txns ?? []).filter((t) => bucketOf(t) !== null), [txns]);
  const visible = useMemo(() => {
    if (filter === "all") return contractTxns;
    return contractTxns.filter((t) => bucketOf(t) === filter);
  }, [contractTxns, filter]);

  const counts = useMemo(
    () => ({
      all: contractTxns.length,
      awaiting: contractTxns.filter((t) => bucketOf(t) === "awaiting").length,
      signed: contractTxns.filter((t) => bucketOf(t) === "signed").length,
      executed: contractTxns.filter((t) => bucketOf(t) === "executed").length,
    }),
    [contractTxns],
  );

  const totals = useMemo(() => {
    const totalValue = contractTxns.reduce((s, t) => s + t.productTotalCents, 0);
    const executedValue = contractTxns
      .filter((t) => bucketOf(t) === "executed")
      .reduce((s, t) => s + t.productTotalCents, 0);
    return { totalValueCents: totalValue, executedValueCents: executedValue };
  }, [contractTxns]);

  if (txns && contractTxns.length === 0) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <ScrollText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Contracts</h1>
            <p className="text-xs text-ink-secondary">
              Clickwrap signatures · DocuSign integration · contract version history
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-500/5 to-transparent p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/15">
            <PenLine className="h-7 w-7 text-brand-300" />
          </div>
          <div className="mt-4 text-base font-semibold">No contracts yet</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-secondary">
            Once you send a transaction proposal, the buyer signs a clickwrap purchase agreement (or DocuSign envelope when configured).
            Signed contracts appear here with full audit trail — signer name, IP, timestamp.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/transactions"
              className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-xs font-semibold shadow-glow"
            >
              <Sparkles className="h-3 w-3" /> Open Transactions
            </Link>
            <Link
              href="/deals"
              className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-xs hover:bg-bg-hover"
            >
              <FileText className="h-3 w-3" /> Build a Quote
            </Link>
          </div>
        </div>

        <ContractsExplainer />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <ScrollText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Contracts</h1>
            <p className="text-xs text-ink-secondary">
              {contractTxns.length} contract{contractTxns.length === 1 ? "" : "s"} · {fmtCents(totals.totalValueCents)} total · {fmtCents(totals.executedValueCents)} executed
            </p>
          </div>
        </div>
        <Link
          href="/transactions"
          className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
        >
          All Transactions <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="All Contracts" v={String(counts.all)} sub="across every state" />
        <Stat label="Awaiting Signature" v={String(counts.awaiting)} sub="proposal sent, not yet signed" tone="amber" />
        <Stat label="Signed" v={String(counts.signed)} sub="ready for payment" tone="brand" />
        <Stat label="Executed" v={String(counts.executed)} sub="paid + in flight or closed" tone="green" />
      </div>

      <div className="flex flex-wrap items-center gap-1 w-fit rounded-lg border border-bg-border bg-bg-card p-1 text-xs">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-md px-3 py-1.5 ${
              filter === f.key
                ? "bg-brand-500/15 text-brand-200"
                : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
            }`}
          >
            {f.label} <span className="opacity-60">({counts[f.key]})</span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {visible.map((t) => {
          const bucket = bucketOf(t)!;
          const Icon = bucket === "awaiting" ? Clock : bucket === "signed" ? PenLine : CheckCircle2;
          const toneBg =
            bucket === "awaiting" ? "bg-accent-amber/15" : bucket === "signed" ? "bg-brand-500/15" : "bg-accent-green/15";
          const toneText =
            bucket === "awaiting" ? "text-accent-amber" : bucket === "signed" ? "text-brand-200" : "text-accent-green";
          return (
            <div key={t.id} className="rounded-xl border border-bg-border bg-bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${toneBg}`}>
                    <Icon className={`h-5 w-5 ${toneText}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-ink-tertiary">{t.id.slice(0, 14)}…</span>
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${toneBg} ${toneText}`}>
                        {bucket === "awaiting" ? "Awaiting signature" : bucket === "signed" ? "Signed" : "Executed"}
                      </span>
                    </div>
                    <div className="mt-1 font-semibold">Purchase Agreement · {t.buyerCompany}</div>
                    <div className="text-[11px] text-ink-tertiary">
                      {t.productName} × {t.quantity.toLocaleString()} · {t.paymentTerms}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold">{fmtCents(t.productTotalCents)}</div>
                  <div className="text-[11px] text-ink-tertiary">total contract value</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 text-[11px]">
                <Field label="Buyer" v={t.buyerName} sub={t.buyerEmail} />
                <Field
                  label="Signed By"
                  v={t.contractSignerName ?? (bucket === "awaiting" ? "—" : "Pending")}
                  sub={t.contractSignedAt ? `${relTime(t.contractSignedAt)}` : ""}
                />
                <Field
                  label="Signature IP"
                  v={t.contractSignerIp ?? "—"}
                  sub={t.contractSignerIp ? "captured at sign time" : ""}
                />
                <Field label="Created" v={relTime(t.createdAt)} sub={new Date(t.createdAt).toLocaleDateString()} />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-bg-border pt-3 text-[11px] text-ink-tertiary">
                <span>Shipping: {t.shippingTerms} · Lead time: {t.leadTimeDays} days</span>
                <div className="flex items-center gap-2">
                  {t.contractDocUrl && (
                    <a
                      href={t.contractDocUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card px-3 py-1.5 hover:bg-bg-hover text-[11px]"
                    >
                      <Eye className="h-3 w-3" /> View Document
                    </a>
                  )}
                  <Link
                    href={`/transaction/${t.id}?t=${t.shareToken}`}
                    target="_blank"
                    className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card px-3 py-1.5 hover:bg-bg-hover text-[11px]"
                  >
                    <Eye className="h-3 w-3" /> Buyer View
                  </Link>
                  <Link
                    href="/transactions"
                    className="flex items-center gap-1.5 rounded-md bg-gradient-brand px-3 py-1.5 text-[11px] font-semibold shadow-glow"
                  >
                    Manage <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <ContractsExplainer />
    </div>
  );
}

function Stat({ label, v, sub, tone = "default" }: { label: string; v: string; sub?: string; tone?: "default" | "brand" | "green" | "amber" }) {
  const valueClass =
    tone === "brand" ? "text-brand-200" :
    tone === "green" ? "text-accent-green" :
    tone === "amber" ? "text-accent-amber" : "";
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${valueClass}`}>{v}</div>
      {sub && <div className="mt-0.5 text-[11px] text-ink-tertiary">{sub}</div>}
    </div>
  );
}

function Field({ label, v, sub }: { label: string; v: string; sub?: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium">{v}</div>
      {sub && <div className="text-[10px] text-ink-tertiary truncate">{sub}</div>}
    </div>
  );
}

function ContractsExplainer() {
  return (
    <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/20">
          <ShieldCheck className="h-5 w-5 text-brand-200" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-brand-200">How contracts work in AVYN Commerce</div>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3 text-[11px] text-ink-secondary">
            <div>
              <div className="font-semibold text-ink-primary">1. In-app clickwrap (default)</div>
              Buyer clicks &quot;Sign &amp; Pay&quot; — name, IP, timestamp captured. Legally binding e-signature under
              ESIGN/UETA. Zero setup.
            </div>
            <div>
              <div className="font-semibold text-ink-primary">2. DocuSign envelope (optional)</div>
              Set <code className="rounded bg-bg-hover px-1 text-[10px]">CONTRACT_MODE=docusign</code> + DocuSign
              creds and contracts route through their envelope flow. Same Transaction fields populate either way.
            </div>
            <div>
              <div className="font-semibold text-ink-primary">3. Audit trail</div>
              Every signature event is appended to the transaction&apos;s stateHistory with actor, timestamp, and
              detail line. Full record under{" "}
              <Link href="/admin/audit" className="text-brand-300">Audit Logs</Link>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
