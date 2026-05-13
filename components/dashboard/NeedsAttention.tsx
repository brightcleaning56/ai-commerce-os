"use client";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  Flame,
  Inbox,
  Mail,
  MessageSquare,
  Package,
  ShieldAlert,
  Smartphone,
  Truck,
  Voicemail,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type AttentionType =
  | "draft_approval"
  | "shipment_due"
  | "delivered_release"
  | "dispute_closing"
  | "dispute_open"
  | "risk_flag"
  | "supplier_disconnect"
  | "lead_ai_stuck"
  | "lead_hot_unhandled"
  | "inbound_reply"
  | "lead_sms_reply"
  | "voicemail_pending";

type Item = {
  type: AttentionType;
  count: number;
  urgency: "high" | "medium" | "low";
  label: string;
  detail: string;
  href: string;
  cta: string;
};

type Resp = {
  items: Item[];
  counts: { total: number; high: number; medium: number; low: number };
};

const ICON: Record<AttentionType, React.ComponentType<{ className?: string }>> = {
  draft_approval: Mail,
  shipment_due: Package,
  delivered_release: Truck,
  dispute_closing: Clock,
  dispute_open: AlertTriangle,
  risk_flag: ShieldAlert,
  supplier_disconnect: CreditCard,
  lead_ai_stuck: Inbox,
  lead_hot_unhandled: Flame,
  inbound_reply: MessageSquare,
  lead_sms_reply: Smartphone,
  voicemail_pending: Voicemail,
};

const URGENCY_TONE: Record<Item["urgency"], { ring: string; bg: string; iconBg: string; iconText: string; cta: string }> = {
  high: {
    ring: "border-accent-red/40",
    bg: "bg-accent-red/5",
    iconBg: "bg-accent-red/15",
    iconText: "text-accent-red",
    cta: "bg-gradient-brand text-white",
  },
  medium: {
    ring: "border-accent-amber/30",
    bg: "bg-accent-amber/5",
    iconBg: "bg-accent-amber/15",
    iconText: "text-accent-amber",
    cta: "bg-gradient-brand text-white",
  },
  low: {
    ring: "border-bg-border",
    bg: "bg-bg-card",
    iconBg: "bg-brand-500/15",
    iconText: "text-brand-200",
    cta: "border border-bg-border bg-bg-hover/40 hover:bg-bg-hover",
  },
};

export default function NeedsAttention() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch("/api/dashboard/attention", { cache: "no-store" })
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

  // All clear — render a quiet success card so operators get positive feedback
  if (data.items.length === 0) {
    return (
      <div className="rounded-xl border border-accent-green/30 bg-accent-green/5 px-5 py-3">
        <div className="flex items-center gap-3 text-xs">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-accent-green" />
          <div className="flex-1">
            <span className="font-semibold text-accent-green">Inbox zero</span>{" "}
            <span className="text-ink-secondary">— no drafts to approve, no transactions waiting on you, no risk flags. Take a breath.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card">
      <div className="flex items-center justify-between border-b border-bg-border px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 text-accent-amber" /> Needs your attention
        </div>
        <div className="flex items-center gap-2 text-[11px] text-ink-tertiary">
          {data.counts.high > 0 && (
            <span className="flex items-center gap-1 rounded-md bg-accent-red/15 px-2 py-0.5 font-semibold text-accent-red">
              {data.counts.high} urgent
            </span>
          )}
          {data.counts.medium > 0 && (
            <span className="flex items-center gap-1 rounded-md bg-accent-amber/15 px-2 py-0.5 font-semibold text-accent-amber">
              {data.counts.medium} medium
            </span>
          )}
          {data.counts.low > 0 && (
            <span className="flex items-center gap-1 rounded-md bg-bg-hover px-2 py-0.5 font-semibold text-ink-secondary">
              {data.counts.low} low
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.items.map((item) => {
          const Icon = ICON[item.type];
          const tone = URGENCY_TONE[item.urgency];
          return (
            <div
              key={item.type}
              className={`flex items-start gap-3 rounded-lg border ${tone.ring} ${tone.bg} p-3`}
            >
              <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${tone.iconBg}`}>
                <Icon className={`h-4 w-4 ${tone.iconText}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold leading-tight">{item.label}</div>
                <div className="mt-0.5 text-[11px] text-ink-secondary">{item.detail}</div>
                <Link
                  href={item.href}
                  className={`mt-2 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold ${tone.cta}`}
                >
                  {item.cta} <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
