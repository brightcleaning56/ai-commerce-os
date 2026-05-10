"use client";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  Landmark,
  Loader2,
  Lock,
  Package,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Truck,
  Unlock,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/Toast";

type EscrowStatus = "holding" | "pending_release" | "released" | "disputed";

type MilestoneStatus = "pending" | "in_progress" | "passed" | "failed";

type Milestone = {
  label: string;
  condition: string;
  status: MilestoneStatus;
  pct: number;
};

type EscrowAccount = {
  id: string;
  txId: string;
  buyer: string;
  supplier: string;
  product: string;
  totalHeld: number;
  platformFee: number;
  escrowFee: number;
  supplierPayout: number;
  status: EscrowStatus;
  depositedAt: string;
  estimatedRelease: string;
  milestones: Milestone[];
  trackingNumber?: string;
  carrier?: string;
  aiRiskScore: number;
};

const ESCROW_ACCOUNTS: EscrowAccount[] = [
  {
    id: "ESC-2281",
    txId: "TX-8821",
    buyer: "FitLife Stores",
    supplier: "Shenzhen ProBlend Manufacturing",
    product: "Portable Blender Cup × 5,000",
    totalHeld: 120000,
    platformFee: 8400,
    escrowFee: 1200,
    supplierPayout: 72000,
    status: "holding",
    depositedAt: "2024-05-19",
    estimatedRelease: "2024-06-02",
    aiRiskScore: 12,
    milestones: [
      { label: "Buyer KYC", condition: "Identity verified", status: "passed", pct: 0 },
      { label: "Contract Signed", condition: "DocuSign complete", status: "passed", pct: 0 },
      { label: "Payment Deposited", condition: "$120,000 received", status: "passed", pct: 25 },
      { label: "Production Verified", condition: "Supplier sample approved", status: "passed", pct: 25 },
      { label: "Shipped", condition: "Carrier scan + BOL received", status: "in_progress", pct: 25 },
      { label: "Delivery Confirmed", condition: "Recipient signature", status: "pending", pct: 25 },
    ],
    trackingNumber: "1Z999AA10123456784",
    carrier: "UPS Freight",
  },
  {
    id: "ESC-2279",
    txId: "TX-8819",
    buyer: "GreenLeaf Wellness",
    supplier: "Guangzhou MedTech Co.",
    product: "Massage Gun Pro × 1,200",
    totalHeld: 0,
    platformFee: 5880,
    escrowFee: 840,
    supplierPayout: 52500,
    status: "pending_release",
    depositedAt: "2024-05-21",
    estimatedRelease: "2024-05-25",
    aiRiskScore: 8,
    milestones: [
      { label: "Buyer KYC", condition: "Identity verified", status: "passed", pct: 0 },
      { label: "Contract Signed", condition: "DocuSign complete", status: "in_progress", pct: 0 },
      { label: "Payment Deposited", condition: "$84,000 required", status: "pending", pct: 25 },
      { label: "Production Verified", condition: "Supplier sample approved", status: "pending", pct: 25 },
      { label: "Shipped", condition: "Carrier scan + BOL received", status: "pending", pct: 25 },
      { label: "Delivery Confirmed", condition: "Recipient signature", status: "pending", pct: 25 },
    ],
  },
  {
    id: "ESC-2268",
    txId: "TX-8807",
    buyer: "Urban Outfitters West",
    supplier: "Ningbo AquaTech Ltd.",
    product: "Smart Water Bottle × 3,000",
    totalHeld: 67500,
    platformFee: 4725,
    escrowFee: 675,
    supplierPayout: 42000,
    status: "disputed",
    depositedAt: "2024-05-02",
    estimatedRelease: "2024-05-22",
    aiRiskScore: 74,
    milestones: [
      { label: "Buyer KYC", condition: "Identity verified", status: "passed", pct: 0 },
      { label: "Contract Signed", condition: "DocuSign complete", status: "passed", pct: 0 },
      { label: "Payment Deposited", condition: "$67,500 received", status: "passed", pct: 25 },
      { label: "Production Verified", condition: "Supplier sample approved", status: "passed", pct: 25 },
      { label: "Shipped", condition: "Carrier scan + BOL received", status: "passed", pct: 25 },
      { label: "Delivery Confirmed", condition: "Buyer reports 14% defect rate", status: "failed", pct: 25 },
    ],
    trackingNumber: "1Z999BB10198765432",
    carrier: "FedEx Freight",
  },
  {
    id: "ESC-2241",
    txId: "TX-8801",
    buyer: "TechRetail Co.",
    supplier: "Dongguan AudioTech",
    product: "Wireless Earbuds Pro × 2,500",
    totalHeld: 0,
    platformFee: 10413,
    escrowFee: 1488,
    supplierPayout: 98000,
    status: "released",
    depositedAt: "2024-04-20",
    estimatedRelease: "2024-05-15",
    aiRiskScore: 5,
    milestones: [
      { label: "Buyer KYC", condition: "Identity verified", status: "passed", pct: 0 },
      { label: "Contract Signed", condition: "DocuSign complete", status: "passed", pct: 0 },
      { label: "Payment Deposited", condition: "$148,750 received", status: "passed", pct: 25 },
      { label: "Production Verified", condition: "Supplier sample approved", status: "passed", pct: 25 },
      { label: "Shipped", condition: "Carrier scan + BOL received", status: "passed", pct: 25 },
      { label: "Delivery Confirmed", condition: "Recipient signature on 2024-05-15", status: "passed", pct: 25 },
    ],
    trackingNumber: "1Z999CC10112233445",
    carrier: "DHL Express",
  },
];

