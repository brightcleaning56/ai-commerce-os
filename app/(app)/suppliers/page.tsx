"use client";
import {
  AlertTriangle,
  Anchor,
  CheckCircle2,
  Factory,
  Plane,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Truck,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Drawer from "@/components/ui/Drawer";
import { useToast } from "@/components/Toast";
import { SUPPLIERS, type Supplier } from "@/lib/suppliers";

type DiscoveredSupplier = Supplier & {
  source?: "agent";
  agent?: string;
  discoveredAt?: string;
  rationale?: string;
  forProduct?: string;
};

const SHIP_ICON = { Sea: Anchor, Air: Plane, Express: Zap } as const;

function riskTone(score: number) {
  if (score >= 60) return { bg: "bg-accent-red/15", text: "text-accent-red", label: "High" };
  if (score >= 30) return { bg: "bg-accent-amber/15", text: "text-accent-amber", label: "Medium" };
  return { bg: "bg-accent-green/15", text: "text-accent-green", label: "Low" };
}

function SupplierDetail({
  s,
  onRequestQuote,
  onOrderSample,
}: {
  s: Supplier;
  onRequestQuote: (s: Supplier) => void;
  onOrderSample: (s: Supplier) => void;
}) {
  const r = riskTone(s.riskScore);
  return (
    <div className="space-y-5 p-5">
      <div className="flex items-start gap-4">
        <div className="grid h-14 w-14 place-items-center rounded-xl bg-gradient-card text-2xl">
          🏭
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="text-xl font-bold">{s.name}</div>
            {s.verified && (
              <span className="flex items-center gap-1 rounded-md bg-accent-green/15 px-2 py-0.5 text-[10px] font-semibold text-accent-green">
                <CheckCircle2 className="h-3 w-3" /> Verified
              </span>
            )}
          </div>
          <div className="text-xs text-ink-tertiary">
            {s.type} · {s.city}, {s.country}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs">
              <Star className="h-3 w-3 fill-accent-amber text-accent-amber" />
              {s.rating} · {s.yearsActive}y active
            </span>
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${r.bg} ${r.text}`}>
              Risk: {r.label} ({s.riskScore})
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-bg-border bg-bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Unit Price</div>
          <div className="mt-1 text-base font-semibold">${s.unitPrice.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border border-bg-border bg-bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">MOQ</div>
          <div className="mt-1 text-base font-semibold">{s.moq.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-bg-border bg-bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Lead Time</div>
          <div className="mt-1 text-base font-semibold">{s.leadTimeDays}d</div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold">Capacity & Response</div>
        <div className="rounded-lg border border-bg-border bg-bg-card p-4 text-sm">
          <div className="flex items-center justify-between text-xs text-ink-secondary">
            <span>Monthly capacity</span>
            <span className="font-semibold text-ink-primary">
              {s.capacityUnitsPerMo.toLocaleString()} units
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-ink-secondary">
            <span>Avg. response time</span>
            <span className="font-semibold text-ink-primary">{s.responseHours}h</span>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold">Certifications</div>
        <div className="flex flex-wrap gap-1.5">
          {s.certifications.map((c) => (
            <span
              key={c}
              className="flex items-center gap-1 rounded-md border border-bg-border bg-bg-hover/40 px-2 py-1 text-[11px] text-ink-secondary"
            >
              <ShieldCheck className="h-3 w-3 text-accent-green" /> {c}
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold">Shipping</div>
        <div className="flex flex-wrap gap-1.5">
          {s.shipMethods.map((m) => {
            const I = SHIP_ICON[m];
            return (
              <span
                key={m}
                className="flex items-center gap-1 rounded-md border border-bg-border bg-bg-hover/40 px-2 py-1 text-[11px] text-ink-secondary"
              >
                <I className="h-3 w-3 text-brand-300" /> {m}
              </span>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold">Matched Products</div>
        <div className="space-y-1.5">
          {s.matchedProducts.map((p) => (
            <div
              key={p}
              className="flex items-center justify-between rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-xs"
            >
              <span className="text-ink-secondary">{p}</span>
              <span className="font-semibold text-accent-green">Good fit</span>
            </div>
          ))}
        </div>
      </div>

      {s.fraudFlags.length > 0 && (
        <div className="rounded-lg border border-accent-red/30 bg-accent-red/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-accent-red">
            <AlertTriangle className="h-4 w-4" /> Risk Flags ({s.fraudFlags.length})
          </div>
          <ul className="mt-2 space-y-1 text-xs text-ink-secondary">
            {s.fraudFlags.map((f) => (
              <li key={f}>• {f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-200">
          <Sparkles className="h-4 w-4" /> AI Verdict
        </div>
        <p className="mt-1 text-xs text-ink-secondary">
          {s.riskScore >= 60
            ? "Treat as high-risk. Require sample order + escrow before placing volume order."
            : s.verified
            ? `Solid candidate at ${s.unitPrice.toFixed(2)}/unit. Margin holds at retail of $${(s.unitPrice * 3).toFixed(2)}.`
            : "Unverified — request factory tour video before sample."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 pb-2">
        <button
          onClick={() => onRequestQuote(s)}
          className="flex items-center justify-center gap-2 rounded-lg bg-gradient-brand py-2.5 text-sm font-semibold shadow-glow"
        >
          <Send className="h-4 w-4" /> Request Quote
        </button>
        <button
          onClick={() => onOrderSample(s)}
          className="flex items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-card py-2.5 text-sm hover:bg-bg-hover"
        >
          <Truck className="h-4 w-4" /> Order Sample
        </button>
      </div>
    </div>
  );
}

const TYPES = ["Manufacturer", "Wholesaler", "Distributor", "Dropship"] as const;
const COUNTRIES = Array.from(new Set(SUPPLIERS.map((s) => s.country)));

export default function SuppliersPage() {
  const [open, setOpen] = useState<Supplier | null>(null);
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [maxRisk, setMaxRisk] = useState(100);
  const [discovered, setDiscovered] = useState<DiscoveredSupplier[]>([]);
  const [scanning, setScanning] = useState(false);
  const { toast } = useToast();

  async function runFinderForLatest() {
    setScanning(true);
    try {
      // Try to use the most recent discovered product as the seed, falling back to a generic scan
      const productsRes = await fetch("/api/products");
      const productsData = await productsRes.json();
      const seed = productsData.products?.[0];
      const body = seed
        ? { productName: seed.name, productCategory: seed.category, productNiche: seed.niche }
        : { productName: "Trending product", productCategory: "Home & Kitchen", productNiche: "Kitchen Gadgets" };

      const res = await fetch("/api/agents/supplier-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Supplier scan failed");

      // Refresh
      const ref = await fetch("/api/discovered-suppliers").then((r) => r.json());
      setDiscovered(ref.suppliers ?? []);
      toast(`Supplier Finder returned ${data.run.supplierCount} suppliers for "${body.productName}"`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Scan failed", "error");
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    fetch("/api/discovered-suppliers")
      .then((r) => r.json())
      .then((d) => setDiscovered(d.suppliers ?? []))
      .catch(() => {});
  }, []);

  const allSuppliers: DiscoveredSupplier[] = useMemo(
    () => [...discovered, ...SUPPLIERS],
    [discovered]
  );

  function handleRequestQuote(s: Supplier) {
    toast(`Quote requested from ${s.name} · expect reply in ${s.responseHours}h`);
    setOpen(null);
  }

  function handleOrderSample(s: Supplier) {
    toast(`Sample requested from ${s.name} · MOQ 1, lead time ${s.leadTimeDays}d`);
    setOpen(null);
  }

  const list = useMemo(() => {
    return allSuppliers.filter((s) => {
      if (query && !s.name.toLowerCase().includes(query.toLowerCase())) return false;
      if (types.length && !types.includes(s.type)) return false;
      if (countries.length && !countries.includes(s.country)) return false;
      if (verifiedOnly && !s.verified) return false;
      if (s.riskScore > maxRisk) return false;
      return true;
    }).sort((a, b) => a.riskScore - b.riskScore);
  }, [allSuppliers, query, types, countries, verifiedOnly, maxRisk]);

  const toggle = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Factory className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Supplier Finder</h1>
            <p className="text-xs text-ink-secondary">
              {list.length} of {allSuppliers.length} suppliers
              {discovered.length > 0 && (
                <> · <span className="text-brand-300">{discovered.length} live</span> from agent runs</>
              )}
            </p>
            <p className="text-[11px] text-ink-tertiary">
              scanning Alibaba, 1688, Made-in-China + 4 directories
            </p>
          </div>
        </div>
        <button
          onClick={runFinderForLatest}
          disabled={scanning}
          className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow disabled:opacity-60"
        >
          <Sparkles className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Finding suppliers…" : "Find New Suppliers"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-4 rounded-xl border border-bg-border bg-bg-card p-4">
          <div className="text-sm font-semibold">Filters</div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search supplier…"
              className="h-9 w-full rounded-lg border border-bg-border bg-bg-card pl-9 pr-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Type
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTypes(toggle(types, t))}
                  className={`rounded-md border px-2 py-1.5 text-[11px] ${
                    types.includes(t)
                      ? "border-brand-500/50 bg-brand-500/15 text-brand-200"
                      : "border-bg-border bg-bg-hover/40 text-ink-secondary hover:bg-bg-hover"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Country
            </div>
            <div className="space-y-1">
              {COUNTRIES.map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={countries.includes(c)}
                    onChange={() => setCountries(toggle(countries, c))}
                    className="h-3.5 w-3.5 accent-brand-500"
                  />
                  <span className="flex-1 text-ink-secondary">{c}</span>
                  <span className="text-ink-tertiary">
                    {SUPPLIERS.filter((s) => s.country === c).length}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Max Risk Score
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={maxRisk}
              onChange={(e) => setMaxRisk(+e.target.value)}
              className="w-full accent-brand-500"
            />
            <div className="mt-1 flex justify-between text-[11px] text-ink-tertiary">
              <span>0</span>
              <span className="text-brand-300">≤ {maxRisk}</span>
              <span>100</span>
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-bg-border bg-bg-hover/30 px-3 py-2.5 text-xs">
            <span className="text-ink-secondary">Verified only</span>
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-brand-500"
            />
          </label>

          <button
            onClick={() => {
              setQuery("");
              setTypes([]);
              setCountries([]);
              setMaxRisk(100);
              setVerifiedOnly(false);
            }}
            className="w-full rounded-md border border-bg-border bg-bg-hover/40 py-2 text-xs text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
          >
            Clear filters
          </button>
        </aside>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => {
            const r = riskTone(s.riskScore);
            const isLive = (s as DiscoveredSupplier).source === "agent";
            return (
              <button
                key={s.id}
                onClick={() => setOpen(s)}
                className={`relative rounded-xl border bg-bg-card p-4 text-left transition hover:border-brand-500/50 hover:shadow-glow ${
                  isLive ? "border-brand-500/40" : "border-bg-border"
                }`}
              >
                {isLive && (
                  <span className="absolute -top-2 left-3 flex items-center gap-1 rounded-full bg-gradient-brand px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow-glow">
                    <Sparkles className="h-2.5 w-2.5" /> Live
                  </span>
                )}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">{s.name}</span>
                      {s.verified && (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent-green" />
                      )}
                    </div>
                    <div className="text-[11px] text-ink-tertiary">
                      {s.city}, {s.country} · {s.type}
                      {(s as DiscoveredSupplier).forProduct && (
                        <> · for <span className="text-brand-300">{(s as DiscoveredSupplier).forProduct}</span></>
                      )}
                    </div>
                  </div>
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${r.bg} ${r.text}`}>
                    {r.label}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                      Unit
                    </div>
                    <div className="text-sm font-semibold">${s.unitPrice.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                      MOQ
                    </div>
                    <div className="text-sm font-semibold">{s.moq}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                      Lead
                    </div>
                    <div className="text-sm font-semibold">{s.leadTimeDays}d</div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-accent-amber text-accent-amber" />
                    {s.rating} · {s.yearsActive}y
                  </span>
                  <div className="flex items-center gap-0.5">
                    {s.shipMethods.map((m) => {
                      const I = SHIP_ICON[m];
                      return (
                        <span
                          key={m}
                          className="grid h-5 w-5 place-items-center rounded bg-bg-hover/60 text-brand-300"
                        >
                          <I className="h-2.5 w-2.5" />
                        </span>
                      );
                    })}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Drawer open={!!open} onClose={() => setOpen(null)} title="Supplier Profile">
        {open && (
          <SupplierDetail
            s={open}
            onRequestQuote={handleRequestQuote}
            onOrderSample={handleOrderSample}
          />
        )}
      </Drawer>
    </div>
  );
}
