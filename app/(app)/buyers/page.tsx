"use client";
import {
  Linkedin,
  Loader2,
  Mail,
  Search,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Drawer from "@/components/ui/Drawer";
import BuyerDetail from "@/components/buyers/BuyerDetail";
import {
  BUYER_COUNTRIES,
  BUYER_STATUSES,
  BUYER_TYPES,
  type Buyer,
} from "@/lib/buyers";

type DiscoveredBuyer = Buyer & {
  source?: "agent";
  agent?: string;
  discoveredAt?: string;
  rationale?: string;
  forProduct?: string;
};

const STATUS_TONE: Record<string, string> = {
  New: "bg-bg-hover text-ink-secondary",
  Contacted: "bg-accent-blue/15 text-accent-blue",
  Replied: "bg-accent-cyan/15 text-accent-cyan",
  Negotiating: "bg-accent-amber/15 text-accent-amber",
  "Closed Won": "bg-accent-green/15 text-accent-green",
  "Closed Lost": "bg-accent-red/15 text-accent-red",
};

const SORT = [
  { v: "intent", l: "Intent Score" },
  { v: "fit", l: "Fit %" },
  { v: "company", l: "Company A-Z" },
  { v: "recent", l: "Most Recent Activity" },
] as const;

export default function BuyersPage() {
  return (
    <Suspense fallback={<div className="grid place-items-center py-16 text-ink-tertiary"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
      <BuyersInner />
    </Suspense>
  );
}

function BuyersInner() {
  const search = useSearchParams();
  const focusId = search.get("focus");
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [minIntent, setMinIntent] = useState(60);
  const [sort, setSort] = useState<(typeof SORT)[number]["v"]>("intent");
  const [open, setOpen] = useState<Buyer | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredBuyer[]>([]);

  useEffect(() => {
    fetch("/api/discovered-buyers")
      .then((r) => r.json())
      .then((d) => setDiscovered(d.buyers ?? []))
      .catch(() => {});
  }, []);

  // When the page is opened from /leads' "Open buyer" link with ?focus=<id>,
  // auto-open that buyer's detail drawer once the list has loaded. Also
  // relaxes the intent filter so the freshly-promoted buyer (which starts
  // at intentScore 0 from the lead promotion path) shows up immediately.
  useEffect(() => {
    if (!focusId || discovered.length === 0) return;
    const match = discovered.find((b) => b.id === focusId);
    if (match) {
      setOpen(match);
      // Relax filters so the row is also visible behind the drawer.
      setMinIntent(0);
      setStatuses([]);
      setTypes([]);
      setCountries([]);
      setQuery("");
    }
  }, [focusId, discovered]);

  // Real-only: every buyer in the list is a DiscoveredBuyer that landed
  // via the agent pipeline or the Lead → Buyer auto-promote rule. The
  // hardcoded BUYERS sample was removed so operator never sees fake
  // "FitLife Stores" / "Petopia Boutique" alongside their real ones.
  const allBuyers: DiscoveredBuyer[] = useMemo(() => discovered, [discovered]);

  const list = useMemo(() => {
    let out = allBuyers.filter((b) => {
      if (query && !b.company.toLowerCase().includes(query.toLowerCase()) &&
        !b.industry.toLowerCase().includes(query.toLowerCase())) return false;
      if (types.length && !types.includes(b.type)) return false;
      if (countries.length && !countries.includes(b.country)) return false;
      if (statuses.length && !statuses.includes(b.status)) return false;
      if (b.intentScore < minIntent) return false;
      return true;
    });
    out = out.slice().sort((a, b) => {
      switch (sort) {
        case "intent": return b.intentScore - a.intentScore;
        case "fit": return b.fit - a.fit;
        case "company": return a.company.localeCompare(b.company);
        case "recent": return 0;
      }
    });
    return out;
  }, [allBuyers, query, types, countries, statuses, minIntent, sort]);

  const toggle = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Buyer Discovery</h1>
            <p className="text-xs text-ink-secondary">
              {allBuyers.length === 0
                ? "No buyers yet — discovered by pipeline runs or promoted from leads"
                : <>
                    {list.length} of {allBuyers.length} buyer{allBuyers.length === 1 ? "" : "s"} ·
                    {" "}<span className="text-brand-300">{discovered.length} live</span>
                    {" "}from agent runs &amp; lead promotions
                  </>
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Watchlist button removed — no saved-buyers backend exists.
              Re-add as a real Link when the watchlist feature ships. */}
          <a
            href="/pipeline"
            className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow"
            title="Run the pipeline — Buyer Discovery agent surfaces new buyers per product"
          >
            <Sparkles className="h-4 w-4" /> Find New Buyers
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-4 rounded-xl border border-bg-border bg-bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="h-4 w-4 text-brand-300" /> Filters
          </div>

          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Min Intent Score
            </div>
            <input
              type="range"
              min={50}
              max={100}
              value={minIntent}
              onChange={(e) => setMinIntent(+e.target.value)}
              className="w-full accent-brand-500"
            />
            <div className="mt-1 flex justify-between text-[11px] text-ink-tertiary">
              <span>50</span>
              <span className="text-brand-300">{minIntent}+</span>
              <span>100</span>
            </div>
          </div>

          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Buyer Type
            </div>
            <div className="space-y-1">
              {BUYER_TYPES.map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={types.includes(t)}
                    onChange={() => setTypes(toggle(types, t))}
                    className="h-3.5 w-3.5 accent-brand-500"
                  />
                  <span className="flex-1 text-ink-secondary">{t}</span>
                  <span className="text-ink-tertiary">
                    {allBuyers.filter((b) => b.type === t).length}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Country
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {BUYER_COUNTRIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCountries(toggle(countries, c))}
                  className={`rounded-md border px-2 py-1.5 text-[11px] ${
                    countries.includes(c)
                      ? "border-brand-500/50 bg-brand-500/15 text-brand-200"
                      : "border-bg-border bg-bg-hover/40 text-ink-secondary hover:bg-bg-hover"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Status
            </div>
            <div className="space-y-1">
              {BUYER_STATUSES.map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={statuses.includes(s)}
                    onChange={() => setStatuses(toggle(statuses, s))}
                    className="h-3.5 w-3.5 accent-brand-500"
                  />
                  <span className="flex-1 text-ink-secondary">{s}</span>
                  <span className="text-ink-tertiary">
                    {allBuyers.filter((b) => b.status === s).length}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={() => {
              setTypes([]);
              setCountries([]);
              setStatuses([]);
              setMinIntent(60);
              setQuery("");
            }}
            className="w-full rounded-md border border-bg-border bg-bg-hover/40 py-2 text-xs text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
          >
            Clear filters
          </button>
        </aside>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search buyers, industries…"
                className="h-9 w-full rounded-lg border border-bg-border bg-bg-card pl-9 pr-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="h-9 rounded-lg border border-bg-border bg-bg-card px-3 text-sm"
            >
              {SORT.map((o) => (
                <option key={o.v} value={o.v}>Sort: {o.l}</option>
              ))}
            </select>
          </div>

          <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
            <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
                <tr className="border-b border-bg-border">
                  <th className="px-4 py-2.5 text-left font-medium">Company</th>
                  <th className="px-3 py-2.5 text-left font-medium">Type</th>
                  <th className="px-3 py-2.5 text-left font-medium">Location</th>
                  <th className="px-3 py-2.5 text-left font-medium">Intent</th>
                  <th className="px-3 py-2.5 text-left font-medium">Fit</th>
                  <th className="px-3 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <Users className="mx-auto mb-2 h-6 w-6 text-ink-tertiary" />
                      <div className="text-sm font-semibold">
                        {allBuyers.length === 0 ? "No buyers yet" : "No buyers match your filters"}
                      </div>
                      <p className="mx-auto mt-1 max-w-md text-xs text-ink-tertiary">
                        {allBuyers.length === 0
                          ? <>Buyers appear here when the Buyer Discovery agent finds them via pipeline runs, or when a hot lead gets promoted from <a href="/leads" className="text-brand-300 hover:underline">/leads</a>.</>
                          : "Lower the intent threshold or clear filters to see more."}
                      </p>
                    </td>
                  </tr>
                )}
                {list.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => setOpen(b)}
                    className="cursor-pointer border-t border-bg-border hover:bg-bg-hover/30"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`grid h-9 w-9 place-items-center rounded-md text-[10px] font-semibold ${
                            b.source === "agent"
                              ? "bg-gradient-brand text-white"
                              : "bg-bg-hover"
                          }`}
                        >
                          {b.company.split(" ").slice(0, 2).map((w) => w[0]).join("")}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 font-medium">
                            {b.company}
                            {b.source === "agent" && (
                              <span className="flex items-center gap-0.5 rounded bg-gradient-brand px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                                <Sparkles className="h-2.5 w-2.5" /> Live
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-ink-tertiary">
                            {b.industry}
                            {b.forProduct && (
                              <> · for <span className="text-brand-300">{b.forProduct}</span></>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-ink-secondary">{b.type}</td>
                    <td className="px-3 py-3 text-ink-secondary">{b.location}</td>
                    <td className="px-3 py-3 font-semibold text-brand-200">{b.intentScore}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1 w-12 overflow-hidden rounded-full bg-bg-hover">
                          <div className="h-full bg-gradient-brand" style={{ width: `${b.fit}%` }} />
                        </div>
                        <span className="text-xs">{b.fit}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[b.status]}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {b.email ? (
                          <a
                            href={`mailto:${b.email}`}
                            title={`Email ${b.email}`}
                            className="grid h-7 w-7 place-items-center rounded-md border border-bg-border text-ink-secondary transition hover:border-brand-500/40 hover:text-brand-200"
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <span
                            title="No email on file"
                            className="grid h-7 w-7 place-items-center rounded-md border border-bg-border text-ink-tertiary opacity-40"
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </span>
                        )}
                        {b.linkedin ? (
                          <a
                            href={b.linkedin.startsWith("http") ? b.linkedin : `https://${b.linkedin}`}
                            target="_blank"
                            rel="noreferrer noopener"
                            title={`Open ${b.linkedin}`}
                            className="grid h-7 w-7 place-items-center rounded-md border border-bg-border text-ink-secondary transition hover:border-brand-500/40 hover:text-brand-200"
                          >
                            <Linkedin className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <span
                            title="No LinkedIn on file"
                            className="grid h-7 w-7 place-items-center rounded-md border border-bg-border text-ink-tertiary opacity-40"
                          >
                            <Linkedin className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </div>

      <Drawer open={!!open} onClose={() => setOpen(null)} title="Buyer Profile">
        {open && <BuyerDetail b={open} />}
      </Drawer>
    </div>
  );
}
