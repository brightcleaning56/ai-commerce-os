"use client";
import { ArrowDownToLine, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type RefundsResp = {
  summary: {
    totalRefundCents: number;
    refundedTransactions: number;
    totalTransactions: number;
    refundRatePct: number;
    grossPlatformRevenueCents: number;
    netAfterRefundsCents: number;
  };
  byResolution: {
    refund_buyer: { count: number; cents: number };
    split: { count: number; cents: number };
    other: { count: number; cents: number };
  };
  recent: {
    id: string;
    ts: string;
    transactionId: string;
    buyerCompany: string;
    productName: string;
    amountCents: number;
    reason: string;
  }[];
};

function fmtCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function relTime(iso: string): string {
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

export default function RefundsPanel() {
  const [data, setData] = useState<RefundsResp | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch("/api/earnings/refunds", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d) setData(d);
        })
        .catch(() => {});
    }
    load();
    const id = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!data) return null;

  const { summary, byResolution, recent } = data;
  const hasRefunds = summary.totalRefundCents > 0;

  // Quiet "all clear" panel when there are no refunds yet — gives operators
  // positive feedback that the deal flow is healthy.
  if (!hasRefunds && summary.totalTransactions === 0) {
    // No transactions at all — let other empty states cover the case
    return null;
  }

  if (!hasRefunds) {
    return (
      <div className="rounded-xl border border-accent-green/30 bg-accent-green/5 px-5 py-4">
        <div className="flex items-center gap-3 text-xs">
          <ShieldCheck className="h-4 w-4 shrink-0 text-accent-green" />
          <div className="flex-1">
            <span className="font-semibold text-accent-green">No refunds yet</span>{" "}
            <span className="text-ink-secondary">
              — {summary.totalTransactions} transaction{summary.totalTransactions === 1 ? "" : "s"} settled cleanly. Refund rate 0%.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bg-border px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ArrowDownToLine className="h-4 w-4 text-accent-amber" /> Refund Attribution
        </div>
        <Link
          href="/transactions?filter=refunded"
          className="text-[11px] text-brand-300 hover:text-brand-200"
        >
          View all refunded →
        </Link>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <Stat
          label="Total Refunded"
          value={fmtCents(summary.totalRefundCents)}
          sub={`${summary.refundedTransactions} of ${summary.totalTransactions} transaction${summary.totalTransactions === 1 ? "" : "s"}`}
          tone="amber"
        />
        <Stat
          label="Refund Rate"
          value={`${summary.refundRatePct.toFixed(1)}%`}
          sub={summary.refundRatePct >= 5
            ? "Above 5% — investigate trends"
            : summary.refundRatePct >= 2
            ? "Healthy industry baseline"
            : "Excellent — well below avg"}
          tone={summary.refundRatePct >= 5 ? "red" : summary.refundRatePct >= 2 ? "amber" : "green"}
        />
        <Stat
          label="Net After Refunds"
          value={fmtCents(summary.netAfterRefundsCents)}
          sub={`Gross ${fmtCents(summary.grossPlatformRevenueCents)}`}
          tone="green"
        />
        <Stat
          label="Refund Volume vs Revenue"
          value={
            summary.grossPlatformRevenueCents > 0
              ? `${((summary.totalRefundCents / summary.grossPlatformRevenueCents) * 100).toFixed(1)}%`
              : "—"
          }
          sub="Refunds as % of platform revenue"
          tone="default"
        />
      </div>

      {/* Resolution breakdown */}
      <div className="border-t border-bg-border px-5 py-4">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
          By dispute resolution
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <ResolutionRow
            label="Full refund to buyer"
            count={byResolution.refund_buyer.count}
            cents={byResolution.refund_buyer.cents}
          />
          <ResolutionRow
            label="50/50 split"
            count={byResolution.split.count}
            cents={byResolution.split.cents}
          />
          <ResolutionRow
            label="Other"
            count={byResolution.other.count}
            cents={byResolution.other.cents}
          />
        </div>
      </div>

      {/* Recent refunds list */}
      {recent.length > 0 && (
        <div className="border-t border-bg-border">
          <div className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
            Recent refunds
          </div>
          <ul className="divide-y divide-bg-border">
            {recent.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 px-5 py-2.5 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.buyerCompany}</span>
                    <span className="text-ink-tertiary">·</span>
                    <span className="truncate text-ink-secondary">{r.productName}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-ink-tertiary">
                    {r.reason}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-accent-amber">{fmtCents(r.amountCents)}</div>
                  <div className="text-[10px] text-ink-tertiary">{relTime(r.ts)}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "default" | "amber" | "red" | "green";
}) {
  const cls =
    tone === "amber" ? "text-accent-amber" :
    tone === "red" ? "text-accent-red" :
    tone === "green" ? "text-accent-green" : "";
  return (
    <div className="rounded-lg border border-bg-border bg-bg-hover/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className={`mt-1 text-xl font-bold ${cls}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-ink-tertiary">{sub}</div>
    </div>
  );
}

function ResolutionRow({ label, count, cents }: { label: string; count: number; cents: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-bg-border bg-bg-hover/30 px-3 py-2">
      <div>
        <div className="text-[11px] font-medium">{label}</div>
        <div className="text-[10px] text-ink-tertiary">{count} refund{count === 1 ? "" : "s"}</div>
      </div>
      <div className="text-sm font-semibold">{count > 0 ? fmtCents(cents) : "—"}</div>
    </div>
  );
}
