"use client";
import {
  Bot,
  ChevronRight,
  Download,
  Filter,
  Hash,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { downloadCSV } from "@/lib/csv";

type Actor = { type: "human" | "agent" | "system"; name: string; initials: string };

type AuditEvent = {
  id: string;
  ts: string;
  actor: Actor;
  action: string;
  resource: string;
  resourceId: string;
  category: "Auth" | "Data" | "Permissions" | "Billing" | "Agent" | "Outreach";
  ipAddress?: string;
  diff?: { field: string; from: string; to: string }[];
  hash: string;
};

const EVENTS: AuditEvent[] = [
  {
    id: "e1",
    ts: "2024-05-19 14:42:18 UTC",
    actor: { type: "human", name: "John Smith", initials: "JS" },
    action: "Updated commission rate for plan 'Growth'",
    resource: "Plan",
    resourceId: "plan_growth",
    category: "Billing",
    ipAddress: "192.0.2.142",
    diff: [{ field: "commissionRate", from: "0.05", to: "0.04" }],
    hash: "0x9c4e2a8b",
  },
  {
    id: "e2",
    ts: "2024-05-19 14:38:02 UTC",
    actor: { type: "agent", name: "Risk Agent", initials: "RA" },
    action: "Auto-paused supplier due to risk score increase",
    resource: "Supplier",
    resourceId: "s14",
    category: "Agent",
    diff: [
      { field: "status", from: "Active", to: "Paused" },
      { field: "riskScore", from: "42", to: "71" },
    ],
    hash: "0x5b219f0c",
  },
  {
    id: "e3",
    ts: "2024-05-19 14:21:55 UTC",
    actor: { type: "human", name: "Sarah Chen", initials: "SC" },
    action: "Granted 'Operator' role to new member",
    resource: "User",
    resourceId: "u7 (lena.m@external-vendor.com)",
    category: "Permissions",
    ipAddress: "192.0.2.45",
    diff: [{ field: "role", from: "(invited)", to: "Operator" }],
    hash: "0xa3f81d4e",
  },
  {
    id: "e4",
    ts: "2024-05-19 14:18:11 UTC",
    actor: { type: "agent", name: "Outreach Agent", initials: "OA" },
    action: "Sent personalized email to 156 buyers",
    resource: "Campaign",
    resourceId: "c1 (Summer Fitness Products)",
    category: "Outreach",
    hash: "0xd8124a93",
  },
  {
    id: "e5",
    ts: "2024-05-19 13:54:08 UTC",
    actor: { type: "human", name: "John Smith", initials: "JS" },
    action: "Rotated production API key 'sk_live_4f29'",
    resource: "API Key",
    resourceId: "k1",
    category: "Auth",
    ipAddress: "192.0.2.142",
    hash: "0x71e2b410",
  },
  {
    id: "e6",
    ts: "2024-05-19 13:42:31 UTC",
    actor: { type: "system", name: "Stripe Webhook", initials: "SW" },
    action: "Auto-released $24,500 from escrow",
    resource: "Order",
    resourceId: "o3",
    category: "Billing",
    diff: [{ field: "escrowStatus", from: "Delivered", to: "Released" }],
    hash: "0x3c9077e1",
  },
  {
    id: "e7",
    ts: "2024-05-19 13:18:17 UTC",
    actor: { type: "human", name: "Marcus Brooks", initials: "MB" },
    action: "Approved buyer outreach for FitLife Stores",
    resource: "Outreach Approval",
    resourceId: "ap-9912",
    category: "Outreach",
    ipAddress: "192.0.2.88",
    hash: "0x82910f4a",
  },
  {
    id: "e8",
    ts: "2024-05-19 12:01:03 UTC",
    actor: { type: "human", name: "John Smith", initials: "JS" },
    action: "Enabled SCIM provisioning",
    resource: "Workspace",
    resourceId: "ws_acmebrand",
    category: "Permissions",
    ipAddress: "192.0.2.142",
    diff: [{ field: "scimEnabled", from: "false", to: "true" }],
    hash: "0xe44d2901",
  },
  {
    id: "e9",
    ts: "2024-05-19 11:42:50 UTC",
    actor: { type: "agent", name: "Negotiation Agent", initials: "NA" },
    action: "Drafted counter-offer to Mumbai Goods Ltd.",
    resource: "Quote",
    resourceId: "q-4422",
    category: "Outreach",
    diff: [{ field: "discount", from: "5%", to: "8%" }],
    hash: "0x1b88f02a",
  },
  {
    id: "e10",
    ts: "2024-05-19 09:18:42 UTC",
    actor: { type: "human", name: "Aiko Tanaka", initials: "AT" },
    action: "Failed login (incorrect password)",
    resource: "Session",
    resourceId: "—",
    category: "Auth",
    ipAddress: "203.0.113.4",
    hash: "0x7a2b1190",
  },
];

const CAT_TONE: Record<string, string> = {
  Auth: "bg-accent-blue/15 text-accent-blue",
  Data: "bg-accent-cyan/15 text-accent-cyan",
  Permissions: "bg-accent-amber/15 text-accent-amber",
  Billing: "bg-accent-green/15 text-accent-green",
  Agent: "bg-brand-500/15 text-brand-200",
  Outreach: "bg-accent-cyan/15 text-accent-cyan",
};

const ACTOR_ICON: Record<Actor["type"], { Icon: React.ComponentType<{ className?: string }>; bg: string; text: string }> = {
  human: { Icon: User, bg: "bg-gradient-brand", text: "text-white" },
  agent: { Icon: Bot, bg: "bg-brand-500/15", text: "text-brand-300" },
  system: { Icon: Shield, bg: "bg-bg-hover", text: "text-ink-secondary" },
};

const CATEGORIES = ["All", "Auth", "Data", "Permissions", "Billing", "Agent", "Outreach"] as const;

export default function AuditLogsPage() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("All");
  const [open, setOpen] = useState<AuditEvent | null>(null);
  const { toast } = useToast();

  function handleExport() {
    const rows = EVENTS.map((e) => ({
      timestamp: e.ts,
      actor_type: e.actor.type,
      actor_name: e.actor.name,
      action: e.action,
      resource: e.resource,
      resource_id: e.resourceId,
      category: e.category,
      ip_address: e.ipAddress ?? "",
      hash: e.hash,
      diff: e.diff ? e.diff.map((d) => `${d.field}: ${d.from} -> ${d.to}`).join("; ") : "",
    }));
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(`audit-log-${date}.csv`, rows);
    toast(`Exported ${rows.length} audit events`);
  }

  function handleSavedViews() {
    toast("Saved views coming soon — for now, use the search + category filters.", "info");
  }

  const filtered = useMemo(() => {
    return EVENTS.filter((e) => {
      if (cat !== "All" && e.category !== cat) return false;
      if (
        query &&
        !e.action.toLowerCase().includes(query.toLowerCase()) &&
        !e.actor.name.toLowerCase().includes(query.toLowerCase()) &&
        !e.resource.toLowerCase().includes(query.toLowerCase()) &&
        !e.resourceId.toLowerCase().includes(query.toLowerCase())
      ) return false;
      return true;
    });
  }, [query, cat]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Audit Logs</h1>
            <p className="text-xs text-ink-secondary">
              Tamper-evident hash chain · 7-year retention · SOC 2 + GDPR ready
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSavedViews}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
          >
            <Filter className="h-4 w-4" /> Saved views
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-accent-green/30 bg-accent-green/5 p-3">
        <div className="flex items-center gap-2 text-xs">
          <ShieldCheck className="h-4 w-4 text-accent-green" />
          <span className="font-medium">Hash chain integrity verified</span>
          <span className="text-ink-tertiary">· last check 2 min ago · 0 inconsistencies in 18,442 events</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by actor, action, resource, or ID…"
            className="h-9 w-full rounded-lg border border-bg-border bg-bg-card pl-9 pr-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-bg-border bg-bg-card p-1 text-xs">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`rounded-md px-3 py-1 ${
                cat === c
                  ? "bg-brand-500/15 text-brand-200"
                  : "text-ink-secondary hover:bg-bg-hover"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
        <table className="min-w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
            <tr className="border-b border-bg-border">
              <th className="px-5 py-2.5 text-left font-medium">Timestamp</th>
              <th className="px-3 py-2.5 text-left font-medium">Actor</th>
              <th className="px-3 py-2.5 text-left font-medium">Action</th>
              <th className="px-3 py-2.5 text-left font-medium">Resource</th>
              <th className="px-3 py-2.5 text-left font-medium">Category</th>
              <th className="px-5 py-2.5 text-right font-medium">Hash</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const a = ACTOR_ICON[e.actor.type];
              const ActorIcon = a.Icon;
              return (
                <tr
                  key={e.id}
                  onClick={() => setOpen(e)}
                  className="cursor-pointer border-t border-bg-border hover:bg-bg-hover/30"
                >
                  <td className="px-5 py-3 font-mono text-[11px] text-ink-secondary">{e.ts}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`grid h-7 w-7 place-items-center rounded-full ${a.bg} text-[10px] font-bold ${a.text}`}>
                        {e.actor.type === "human" ? e.actor.initials : <ActorIcon className="h-3.5 w-3.5" />}
                      </div>
                      <div>
                        <div className="text-xs font-medium">{e.actor.name}</div>
                        <div className="text-[10px] text-ink-tertiary capitalize">{e.actor.type}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs">{e.action}</td>
                  <td className="px-3 py-3">
                    <div className="text-xs">{e.resource}</div>
                    <div className="font-mono text-[10px] text-ink-tertiary">{e.resourceId}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${CAT_TONE[e.category]}`}>
                      {e.category}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-tertiary">
                      <Hash className="h-3 w-3" />
                      {e.hash}
                      <ChevronRight className="h-3 w-3" />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60"
          onClick={() => setOpen(null)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-bg-border bg-bg-panel"
          >
            <div className="flex items-center justify-between border-b border-bg-border px-5 py-4">
              <h2 className="text-base font-semibold">Event Detail</h2>
              <button
                onClick={() => setOpen(null)}
                className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
              >
                ✕
              </button>
            </div>
            <div className="space-y-5 p-5">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Action</div>
                <div className="mt-1 text-base font-semibold">{open.action}</div>
                <div className="mt-1 font-mono text-[11px] text-ink-tertiary">{open.ts}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Actor" value={`${open.actor.name} (${open.actor.type})`} />
                <Field label="Category" value={open.category} />
                <Field label="Resource" value={open.resource} />
                <Field label="Resource ID" value={open.resourceId} mono />
                {open.ipAddress && <Field label="IP Address" value={open.ipAddress} mono />}
                <Field label="Hash" value={open.hash} mono />
              </div>

              {open.diff && open.diff.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-semibold">Field changes</div>
                  <div className="rounded-lg border border-bg-border bg-bg-card">
                    <table className="min-w-full text-xs">
                      <thead className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                        <tr className="border-b border-bg-border">
                          <th className="px-4 py-2 text-left font-medium">Field</th>
                          <th className="px-3 py-2 text-left font-medium">From</th>
                          <th className="px-3 py-2 text-left font-medium">To</th>
                        </tr>
                      </thead>
                      <tbody>
                        {open.diff.map((d) => (
                          <tr key={d.field} className="border-t border-bg-border">
                            <td className="px-4 py-2 font-medium">{d.field}</td>
                            <td className="px-3 py-2 font-mono text-accent-red line-through">{d.from}</td>
                            <td className="px-3 py-2 font-mono text-accent-green">{d.to}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-bg-border bg-bg-hover/40 p-4 text-[11px] text-ink-secondary">
                <div className="flex items-center gap-2 font-semibold">
                  <ShieldCheck className="h-3.5 w-3.5 text-accent-green" />
                  Tamper-evident
                </div>
                <p className="mt-1">
                  This event&apos;s hash <span className="font-mono text-ink-primary">{open.hash}</span> is chained from the previous event. Any tampering breaks the chain and triggers an integrity alert.
                </p>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-bg-border bg-bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className={`mt-1 text-xs font-medium ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