const STATUS_CONF: Record<EscrowStatus, { bg: string; text: string; border: string; label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  holding: { bg: "bg-brand-500/15", text: "text-brand-200", border: "border-brand-500/40", label: "Funds Held", Icon: Lock },
  pending_release: { bg: "bg-accent-amber/15", text: "text-accent-amber", border: "border-accent-amber/40", label: "Awaiting Deposit", Icon: Clock },
  released: { bg: "bg-accent-green/15", text: "text-accent-green", border: "border-accent-green/40", label: "Funds Released", Icon: Unlock },
  disputed: { bg: "bg-accent-red/15", text: "text-accent-red", border: "border-accent-red/40", label: "Disputed", Icon: AlertTriangle },
};

const MILESTONE_CONF: Record<MilestoneStatus, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  passed: { icon: CheckCircle2, color: "text-accent-green" },
  in_progress: { icon: Loader2, color: "text-brand-300" },
  pending: { icon: Clock, color: "text-ink-tertiary" },
  failed: { icon: AlertTriangle, color: "text-accent-red" },
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function EscrowPage() {
  const { toast } = useToast();
  const [releasing, setReleasing] = useState<string | null>(null);
  const [filter, setFilter] = useState<EscrowStatus | "all">("all");

  const visible = filter === "all" ? ESCROW_ACCOUNTS : ESCROW_ACCOUNTS.filter((e) => e.status === filter);

  const totals = {
    held: ESCROW_ACCOUNTS.filter((e) => e.status === "holding").reduce((s, e) => s + e.totalHeld, 0),
    disputed: ESCROW_ACCOUNTS.filter((e) => e.status === "disputed").reduce((s, e) => s + e.totalHeld, 0),
    released: ESCROW_ACCOUNTS.filter((e) => e.status === "released").reduce((s, e) => s + e.supplierPayout + e.platformFee + e.escrowFee, 0),
    fees: ESCROW_ACCOUNTS.filter((e) => e.status === "released").reduce((s, e) => s + e.escrowFee, 0),
  };

  async function handleRelease(id: string) {
    setReleasing(id);
    await new Promise((r) => setTimeout(r, 1400));
    setReleasing(null);
    toast("Escrow released — funds transferred to supplier via Stripe Connect");
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Landmark className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Escrow Center</h1>
            <p className="text-xs text-ink-secondary">
              Buyer funds held · milestone verification · automated supplier payouts via Stripe Connect
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

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-brand-500/40 bg-brand-500/5 p-4">
          <div className="text-[10px] uppercase tracking-wider text-brand-300">Currently Held</div>
          <div className="mt-1 text-2xl font-bold text-brand-200">{fmt(totals.held)}</div>
          <div className="mt-0.5 text-[11px] text-ink-tertiary">in active escrow</div>
        </div>
        <div className="rounded-xl border border-accent-red/30 bg-accent-red/5 p-4">
          <div className="text-[10px] uppercase tracking-wider text-accent-red">Disputed</div>
          <div className="mt-1 text-2xl font-bold text-accent-red">{fmt(totals.disputed)}</div>
          <div className="mt-0.5 text-[11px] text-ink-tertiary">under dispute review</div>
        </div>
        <div className="rounded-xl border border-accent-green/30 bg-accent-green/5 p-4">
          <div className="text-[10px] uppercase tracking-wider text-accent-green">Released</div>
          <div className="mt-1 text-2xl font-bold text-accent-green">{fmt(totals.released)}</div>
          <div className="mt-0.5 text-[11px] text-ink-tertiary">to suppliers (all time)</div>
        </div>
        <div className="rounded-xl border border-bg-border bg-bg-card p-4">
          <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Escrow Fees Earned</div>
          <div className="mt-1 text-2xl font-bold">{fmt(totals.fees)}</div>
          <div className="mt-0.5 text-[11px] text-ink-tertiary">platform revenue</div>
        </div>
      </div>

      {/* Money flow diagram */}
      <div className="rounded-xl border border-bg-border bg-bg-card p-5">
        <div className="mb-3 text-sm font-semibold">How escrow protects every transaction</div>
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
          {[
            { label: "Buyer", sub: "pays platform", Icon: Users, color: "bg-accent-blue/15 text-accent-blue" },
            { arrow: true },
            { label: "AI Commerce Escrow", sub: "holds funds securely", Icon: Landmark, color: "bg-brand-500/15 text-brand-200", highlight: true },
            { arrow: true },
            { label: "Milestone Check", sub: "AI verifies delivery", Icon: ShieldCheck, color: "bg-accent-amber/15 text-accent-amber" },
            { arrow: true },
            { label: "Supplier", sub: "receives payout", Icon: Package, color: "bg-accent-green/15 text-accent-green" },
          ].map((item, i) =>
            "arrow" in item ? (
              <ArrowRight key={i} className="h-4 w-4 shrink-0 text-ink-tertiary" />
            ) : (
              <div
                key={i}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 min-w-[100px] ${
                  item.highlight ? "border-brand-500/40 shadow-glow" : "border-bg-border"
                }`}
              >
                <div className={`grid h-9 w-9 place-items-center rounded-lg ${item.color}`}>
                  <item.Icon className="h-4 w-4" />
                </div>
                <div className="font-semibold text-center">{item.label}</div>
                <div className="text-[10px] text-ink-tertiary text-center">{item.sub}</div>
              </div>
            )
          )}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] text-ink-tertiary sm:grid-cols-3">
          <span className="flex items-center gap-1.5 justify-center"><ShieldCheck className="h-3 w-3 text-accent-green" /> KYC + AML on all parties</span>
          <span className="flex items-center gap-1.5 justify-center"><Zap className="h-3 w-3 text-brand-300" /> AI fraud detection on every order</span>
          <span className="flex items-center gap-1.5 justify-center"><Truck className="h-3 w-3 text-brand-300" /> Logistics verified before release</span>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-1 w-fit rounded-lg border border-bg-border bg-bg-card p-1 text-xs">
        {(["all", "holding", "pending_release", "disputed", "released"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 ${
              filter === f ? "bg-brand-500/15 text-brand-200" : "text-ink-secondary hover:bg-bg-hover"
            }`}
          >
            {f === "all" ? "All" : f === "holding" ? "Holding" : f === "pending_release" ? "Awaiting Deposit" : f === "disputed" ? "Disputed" : "Released"}
          </button>
        ))}
      </div>

      {/* Escrow cards */}
      <div className="space-y-4">
        {visible.map((esc) => {
          const conf = STATUS_CONF[esc.status];
          const StatusIcon = conf.Icon;
          const passedMilestones = esc.milestones.filter((m) => m.status === "passed").length;
          const milestonePct = Math.round((passedMilestones / esc.milestones.length) * 100);

          return (
            <div key={esc.id} className={`rounded-xl border ${conf.border} bg-bg-card overflow-hidden`}>
              {/* Card header */}
              <div className="flex flex-wrap items-start justify-between gap-3 p-5">
                <div className="flex items-start gap-3">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${conf.bg}`}>
                    <StatusIcon className={`h-5 w-5 ${conf.text}`} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-ink-tertiary">{esc.id}</span>
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${conf.bg} ${conf.text}`}>
                        {conf.label}
                      </span>
                      {esc.aiRiskScore > 50 && (
                        <span className="flex items-center gap-1 rounded-md bg-accent-red/15 px-2 py-0.5 text-[10px] font-semibold text-accent-red">
                          <AlertTriangle className="h-2.5 w-2.5" /> Risk {esc.aiRiskScore}
                        </span>
                      )}
                      {esc.aiRiskScore <= 20 && (
                        <span className="flex items-center gap-1 rounded-md bg-accent-green/15 px-2 py-0.5 text-[10px] font-semibold text-accent-green">
                          <ShieldCheck className="h-2.5 w-2.5" /> Low Risk {esc.aiRiskScore}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-semibold">{esc.buyer}</div>
                    <div className="text-[11px] text-ink-tertiary">{esc.product}</div>
                    <div className="mt-0.5 text-[11px] text-ink-tertiary">Supplier: {esc.supplier}</div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xl font-bold">{fmt(esc.totalHeld || (esc.supplierPayout + esc.platformFee + esc.escrowFee))}</div>
                  <div className="text-[11px] text-ink-tertiary">
                    {esc.status === "holding" ? "held in escrow" : esc.status === "released" ? "total processed" : "target amount"}
                  </div>
                  <div className="mt-1 space-y-0.5 text-[11px]">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-ink-tertiary">Platform fee</span>
                      <span className="font-medium text-accent-green">{fmt(esc.platformFee)}</span>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-ink-tertiary">Escrow fee</span>
                      <span className="font-medium text-brand-300">{fmt(esc.escrowFee)}</span>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-ink-tertiary">Supplier payout</span>
                      <span className="font-medium">{fmt(esc.supplierPayout)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Milestones */}
              <div className="border-t border-bg-border bg-bg-panel px-5 py-4">
                <div className="mb-2 flex items-center justify-between text-[11px]">
                  <span className="font-semibold uppercase tracking-wider text-ink-tertiary">Release Milestones</span>
                  <span className="text-ink-tertiary">{passedMilestones}/{esc.milestones.length} passed · {milestonePct}%</span>
                </div>
                <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-bg-hover">
                  <div
                    className={`h-full rounded-full ${esc.status === "disputed" ? "bg-accent-red" : esc.status === "released" ? "bg-accent-green" : "bg-gradient-brand"}`}
                    style={{ width: `${milestonePct}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {esc.milestones.map((m, i) => {
                    const mc = MILESTONE_CONF[m.status];
                    return (
                      <div key={i} className={`rounded-lg border p-2 text-[10px] ${
                        m.status === "passed" ? "border-accent-green/20 bg-accent-green/5" :
                        m.status === "failed" ? "border-accent-red/20 bg-accent-red/5" :
                        m.status === "in_progress" ? "border-brand-500/30 bg-brand-500/5" :
                        "border-bg-border bg-bg-card"
                      }`}>
                        <mc.icon className={`h-3.5 w-3.5 ${mc.color} ${m.status === "in_progress" ? "animate-spin" : ""}`} />
                        <div className="mt-1 font-semibold">{m.label}</div>
                        <div className="text-ink-tertiary">{m.condition}</div>
                      </div>
                    );
                  })}
                </div>

                {esc.trackingNumber && (
                  <div className="mt-3 flex items-center gap-2 rounded-md border border-bg-border bg-bg-card px-3 py-2 text-[11px]">
                    <Truck className="h-3.5 w-3.5 text-brand-300" />
                    <span className="text-ink-secondary">{esc.carrier}</span>
                    <span className="font-mono text-ink-primary">{esc.trackingNumber}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {esc.status === "holding" && passedMilestones >= esc.milestones.length - 1 && (
                    <button
                      onClick={() => handleRelease(esc.id)}
                      disabled={releasing === esc.id}
                      className="flex items-center gap-1.5 rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow disabled:opacity-60"
                    >
                      {releasing === esc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlock className="h-3 w-3" />}
                      Release Funds to Supplier
                    </button>
                  )}
                  {esc.status === "disputed" && (
                    <button
                      onClick={() => toast("Dispute mediation opened — AI Risk Agent reviewing evidence", "info")}
                      className="flex items-center gap-1.5 rounded-md bg-accent-red/15 border border-accent-red/30 px-3 py-1.5 text-xs font-semibold text-accent-red hover:bg-accent-red/20"
                    >
                      <AlertTriangle className="h-3 w-3" /> Open Dispute Resolution
                    </button>
                  )}
                  {esc.status === "released" && (
                    <div className="flex items-center gap-1.5 rounded-md bg-accent-green/15 px-3 py-1.5 text-xs font-semibold text-accent-green">
                      <CheckCircle2 className="h-3 w-3" /> Completed — Funds Released
                    </div>
                  )}
                  <button
                    onClick={() => toast(`AI monitoring active on ${esc.id} — fraud score ${esc.aiRiskScore}/100`, "info")}
                    className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-xs hover:bg-bg-hover"
                  >
                    <Sparkles className="h-3 w-3" /> AI Risk Report
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Infrastructure note */}
      <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/20">
            <Landmark className="h-5 w-5 text-brand-200" />
          </div>
          <div>
            <div className="text-sm font-semibold text-brand-200">Escrow infrastructure stack</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
              {[
                { name: "Stripe Connect", role: "Wallet + ACH + cards · automatic fee split" },
                { name: "Modern Treasury", role: "Enterprise wires + reconciliation" },
                { name: "Airwallex", role: "International supplier payouts" },
                { name: "Wise Business", role: "Cross-border transfers" },
              ].map((s) => (
                <div key={s.name} className="rounded-lg border border-bg-border bg-bg-card p-2.5">
                  <div className="font-semibold text-ink-primary">{s.name}</div>
                  <div className="text-[10px] text-ink-tertiary">{s.role}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-ink-tertiary">
              MVP uses Stripe Connect — buyer pays platform, platform splits fee and releases remainder to supplier. No banking licence required at this stage.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
