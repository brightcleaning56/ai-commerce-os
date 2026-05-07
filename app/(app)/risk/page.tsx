"use client";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Lock,
  Mail,
  Package,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

type Severity = "Critical" | "High" | "Medium" | "Low";
type Category =
  | "Supplier Fraud"
  | "Buyer Fraud"
  | "Trademark"
  | "Restricted Product"
  | "Payment"
  | "Compliance";

type RiskItem = {
  id: string;
  title: string;
  detail: string;
  category: Category;
  severity: Severity;
  source: string;
  ago: string;
  recommended: string;
};

const RISKS: RiskItem[] = [
  {
    id: "r1",
    title: "Shenzhen Unitop Tech flagged as high-risk supplier",
    detail: "Negative review burst (-32 reviews in 14d) and recently re-registered domain.",
    category: "Supplier Fraud",
    severity: "Critical",
    source: "Risk Agent",
    ago: "2m ago",
    recommended: "Pause outreach. Require sample order with escrow before any volume order.",
  },
  {
    id: "r2",
    title: '"FlexiGlow" may infringe existing trademark',
    detail: 'USPTO filing 97/422,118 for "FlexiGlow Pro" registered to a different LLC.',
    category: "Trademark",
    severity: "High",
    source: "Risk Agent",
    ago: "1h ago",
    recommended: "Rebrand the SKU before publishing or pivot to alternate brand variants.",
  },
  {
    id: "r3",
    title: "Buyer 'BrightHome Living' has chargeback history",
    detail: "Open Stripe disputes in last 90 days; D&B credit risk score 71/100.",
    category: "Buyer Fraud",
    severity: "High",
    source: "Risk Agent",
    ago: "4h ago",
    recommended: "Require deposit + ACH only. No net terms until 2 paid invoices clear.",
  },
  {
    id: "r4",
    title: "Massage Gun listing borders on FDA medical device claim",
    detail: 'Description includes "treats chronic pain" — flagged as unapproved claim.',
    category: "Compliance",
    severity: "Medium",
    source: "Risk Agent",
    ago: "Yesterday",
    recommended: "Soften copy to wellness/recovery language. Remove medical terminology.",
  },
  {
    id: "r5",
    title: "Restricted product: Magnetic Eyelashes in EU markets",
    detail: "Some EU member states require notification under cosmetic regulation EC 1223/2009.",
    category: "Restricted Product",
    severity: "Medium",
    source: "Risk Agent",
    ago: "Yesterday",
    recommended: "Geo-block EU outreach until CPNP notification is filed.",
  },
  {
    id: "r6",
    title: "Stripe payout pending review on $24,500 wire",
    detail: "Large first-time payout from new buyer triggered hold.",
    category: "Payment",
    severity: "High",
    source: "Stripe",
    ago: "5h ago",
    recommended: "Submit invoice + PO to Stripe support to clear hold within 48h.",
  },
  {
    id: "r7",
    title: "Outreach reply rate spike on 'BeautyTrend' contact list",
    detail: "Replies marked 'spam' jumped 4.8% — domain reputation at risk.",
    category: "Compliance",
    severity: "Medium",
    source: "Postmark",
    ago: "2 days ago",
    recommended: "Pause that segment. Re-warm domain with a smaller verified list.",
  },
  {
    id: "r8",
    title: "Supplier 'Dropship USA Net' unverified for 21 days",
    detail: "Verification documents requested but not returned. Capacity claims unconfirmed.",
    category: "Supplier Fraud",
    severity: "Low",
    source: "Risk Agent",
    ago: "3 days ago",
    recommended: "Move to backup supplier list until verification arrives.",
  },
];

const SEV_TONE: Record<Severity, { bg: string; text: string; bar: string }> = {
  Critical: { bg: "bg-accent-red/15", text: "text-accent-red", bar: "bg-accent-red" },
  High: { bg: "bg-accent-amber/15", text: "text-accent-amber", bar: "bg-accent-amber" },
  Medium: { bg: "bg-accent-blue/15", text: "text-accent-blue", bar: "bg-accent-blue" },
  Low: { bg: "bg-bg-hover", text: "text-ink-secondary", bar: "bg-ink-tertiary" },
};

const CAT_ICON: Record<Category, React.ComponentType<{ className?: string }>> = {
  "Supplier Fraud": Building2,
  "Buyer Fraud": Users,
  Trademark: Scale,
  "Restricted Product": Package,
  Payment: CreditCard,
  Compliance: Mail,
};

const CATEGORIES: Category[] = [
  "Supplier Fraud",
  "Buyer Fraud",
  "Trademark",
  "Restricted Product",
  "Payment",
  "Compliance",
];

type RiskAction = "applied" | "dismissed" | "snoozed";

