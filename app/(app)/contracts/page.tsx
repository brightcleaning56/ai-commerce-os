"use client";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Landmark,
  Loader2,
  Package,
  PenLine,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/Toast";

type SignatureStatus = "signed" | "pending" | "declined" | "expired";
type ContractType = "purchase_agreement" | "nda" | "supplier_agreement" | "escrow_terms";

type Signer = {
  name: string;
  role: string;
  email: string;
  status: SignatureStatus;
  signedAt?: string;
};

type ContractClause = {
  title: string;
  summary: string;
  aiFlag?: "ok" | "caution" | "risk";
};

type Contract = {
  id: string;
  txId?: string;
  type: ContractType;
  title: string;
  buyer: string;
  supplier?: string;
  product?: string;
  value?: number;
  createdAt: string;
  expiresAt?: string;
  status: "active" | "draft" | "executed" | "expired" | "terminated";
  signers: Signer[];
  clauses: ContractClause[];
  aiSummary: string;
  aiRiskScore: number;
};

const CONTRACTS: Contract[] = [
  {
    id: "CNTR-4421",
    txId: "TX-8821",
    type: "purchase_agreement",
    title: "Wholesale Purchase Agreement — Portable Blender Cup",
    buyer: "FitLife Stores",
    supplier: "Shenzhen ProBlend Manufacturing",
    product: "Portable Blender Cup × 5,000 units",
    value: 120000,
    createdAt: "2024-05-18",
    expiresAt: "2024-06-18",
    status: "active",
    aiRiskScore: 12,
    aiSummary: "Standard wholesale agreement. Payment via escrow, Net 30 post-delivery. Supplier responsible for defect rate >2%. All clauses within normal parameters.",
    signers: [
      { name: "Eric Moore", role: "Seller (AVYN Commerce)", email: "Ericduolo4@gmail.com", status: "signed", signedAt: "2024-05-18 14:22 UTC" },
      { name: "Marcus Webb", role: "Buyer (FitLife Stores)", email: "m.webb@fitlifestores.com", status: "signed", signedAt: "2024-05-18 16:45 UTC" },
      { name: "Chen Wei", role: "Supplier (Shenzhen ProBlend)", email: "c.wei@problend.cn", status: "signed", signedAt: "2024-05-19 08:12 UTC" },
    ],
    clauses: [
      { title: "Product Specifications", summary: "5,000 units, SKU PBC-001, color Slate Grey, compliant with FDA 21 CFR §177.1520", aiFlag: "ok" },
      { title: "Pricing & Payment", summary: "$120,000 total. 100% via AVYN Commerce escrow. Released on delivery confirmation.", aiFlag: "ok" },
      { title: "Delivery Timeline", summary: "Ex-works Shenzhen by May 28. US destination by June 8. Delays >7 days trigger 1.5% penalty.", aiFlag: "ok" },
      { title: "Quality & Defects", summary: "Accepted defect rate ≤2%. Buyer has 7 days post-delivery to raise quality disputes.", aiFlag: "ok" },
      { title: "Intellectual Property", summary: "AVYN Commerce retains branding rights. Supplier may not resell to buyer-direct channels.", aiFlag: "ok" },
      { title: "Dispute Resolution", summary: "Disputes resolved via AVYN Commerce arbitration. Binding decision within 14 business days.", aiFlag: "ok" },
    ],
  },
  {
    id: "CNTR-4419",
    txId: "TX-8819",
    type: "purchase_agreement",
    title: "Wholesale Purchase Agreement — Massage Gun Pro",
    buyer: "GreenLeaf Wellness",
    supplier: "Guangzhou MedTech Co.",
    product: "Massage Gun Pro × 1,200 units",
    value: 84000,
    createdAt: "2024-05-20",
    expiresAt: "2024-06-20",
    status: "draft",
    aiRiskScore: 18,
    aiSummary: "Contract pending buyer signature. Slightly elevated risk: supplier requested removal of defect penalty clause (flagged). Recommend keeping clause as-is.",
    signers: [
      { name: "Eric Moore", role: "Seller (AVYN Commerce)", email: "Ericduolo4@gmail.com", status: "signed", signedAt: "2024-05-20 11:00 UTC" },
      { name: "Priya Nair", role: "Buyer (GreenLeaf Wellness)", email: "p.nair@greenleafwellness.com", status: "pending" },
      { name: "Liu Yang", role: "Supplier (Guangzhou MedTech)", email: "l.yang@medtechgz.cn", status: "pending" },
    ],
    clauses: [
      { title: "Product Specifications", summary: "1,200 units, Massage Gun Pro MG-330, CE + FCC certified", aiFlag: "ok" },
      { title: "Pricing & Payment", summary: "$84,000 total via AVYN Commerce escrow. Released upon delivery and inspection.", aiFlag: "ok" },
      { title: "Delivery Timeline", summary: "Ex-works Guangzhou by June 3. US destination by June 14.", aiFlag: "ok" },
      { title: "Quality & Defects", summary: "Supplier requested removal of defect penalty. Pending negotiation — AVYN flagged for review.", aiFlag: "caution" },
      { title: "FDA Compliance", summary: "Supplier to provide FDA 510(k) exemption letter prior to shipment.", aiFlag: "ok" },
      { title: "Exclusivity Window", summary: "30-day exclusivity window granted to GreenLeaf Wellness in the wellness vertical.", aiFlag: "ok" },
    ],
  },
  {
    id: "CNTR-4408",
    txId: "TX-8807",
    type: "purchase_agreement",
    title: "Wholesale Purchase Agreement — Smart Water Bottle",
    buyer: "Urban Outfitters West",
    supplier: "Ningbo AquaTech Ltd.",
    product: "Smart Water Bottle × 3,000 units",
    value: 67500,
    createdAt: "2024-05-01",
    status: "active",
    aiRiskScore: 68,
    aiSummary: "CAUTION: Buyer has opened a quality dispute citing 14% defect rate. Contract clause 4 (Defects) is being invoked. Escrow hold extended pending arbitration outcome.",
    signers: [
      { name: "Eric Moore", role: "Seller (AVYN Commerce)", email: "Ericduolo4@gmail.com", status: "signed", signedAt: "2024-05-01 09:00 UTC" },
      { name: "James Calloway", role: "Buyer (Urban Outfitters West)", email: "j.calloway@uow.com", status: "signed", signedAt: "2024-05-01 13:22 UTC" },
      { name: "Zhang Ming", role: "Supplier (Ningbo AquaTech)", email: "z.ming@aquatech.cn", status: "signed", signedAt: "2024-05-02 07:18 UTC" },
    ],
    clauses: [
      { title: "Product Specifications", summary: "3,000 units, SWB-102, BPA-free, 500ml, LFGB certified", aiFlag: "ok" },
      { title: "Pricing & Payment", summary: "$67,500 total via AVYN Commerce escrow. Currently under dispute hold.", aiFlag: "risk" },
      { title: "Delivery Timeline", summary: "Delivered May 20. On-time delivery confirmed.", aiFlag: "ok" },
      { title: "Quality & Defects", summary: "Buyer reports 14% defect rate vs accepted ≤2%. Dispute formally opened. Arbitration underway.", aiFlag: "risk" },
      { title: "Arbitration", summary: "AVYN Commerce arbitration initiated May 22. Decision expected within 14 business days.", aiFlag: "caution" },
    ],
  },
  {
    id: "CNTR-4391",
    txId: "TX-8801",
    type: "purchase_agreement",
    title: "Wholesale Purchase Agreement — Wireless Earbuds Pro",
    buyer: "TechRetail Co.",
    supplier: "Dongguan AudioTech",
    product: "Wireless Earbuds Pro × 2,500 units",
    value: 148750,
    createdAt: "2024-04-18",
    status: "executed",
    aiRiskScore: 5,
    aiSummary: "Contract fully executed. Delivery confirmed May 15. Escrow released. All clauses satisfied. No disputes. Clean transaction.",
    signers: [
      { name: "Eric Moore", role: "Seller (AVYN Commerce)", email: "Ericduolo4@gmail.com", status: "signed", signedAt: "2024-04-18 10:00 UTC" },
      { name: "Aiko Yamamoto", role: "Buyer (TechRetail Co.)", email: "a.yamamoto@techretail.co", status: "signed", signedAt: "2024-04-18 14:30 UTC" },
      { name: "Kevin Du", role: "Supplier (Dongguan AudioTech)", email: "k.du@audiotech-dg.com", status: "signed", signedAt: "2024-04-19 06:55 UTC" },
    ],
    clauses: [
      { title: "Product Specifications", summary: "2,500 units, WEP-409, Bluetooth 5.3, 30hr battery, FCC + CE", aiFlag: "ok" },
      { title: "Pricing & Payment", summary: "$148,750 total. Escrow released May 15 after delivery confirmation.", aiFlag: "ok" },
      { title: "Delivery Timeline", summary: "Ex-works Dongguan April 28. Delivered May 15 (on time).", aiFlag: "ok" },
      { title: "Quality & Defects", summary: "0 defects reported. Buyer satisfied. No disputes.", aiFlag: "ok" },
    ],
  },
];

