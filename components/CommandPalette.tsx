"use client";
import {
  ArrowLeftRight,
  Boxes,
  Building2,
  ChevronRight,
  CornerDownLeft,
  DollarSign,
  Factory,
  Hash,
  Package,
  Search,
  Send,
  Sparkles,
  Telescope,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ADMIN_NAV, PRIMARY_NAV } from "@/lib/nav";
import { PRODUCTS } from "@/lib/products";
import { BUYERS } from "@/lib/buyers";
import { SUPPLIERS } from "@/lib/suppliers";

type LiveData = {
  products: Array<{ id: string; name: string; category?: string; emoji?: string; demandScore?: number }>;
  buyers: Array<{ id: string; company: string; type?: string; location?: string; industry?: string; country?: string }>;
  suppliers: Array<{ id: string; name: string; type?: string; country?: string; city?: string }>;
  transactions: Array<{ id: string; buyerCompany: string; productName: string; state: string; productTotalCents: number }>;
};

type Item = {
  id: string;
  label: string;
  hint?: string;
  href?: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
  action?: () => void;
};

const Ctx = createContext<{ open: () => void } | null>(null);
export const useCommandPalette = () => useContext(Ctx);

export default function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [live, setLive] = useState<LiveData | null>(null);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const open = () => setIsOpen(true);
  const close = () => {
    setIsOpen(false);
    setQuery("");
    setActiveIdx(0);
  };

  // Fetch live data on first open and every time the palette opens —
  // /api/* are admin-gated which is fine since the palette is inside
  // the (app) auth shell. Cache in component state so subsequent opens
  // are instant; refresh in the background.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    Promise.all([
      fetch("/api/products", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/discovered-buyers", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/discovered-suppliers", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/transactions", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([p, b, s, t]) => {
      if (cancelled) return;
      setLive({
        products: p?.products ?? [],
        buyers: b?.buyers ?? [],
        suppliers: s?.suppliers ?? [],
        transactions: t?.transactions ?? [],
      });
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Build search corpus
  const items: Item[] = useMemo(() => {
    const navItems: Item[] = [
      ...PRIMARY_NAV.map((n) => ({
        id: `nav-${n.href}`,
        label: n.label,
        hint: "Navigate",
        href: n.href,
        group: "Pages",
        icon: n.icon,
      })),
      ...ADMIN_NAV.map((n) => ({
        id: `admin-${n.href}`,
        label: n.label,
        hint: "Admin",
        href: n.href,
        group: "Admin",
        icon: n.icon,
      })),
    ];

    // Live data first (operator's actual workspace), seed lists as fallback
    // when the workspace is fresh and there's no real data yet
    const liveProducts = live?.products ?? [];
    const productItems: Item[] = (liveProducts.length > 0 ? liveProducts : PRODUCTS.slice(0, 25)).map((p) => ({
      id: `p-${p.id}`,
      label: p.name,
      hint: `${p.category ?? ""}${(p as any).demandScore != null ? ` · Demand ${(p as any).demandScore}` : ""}${liveProducts.length === 0 ? " · seed" : ""}`,
      href: "/products",
      group: liveProducts.length > 0 ? "Products" : "Products (seed)",
      icon: Package,
      keywords: `${p.category ?? ""} ${(p as any).niche ?? ""} ${p.emoji ?? ""}`,
    }));

    const liveBuyers = live?.buyers ?? [];
    const buyerItems: Item[] = (liveBuyers.length > 0 ? liveBuyers : BUYERS.slice(0, 30)).map((b) => ({
      id: `b-${b.id}`,
      label: b.company,
      hint: `${(b as any).type ?? ""} · ${(b as any).location ?? (b as any).country ?? ""}${liveBuyers.length === 0 ? " · seed" : ""}`,
      href: "/buyers",
      group: liveBuyers.length > 0 ? "Buyers" : "Buyers (seed)",
      icon: Building2,
      keywords: `${(b as any).industry ?? ""} ${(b as any).type ?? ""} ${(b as any).country ?? ""}`,
    }));

    const liveSuppliers = live?.suppliers ?? [];
    const supplierItems: Item[] = (liveSuppliers.length > 0 ? liveSuppliers : SUPPLIERS).map((s) => ({
      id: `s-${s.id}`,
      label: s.name,
      hint: `${(s as any).type ?? ""} · ${(s as any).country ?? ""}${liveSuppliers.length === 0 ? " · seed" : ""}`,
      href: "/suppliers",
      group: liveSuppliers.length > 0 ? "Suppliers" : "Suppliers (seed)",
      icon: Factory,
      keywords: `${(s as any).city ?? ""} ${(s as any).country ?? ""}`,
    }));

    // Real transactions — only when they exist; no seed fallback since
    // transactions are operator-driven, not catalog data
    const transactionItems: Item[] = (live?.transactions ?? []).slice(0, 50).map((t) => ({
      id: `t-${t.id}`,
      label: `${t.buyerCompany} · ${t.productName}`,
      hint: `${t.state.replace(/_/g, " ")} · $${(t.productTotalCents / 100).toLocaleString()}`,
      href: "/transactions",
      group: "Transactions",
      icon: ArrowLeftRight,
      keywords: `${t.id} ${t.state} txn deal`,
    }));

    const actions: Item[] = [
      { id: "act-trend-scan", label: "Run Trend Scan", hint: "Trigger Trend Hunter Agent", group: "Actions", icon: Sparkles, action: () => router.push("/products") },
      { id: "act-new-campaign", label: "New Outreach Campaign", hint: "Open campaign builder", group: "Actions", icon: Send, href: "/outreach" },
      { id: "act-new-deal", label: "New Deal", hint: "Add to CRM pipeline", group: "Actions", icon: Workflow, href: "/crm" },
      { id: "act-new-quote", label: "Build Quote", hint: "Open quote builder", group: "Actions", icon: DollarSign, href: "/deals" },
      { id: "act-new-automation", label: "New Automation", hint: "Visual rule builder", group: "Actions", icon: Zap, href: "/automations" },
      { id: "act-find-buyers", label: "Discover Buyers", hint: "Run Buyer Discovery", group: "Actions", icon: Users, href: "/buyers" },
      { id: "act-find-forecasts", label: "Browse Trend Forecasts", hint: "Predicted demand spikes", group: "Actions", icon: Telescope, href: "/insights" },
      { id: "act-marketplace", label: "Open Marketplace", hint: "Live RFQs and listings", group: "Actions", icon: Boxes, href: "/marketplace" },
    ];

    return [
      ...navItems,
      ...actions,
      ...transactionItems,  // real ops data first — operators search for these most
      ...productItems,
      ...buyerItems,
      ...supplierItems,
    ];
  }, [router, live]);

  // Filter
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Default view — pages + actions
      return items.filter((i) => i.group === "Pages" || i.group === "Actions" || i.group === "Admin").slice(0, 20);
    }
    return items
      .filter((i) =>
        (i.label + " " + (i.hint ?? "") + " " + (i.keywords ?? "")).toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [items, query]);

  // Group results
  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const r of results) {
      if (!map.has(r.group)) map.set(r.group, []);
      map.get(r.group)!.push(r);
    }
    return Array.from(map.entries());
  }, [results]);

  const flatList = useMemo(() => grouped.flatMap(([, items]) => items), [grouped]);

  // Keyboard handlers
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((v) => !v);
        return;
      }
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(flatList.length - 1, i + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = flatList[activeIdx];
        if (!item) return;
        if (item.action) item.action();
        else if (item.href) router.push(item.href);
        close();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, flatList, activeIdx, router]);

  // Reset active index when query changes
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Auto-focus when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  // Scroll active into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector<HTMLElement>("[data-active='true']");
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-[10vh]"
          onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl mx-4 overflow-hidden rounded-xl border border-bg-border bg-bg-panel shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-bg-border px-4">
              <Search className="h-4 w-4 text-ink-tertiary" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pages, products, buyers, suppliers, actions…"
                className="h-12 flex-1 bg-transparent text-sm placeholder:text-ink-tertiary focus:outline-none"
              />
              <kbd className="rounded border border-bg-border bg-bg-card px-1.5 py-0.5 text-[10px] text-ink-tertiary">
                ESC
              </kbd>
            </div>

            <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
              {flatList.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-ink-tertiary">
                  No matches for &ldquo;{query}&rdquo;
                </div>
              ) : (
                grouped.map(([group, items]) => (
                  <div key={group} className="mb-2">
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                      {group}
                    </div>
                    {items.map((it) => {
                      const idx = flatList.indexOf(it);
                      const isActive = idx === activeIdx;
                      return (
                        <button
                          key={it.id}
                          data-active={isActive}
                          onMouseEnter={() => setActiveIdx(idx)}
                          onClick={() => {
                            if (it.action) it.action();
                            else if (it.href) router.push(it.href);
                            close();
                          }}
                          className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left ${
                            isActive ? "bg-brand-500/15" : ""
                          }`}
                        >
                          <div
                            className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${
                              isActive ? "bg-brand-500/30 text-brand-100" : "bg-bg-hover text-ink-secondary"
                            }`}
                          >
                            <it.icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`truncate text-sm ${isActive ? "text-ink-primary" : "text-ink-primary"}`}>
                              {it.label}
                            </div>
                            {it.hint && (
                              <div className="truncate text-[11px] text-ink-tertiary">
                                {it.hint}
                              </div>
                            )}
                          </div>
                          {isActive && (
                            <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink-tertiary" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between border-t border-bg-border px-4 py-2.5 text-[11px] text-ink-tertiary">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <kbd className="rounded border border-bg-border bg-bg-card px-1 py-0.5 text-[10px]">↑↓</kbd>
                  Navigate
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="rounded border border-bg-border bg-bg-card px-1 py-0.5 text-[10px]">↵</kbd>
                  Select
                </span>
              </div>
              <span className="flex items-center gap-1">
                <Hash className="h-3 w-3" />
                {flatList.length} result{flatList.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