export default function RiskPage() {
  const [filterSev, setFilterSev] = useState<Severity | "All">("All");
  const [filterCat, setFilterCat] = useState<Category | "All">("All");
  const [actions, setActions] = useState<Record<string, RiskAction>>({});
  const [showResolved, setShowResolved] = useState(false);
  const { toast } = useToast();

  // Hydrate actions from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("aicos:risk-actions:v1");
      if (raw) setActions(JSON.parse(raw));
    } catch {}
  }, []);

  function persist(next: Record<string, RiskAction>) {
    setActions(next);
    try {
      localStorage.setItem("aicos:risk-actions:v1", JSON.stringify(next));
    } catch {}
  }

  function handleApply(id: string, title: string) {
    persist({ ...actions, [id]: "applied" });
    toast(`Action applied · "${title}"`);
  }
  function handleDismiss(id: string, title: string) {
    persist({ ...actions, [id]: "dismissed" });
    toast(`Dismissed · "${title}"`);
  }
  function handleSnooze(id: string, title: string) {
    persist({ ...actions, [id]: "snoozed" });
    toast(`Snoozed 7 days · "${title}"`);
  }

  const filtered = RISKS.filter(
    (r) =>
      (filterSev === "All" || r.severity === filterSev) &&
      (filterCat === "All" || r.category === filterCat) &&
      (showResolved || !actions[r.id])
  );

  const counts = {
    Critical: RISKS.filter((r) => r.severity === "Critical").length,
    High: RISKS.filter((r) => r.severity === "High").length,
    Medium: RISKS.filter((r) => r.severity === "Medium").length,
    Low: RISKS.filter((r) => r.severity === "Low").length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Risk Center</h1>
            <p className="text-xs text-ink-secondary">
              {RISKS.length} open issues across {CATEGORIES.length} categories · scanned 24/7
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-xs">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
              className="h-3.5 w-3.5 accent-brand-500"
            />
            Show resolved ({Object.keys(actions).length})
          </label>
          <button className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover">
            <Lock className="h-4 w-4" /> Compliance Settings
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["Critical", "High", "Medium", "Low"] as Severity[]).map((s) => {
          const tone = SEV_TONE[s];
          return (
            <button
              key={s}
              onClick={() => setFilterSev(filterSev === s ? "All" : s)}
              className={`rounded-xl border bg-bg-card p-4 text-left transition ${
                filterSev === s ? "border-brand-500/60" : "border-bg-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`grid h-8 w-8 place-items-center rounded-lg ${tone.bg}`}>
                  <AlertTriangle className={`h-4 w-4 ${tone.text}`} />
                </div>
                <span className={`text-[10px] uppercase tracking-wider ${tone.text}`}>{s}</span>
              </div>
              <div className="mt-3 text-2xl font-bold">{counts[s]}</div>
              <div className="text-[11px] text-ink-tertiary">open</div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-2 rounded-xl border border-bg-border bg-bg-card p-4">
          <div className="text-sm font-semibold">Categories</div>
          <button
            onClick={() => setFilterCat("All")}
            className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs ${
              filterCat === "All" ? "bg-brand-500/15 text-brand-200" : "text-ink-secondary hover:bg-bg-hover"
            }`}
          >
            <span>All categories</span>
            <span className="text-ink-tertiary">{RISKS.length}</span>
          </button>
          {CATEGORIES.map((c) => {
            const Icon = CAT_ICON[c];
            const n = RISKS.filter((r) => r.category === c).length;
            return (
              <button
                key={c}
                onClick={() => setFilterCat(filterCat === c ? "All" : c)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs ${
                  filterCat === c
                    ? "bg-brand-500/15 text-brand-200"
                    : "text-ink-secondary hover:bg-bg-hover"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5" />
                  {c}
                </span>
                <span className="text-ink-tertiary">{n}</span>
              </button>
            );
          })}
        </aside>

        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-bg-border bg-bg-card p-10 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-accent-green" />
              <div className="mt-2 text-sm font-medium">No risks in this slice</div>
              <div className="text-xs text-ink-tertiary">Looking good — nothing flagged.</div>
            </div>
          ) : (
            filtered.map((r) => {
              const tone = SEV_TONE[r.severity];
              const Icon = CAT_ICON[r.category];
              return (
                <div
                  key={r.id}
                  className="rounded-xl border border-bg-border bg-bg-card p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone.bg}`}>
                      <Icon className={`h-4 w-4 ${tone.text}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${tone.bg} ${tone.text}`}>
                          {r.severity}
                        </span>
                        <span className="rounded-md bg-bg-hover/60 px-2 py-0.5 text-[10px] text-ink-secondary">
                          {r.category}
                        </span>
                        <span className="text-[11px] text-ink-tertiary">
                          {r.source} · {r.ago}
                        </span>
                      </div>
                      <div className="mt-1.5 text-sm font-semibold">{r.title}</div>
                      <p className="mt-1 text-xs text-ink-secondary">{r.detail}</p>

                      <div className="mt-3 rounded-lg border border-brand-500/30 bg-brand-500/5 p-3">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-200">
                          <Sparkles className="h-3 w-3" /> Recommended Action
                        </div>
                        <p className="mt-0.5 text-xs text-ink-secondary">{r.recommended}</p>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {actions[r.id] ? (
                          <span
                            className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold ${
                              actions[r.id] === "applied"
                                ? "bg-accent-green/15 text-accent-green"
                                : actions[r.id] === "snoozed"
                                ? "bg-accent-amber/15 text-accent-amber"
                                : "bg-bg-hover text-ink-tertiary"
                            }`}
                          >
                            {actions[r.id] === "applied" && <CheckCircle2 className="h-3 w-3" />}
                            {actions[r.id] === "snoozed" && <Clock className="h-3 w-3" />}
                            {actions[r.id] === "dismissed" && <X className="h-3 w-3" />}
                            {actions[r.id]}
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => handleApply(r.id, r.title)}
                              className="rounded-md bg-gradient-brand px-3 py-1.5 text-xs font-semibold shadow-glow"
                            >
                              Apply Action
                            </button>
                            <button
                              onClick={() => handleDismiss(r.id, r.title)}
                              className="rounded-md border border-bg-border bg-bg-hover/40 px-3 py-1.5 text-xs text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
                            >
                              Dismiss
                            </button>
                            <button
                              onClick={() => handleSnooze(r.id, r.title)}
                              className="rounded-md border border-bg-border bg-bg-hover/40 px-3 py-1.5 text-xs text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
                            >
                              Snooze 7d
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
