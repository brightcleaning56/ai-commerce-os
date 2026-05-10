"use client";
import { CheckCircle2, Plug, Plus, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { useLocalSet } from "@/lib/useLocalSet";

type Integration = {
  id: string;
  name: string;
  emoji: string;
  category: "Email" | "CRM" | "Comms" | "Commerce" | "Finance" | "Productivity";
  description: string;
  /** True only for integrations actually wired in this codebase. */
  isLive?: boolean;
  popular?: boolean;
};

// Catalog of integrations. Only `isLive: true` entries are actually wired
// (Stripe Connect for payouts, Postmark/Resend transport for outbound email).
// Everything else is roadmap — the "Connect" toggle below saves to
// localStorage for visual preview only and does not perform OAuth.
const INTEGRATIONS: Integration[] = [
  { id: "smtp", name: "Postmark / Resend (outbound)", emoji: "✉️", category: "Email", description: "Lifecycle email transport — already wired via lib/email.ts (Postmark, Resend, or simulated fallback).", isLive: true, popular: true },
  { id: "gmail", name: "Gmail", emoji: "📧", category: "Email", description: "Send + sync outbound from your Gmail account", popular: true },
  { id: "outlook", name: "Microsoft 365 Outlook", emoji: "🅰️", category: "Email", description: "Send + sync outbound from Microsoft 365", popular: true },

  { id: "hubspot", name: "HubSpot", emoji: "🟧", category: "CRM", description: "2-way sync with HubSpot deals + contacts", popular: true },
  { id: "salesforce", name: "Salesforce", emoji: "☁️", category: "CRM", description: "Bidirectional sync with Salesforce CRM", popular: true },
  { id: "pipedrive", name: "Pipedrive", emoji: "🐱", category: "CRM", description: "Sync deals + activities" },
  { id: "close", name: "Close", emoji: "🔚", category: "CRM", description: "Sync to Close CRM" },

  { id: "slack", name: "Slack", emoji: "💼", category: "Comms", description: "Notifications + approval queues in Slack", popular: true },
  { id: "teams", name: "Microsoft Teams", emoji: "🟦", category: "Comms", description: "Notifications + commands" },
  { id: "twilio", name: "Twilio (SMS + Voice)", emoji: "💬", category: "Comms", description: "Outbound SMS + voice via Twilio" },
  { id: "calendly", name: "Calendly", emoji: "📅", category: "Comms", description: "Auto-book meetings on reply" },
  { id: "cal", name: "Cal.com", emoji: "🗓️", category: "Comms", description: "Open-source meeting scheduling" },

  { id: "shopify", name: "Shopify", emoji: "🛍️", category: "Commerce", description: "Pull product catalog + push orders", popular: true },
  { id: "woo", name: "WooCommerce", emoji: "🛒", category: "Commerce", description: "WooCommerce store sync" },
  { id: "amazon", name: "Amazon Seller Central", emoji: "📦", category: "Commerce", description: "FBA listings + order pull" },
  { id: "tiktok", name: "TikTok Shop", emoji: "🎵", category: "Commerce", description: "Catalog + order sync" },

  { id: "stripe", name: "Stripe Connect", emoji: "💳", category: "Finance", description: "Destination charges to supplier accounts · escrow + auto-release — already wired via /api/transactions.", isLive: true, popular: true },
  { id: "qb", name: "QuickBooks", emoji: "📚", category: "Finance", description: "Auto-create invoices on close" },
  { id: "xero", name: "Xero", emoji: "🟢", category: "Finance", description: "Auto-create invoices on close" },
  { id: "plaid", name: "Plaid", emoji: "🏦", category: "Finance", description: "Bank verification for buyers" },

  { id: "zapier", name: "Zapier", emoji: "⚡", category: "Productivity", description: "Connect to 5,000+ apps via Zapier", popular: true },
  { id: "make", name: "Make.com", emoji: "🟪", category: "Productivity", description: "Visual workflow automation" },
  { id: "n8n", name: "n8n", emoji: "🟧", category: "Productivity", description: "Self-hosted workflow automation" },
  { id: "notion", name: "Notion", emoji: "📓", category: "Productivity", description: "Sync deal notes + reports to Notion" },
];

const CATS = ["All", "Email", "CRM", "Comms", "Commerce", "Finance", "Productivity"] as const;

export default function IntegrationsPage() {
  const [cat, setCat] = useState<(typeof CATS)[number]>("All");
  const [query, setQuery] = useState("");
  const [connectedOnly, setConnectedOnly] = useState(false);
  const conn = useLocalSet("aicos:connected-integrations:v1");
  const { toast } = useToast();

  // Live integrations are always on (Stripe + email transport are wired in code).
  // Everything else toggles a localStorage preview state.
  const isConnected = (i: Integration) => {
    if (i.isLive) return true;
    return conn.hydrated ? conn.has(i.id) : false;
  };

  function handleToggle(i: Integration) {
    if (i.isLive) {
      toast(`${i.name} is wired in code — toggle not applicable`, "info");
      return;
    }
    const wasConnected = conn.has(i.id);
    conn.toggle(i.id);
    toast(wasConnected ? `Disconnected ${i.name} (preview only)` : `Connected ${i.name} (preview only — no OAuth)`);
  }

  const filtered = useMemo(() => {
    return INTEGRATIONS.filter((i) => {
      if (cat !== "All" && i.category !== cat) return false;
      if (query && !i.name.toLowerCase().includes(query.toLowerCase()) &&
        !i.description.toLowerCase().includes(query.toLowerCase())) return false;
      if (connectedOnly && !isConnected(i)) return false;
      return true;
    });
  }, [cat, query, connectedOnly, conn.items, conn.hydrated]);

  const connectedCount = INTEGRATIONS.filter((i) => isConnected(i)).length;
  const liveCount = INTEGRATIONS.filter((i) => i.isLive).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Plug className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Integrations</h1>
            <p className="text-xs text-ink-secondary">
              {liveCount} wired live · {connectedCount - liveCount} preview-only · catalog of {INTEGRATIONS.length} across {CATS.length - 1} categories
            </p>
          </div>
        </div>
        <button className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm">
          <Plus className="h-4 w-4" /> Request integration
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-accent-amber/30 bg-accent-amber/5 p-3 text-xs">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-amber/15">
          <Sparkles className="h-3.5 w-3.5 text-accent-amber" />
        </div>
        <div className="flex-1 text-ink-secondary">
          <span className="font-semibold text-accent-amber">Integration catalog</span>
          {" "}— Only the two cards marked{" "}
          <span className="rounded bg-accent-green/15 px-1 py-0.5 text-[10px] font-semibold text-accent-green">LIVE</span>
          {" "}are actually wired today (Stripe Connect for payouts and Postmark/Resend transport for outbound email). Toggling Connect on the rest saves to localStorage for visual preview only — there&apos;s no OAuth flow behind them yet.
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search integrations…"
            className="h-9 w-full rounded-lg border border-bg-border bg-bg-card pl-9 pr-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-bg-border bg-bg-card p-1 text-xs">
          {CATS.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`rounded-md px-2.5 py-1 ${
                cat === c
                  ? "bg-brand-500/15 text-brand-200"
                  : "text-ink-secondary hover:bg-bg-hover"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-xs">
          <input
            type="checkbox"
            checked={connectedOnly}
            onChange={(e) => setConnectedOnly(e.target.checked)}
            className="h-3.5 w-3.5 accent-brand-500"
          />
          Connected only
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((i) => (
          <div
            key={i.id}
            className="rounded-xl border border-bg-border bg-bg-card p-4 transition hover:border-brand-500/40"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-gradient-card text-2xl">
                  {i.emoji}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold">{i.name}</span>
                    {i.popular && (
                      <span className="rounded-md bg-bg-hover/60 px-1.5 py-0.5 text-[10px] text-ink-secondary">
                        Popular
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-ink-tertiary">{i.category}</div>
                </div>
              </div>
              {i.isLive ? (
                <span className="flex items-center gap-1 rounded-md bg-accent-green/15 px-2 py-0.5 text-[10px] font-semibold text-accent-green">
                  <CheckCircle2 className="h-3 w-3" /> Live
                </span>
              ) : isConnected(i) ? (
                <span className="rounded-md bg-bg-hover px-2 py-0.5 text-[10px] font-semibold text-ink-tertiary">
                  Preview
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-ink-secondary">{i.description}</p>
            <button
              onClick={() => handleToggle(i)}
              disabled={i.isLive}
              title={i.isLive ? "Wired in code — always on" : undefined}
              className={`mt-4 w-full rounded-md py-2 text-xs font-semibold ${
                i.isLive
                  ? "border border-accent-green/30 bg-accent-green/10 text-accent-green opacity-80 cursor-default"
                  : isConnected(i)
                    ? "border border-bg-border bg-bg-hover/40 hover:bg-bg-hover"
                    : "bg-gradient-brand shadow-glow"
              }`}
            >
              {i.isLive ? "Always on" : isConnected(i) ? "Disconnect (preview)" : "Connect (preview)"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
