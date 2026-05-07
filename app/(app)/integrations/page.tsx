"use client";
import { CheckCircle2, Plug, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { useLocalSet } from "@/lib/useLocalSet";

type Integration = {
  id: string;
  name: string;
  emoji: string;
  category: "Email" | "CRM" | "Comms" | "Commerce" | "Finance" | "Productivity";
  description: string;
  connected: boolean;
  popular?: boolean;
};

const INTEGRATIONS: Integration[] = [
  { id: "gmail", name: "Gmail", emoji: "📧", category: "Email", description: "Send + sync outbound from your Gmail account", connected: true, popular: true },
  { id: "outlook", name: "Microsoft 365 Outlook", emoji: "🅰️", category: "Email", description: "Send + sync outbound from Microsoft 365", connected: true, popular: true },
  { id: "smtp", name: "Custom SMTP / Postmark", emoji: "✉️", category: "Email", description: "Bring your own outbound infra", connected: false },

  { id: "hubspot", name: "HubSpot", emoji: "🟧", category: "CRM", description: "2-way sync with HubSpot deals + contacts", connected: true, popular: true },
  { id: "salesforce", name: "Salesforce", emoji: "☁️", category: "CRM", description: "Bidirectional sync with Salesforce CRM", connected: false, popular: true },
  { id: "pipedrive", name: "Pipedrive", emoji: "🐱", category: "CRM", description: "Sync deals + activities", connected: false },
  { id: "close", name: "Close", emoji: "🔚", category: "CRM", description: "Sync to Close CRM", connected: false },

  { id: "slack", name: "Slack", emoji: "💼", category: "Comms", description: "Notifications + approval queues in Slack", connected: true, popular: true },
  { id: "teams", name: "Microsoft Teams", emoji: "🟦", category: "Comms", description: "Notifications + commands", connected: false },
  { id: "twilio", name: "Twilio (SMS + Voice)", emoji: "💬", category: "Comms", description: "Outbound SMS + voice via Twilio", connected: true },
  { id: "calendly", name: "Calendly", emoji: "📅", category: "Comms", description: "Auto-book meetings on reply", connected: true },
  { id: "cal", name: "Cal.com", emoji: "🗓️", category: "Comms", description: "Open-source meeting scheduling", connected: false },

  { id: "shopify", name: "Shopify", emoji: "🛍️", category: "Commerce", description: "Pull product catalog + push orders", connected: true, popular: true },
  { id: "woo", name: "WooCommerce", emoji: "🛒", category: "Commerce", description: "WooCommerce store sync", connected: false },
  { id: "amazon", name: "Amazon Seller Central", emoji: "📦", category: "Commerce", description: "FBA listings + order pull", connected: false },
  { id: "tiktok", name: "TikTok Shop", emoji: "🎵", category: "Commerce", description: "Catalog + order sync", connected: false },

  { id: "stripe", name: "Stripe", emoji: "💳", category: "Finance", description: "Charge + payout · escrow released to bank", connected: true, popular: true },
  { id: "qb", name: "QuickBooks", emoji: "📚", category: "Finance", description: "Auto-create invoices on close", connected: true },
  { id: "xero", name: "Xero", emoji: "🟢", category: "Finance", description: "Auto-create invoices on close", connected: false },
  { id: "plaid", name: "Plaid", emoji: "🏦", category: "Finance", description: "Bank verification for buyers", connected: false },

  { id: "zapier", name: "Zapier", emoji: "⚡", category: "Productivity", description: "Connect to 5,000+ apps via Zapier", connected: false, popular: true },
  { id: "make", name: "Make.com", emoji: "🟪", category: "Productivity", description: "Visual workflow automation", connected: false },
  { id: "n8n", name: "n8n", emoji: "🟧", category: "Productivity", description: "Self-hosted workflow automation", connected: false },
  { id: "notion", name: "Notion", emoji: "📓", category: "Productivity", description: "Sync deal notes + reports to Notion", connected: false },
];

const CATS = ["All", "Email", "CRM", "Comms", "Commerce", "Finance", "Productivity"] as const;

export default function IntegrationsPage() {
  const [cat, setCat] = useState<(typeof CATS)[number]>("All");
  const [query, setQuery] = useState("");
  const [connectedOnly, setConnectedOnly] = useState(false);
  const conn = useLocalSet("aicos:connected-integrations:v1");
  const { toast } = useToast();

  // Seed with default-connected integrations on first ever visit
  useEffect(() => {
    if (!conn.hydrated) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem("aicos:connected-integrations:v1:seeded")) return;
    const seed = INTEGRATIONS.filter((i) => i.connected).map((i) => i.id);
    seed.forEach((id) => conn.add(id));
    try {
      localStorage.setItem("aicos:connected-integrations:v1:seeded", "1");
    } catch {}
  }, [conn.hydrated, conn]);

  const isConnected = (i: Integration) =>
    conn.hydrated ? conn.has(i.id) : i.connected;

  function handleToggle(i: Integration) {
    const wasConnected = isConnected(i);
    conn.toggle(i.id);
    toast(wasConnected ? `Disconnected ${i.name}` : `Connected ${i.name}`);
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
              {connectedCount} of {INTEGRATIONS.length} connected · across {CATS.length - 1} categories
            </p>
          </div>
        </div>
        <button className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm">
          <Plus className="h-4 w-4" /> Request integration
        </button>
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
              {isConnected(i) && (
                <span className="flex items-center gap-1 rounded-md bg-accent-green/15 px-2 py-0.5 text-[10px] font-semibold text-accent-green">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </span>
              )}
            </div>
            <p className="mt-3 text-xs text-ink-secondary">{i.description}</p>
            <button
              onClick={() => handleToggle(i)}
              className={`mt-4 w-full rounded-md py-2 text-xs font-semibold ${
                isConnected(i)
                  ? "border border-bg-border bg-bg-hover/40 hover:bg-bg-hover"
                  : "bg-gradient-brand shadow-glow"
              }`}
            >
              {isConnected(i) ? "Disconnect" : "Connect"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