const STATUS_CONF: Record<Contract["status"], { bg: string; text: string; label: string }> = {
  active: { bg: "bg-accent-green/15", text: "text-accent-green", label: "Active" },
  draft: { bg: "bg-accent-amber/15", text: "text-accent-amber", label: "Awaiting Signatures" },
  executed: { bg: "bg-bg-hover", text: "text-ink-secondary", label: "Executed" },
  expired: { bg: "bg-bg-hover", text: "text-ink-tertiary", label: "Expired" },
  terminated: { bg: "bg-accent-red/15", text: "text-accent-red", label: "Terminated" },
};

const SIG_CONF: Record<SignatureStatus, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  signed: { icon: CheckCircle2, color: "text-accent-green", label: "Signed" },
  pending: { icon: Clock, color: "text-accent-amber", label: "Pending" },
  declined: { icon: XCircle, color: "text-accent-red", label: "Declined" },
  expired: { icon: AlertTriangle, color: "text-ink-tertiary", label: "Expired" },
};

const CLAUSE_FLAG: Record<string, { bg: string; text: string }> = {
  ok: { bg: "bg-accent-green/10", text: "text-accent-green" },
  caution: { bg: "bg-accent-amber/10", text: "text-accent-amber" },
  risk: { bg: "bg-accent-red/10", text: "text-accent-red" },
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function ContractsPage() {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState<Contract["status"] | "all">("all");

  const visible = filter === "all" ? CONTRACTS : CONTRACTS.filter((c) => c.status === filter);

  async function handleGenerate() {
    setGenerating(true);
    await new Promise((r) => setTimeout(r, 1600));
    setGenerating(false);
    toast("Contract generated from proposal — sent to DocuSign for e-signature");
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <ScrollText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Contracts</h1>
            <p className="text-xs text-ink-secondary">
              AI-generated purchase agreements · DocuSign e-signatures · milestone terms · dispute protection
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/transactions"
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
          >
            Transactions <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow disabled:opacity-60"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            {generating ? "Generating…" : "AI Generate Contract"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Active", value: CONTRACTS.filter((c) => c.status === "active").length, sub: "live agreements" },
          { label: "Awaiting Signature", value: CONTRACTS.filter((c) => c.status === "draft").length, sub: "pending DocuSign" },
          { label: "Executed", value: CONTRACTS.filter((c) => c.status === "executed").length, sub: "fully closed" },
          { label: "Total Value", value: fmt(CONTRACTS.reduce((s, c) => s + (c.value ?? 0), 0)), sub: "under contract", isValue: true },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-bg-border bg-bg-card p-4">
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{s.label}</div>
            <div className={`mt-1 font-bold ${s.isValue ? "text-xl" : "text-2xl"}`}>{s.value}</div>
            <div className="mt-0.5 text-[11px] text-ink-tertiary">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* AI clause analysis explainer */}
      <div className="rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-500/5 to-transparent p-4">
        <div className="flex items-center gap-3">
          <Sparkles className="h-4 w-4 text-brand-300" />
          <span className="text-sm font-semibold text-brand-200">AI Contract Intelligence</span>
          <div className="flex items-center gap-3 ml-auto text-[11px]">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent-green" /> Standard clause</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent-amber" /> Needs review</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent-red" /> Risk flagged</span>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-1 w-fit rounded-lg border border-bg-border bg-bg-card p-1 text-xs">
        {(["all", "active", "draft", "executed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 ${filter === f ? "bg-brand-500/15 text-brand-200" : "text-ink-secondary hover:bg-bg-hover"}`}
          >
            {f === "all" ? `All (${CONTRACTS.length})` : f === "draft" ? "Awaiting Signature" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Contract cards */}
      <div className="space-y-4">
        {visible.map((c) => {
          const sc = STATUS_CONF[c.status];
          const isExpanded = expanded === c.id;
          const pendingSigs = c.signers.filter((s) => s.status === "pending").length;
          const riskClauses = c.clauses.filter((cl) => cl.aiFlag === "risk").length;
          const cautionClauses = c.clauses.filter((cl) => cl.aiFlag === "caution").length;

          return (
            <div key={c.id} className={`rounded-xl border bg-bg-card overflow-hidden ${
              riskClauses > 0 ? "border-accent-red/40" : c.status === "draft" ? "border-accent-amber/30" : "border-bg-border"
            }`}>
              {/* Card header */}
              <button
                onClick={() => setExpanded(isExpanded ? null : c.id)}
                className="w-full text-left"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 p-5">
                  <div className="flex items-start gap-3">
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${sc.bg}`}>
                      <ScrollText className={`h-5 w-5 ${sc.text}`} />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] text-ink-tertiary">{c.id}</span>
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${sc.bg} ${sc.text}`}>
                          {sc.label}
                        </span>
                        {pendingSigs > 0 && (
                          <span className="rounded-md bg-accent-amber/15 px-2 py-0.5 text-[10px] font-semibold text-accent-amber">
                            {pendingSigs} signature{pendingSigs > 1 ? "s" : ""} pending
                          </span>
                        )}
                        {riskClauses > 0 && (
                          <span className="flex items-center gap-1 rounded-md bg-accent-red/15 px-2 py-0.5 text-[10px] font-semibold text-accent-red">
                            <AlertTriangle className="h-2.5 w-2.5" /> {riskClauses} clause{riskClauses > 1 ? "s" : ""} flagged
                          </span>
                        )}
                        {cautionClauses > 0 && riskClauses === 0 && (
                          <span className="flex items-center gap-1 rounded-md bg-accent-amber/15 px-2 py-0.5 text-[10px] font-semibold text-accent-amber">
                            <AlertTriangle className="h-2.5 w-2.5" /> {cautionClauses} needs review
                          </span>
                        )}
                      </div>
                      <div className="mt-1 font-semibold text-sm">{c.title}</div>
                      <div className="text-[11px] text-ink-tertiary">
                        {c.buyer}{c.supplier ? ` ↔ ${c.supplier}` : ""} · Created {c.createdAt}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    {c.value && <div className="text-xl font-bold">{fmt(c.value)}</div>}
                    <div className="text-[11px] text-ink-tertiary">AI risk score <span className={c.aiRiskScore > 50 ? "text-accent-red font-semibold" : c.aiRiskScore > 20 ? "text-accent-amber font-semibold" : "text-accent-green font-semibold"}>{c.aiRiskScore}/100</span></div>
                    <div className="text-[11px] text-ink-tertiary">{c.clauses.length} clauses · {c.signers.length} signers</div>
                  </div>
                </div>
              </button>

              {/* Expanded view */}
              {isExpanded && (
                <div className="border-t border-bg-border bg-bg-panel px-5 py-5 space-y-5">
                  {/* AI summary */}
                  <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-3">
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-brand-200">
                      <Sparkles className="h-3.5 w-3.5" /> AI Contract Analysis
                    </div>
                    <p className="mt-1 text-xs text-ink-secondary">{c.aiSummary}</p>
                  </div>

                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    {/* Signers */}
                    <div>
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">Signatures</div>
                      <div className="space-y-2">
                        {c.signers.map((s) => {
                          const sc = SIG_CONF[s.status];
                          return (
                            <div key={s.email} className="flex items-center gap-3 rounded-lg border border-bg-border bg-bg-card p-3">
                              <sc.icon className={`h-4 w-4 shrink-0 ${sc.color}`} />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold">{s.name}</div>
                                <div className="text-[11px] text-ink-tertiary">{s.role}</div>
                              </div>
                              <div className="text-right">
                                <div className={`text-[10px] font-semibold ${sc.color}`}>{sc.label}</div>
                                {s.signedAt && <div className="text-[10px] text-ink-tertiary">{s.signedAt}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Clauses */}
                    <div>
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">Clauses</div>
                      <div className="space-y-2">
                        {c.clauses.map((cl) => {
                          const fc = cl.aiFlag ? CLAUSE_FLAG[cl.aiFlag] : null;
                          return (
                            <div key={cl.title} className={`rounded-lg border p-3 text-xs ${fc ? `${fc.bg} border-current/20` : "border-bg-border bg-bg-card"}`}>
                              <div className={`flex items-center gap-2 font-semibold ${fc ? fc.text : ""}`}>
                                {cl.aiFlag === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-accent-green" />}
                                {cl.aiFlag === "caution" && <AlertTriangle className="h-3.5 w-3.5 text-accent-amber" />}
                                {cl.aiFlag === "risk" && <AlertTriangle className="h-3.5 w-3.5 text-accent-red" />}
                                {cl.title}
                              </div>
                              <div className="mt-0.5 text-[11px] text-ink-secondary">{cl.summary}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {c.status === "draft" && (
                      <button
                        onClick={() => toast(`Signature reminder sent to ${c.signers.filter((s) => s.status === "pending").map((s) => s.name).join(", ")}`)}
                        className="flex items-center gap-1.5 rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow"
                      >
                        <PenLine className="h-3 w-3" /> Send Signature Reminder
                      </button>
                    )}
                    <button
                      onClick={() => toast(`Contract ${c.id} downloaded as PDF`)}
                      className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-xs hover:bg-bg-hover"
                    >
                      <Download className="h-3 w-3" /> Download PDF
                    </button>
                    {c.txId && (
                      <Link
                        href="/escrow"
                        className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-xs hover:bg-bg-hover"
                      >
                        <Landmark className="h-3 w-3" /> View Escrow
                      </Link>
                    )}
                    <button
                      onClick={() => toast("Opening in DocuSign portal", "info")}
                      className="flex items-center gap-1.5 rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-xs hover:bg-bg-hover"
                    >
                      <ExternalLink className="h-3 w-3" /> DocuSign
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Stack note */}
      <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/20">
            <Bot className="h-5 w-5 text-brand-200" />
          </div>
          <div>
            <div className="text-sm font-semibold text-brand-200">What each contract auto-includes</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
              {[
                "Product specs + SKU",
                "Pricing + payment schedule",
                "Delivery timeline + penalties",
                "Defect + quality thresholds",
                "Escrow release conditions",
                "Milestone-based payments",
                "Dispute resolution terms",
                "IP + exclusivity clauses",
                "AI confidence score",
              ].map((item) => (
                <div key={item} className="flex items-center gap-1.5 text-ink-secondary">
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-accent-green" />
                  {item}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-ink-tertiary">
              Powered by Claude AI · signed via DocuSign · stored on-chain hash for tamper evidence · compliant with UCC + CISG frameworks.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
