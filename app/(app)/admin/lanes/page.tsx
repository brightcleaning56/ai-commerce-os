"use client";
import {
  AlertCircle,
  Globe,
  Loader2,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * /admin/lanes — cross-supplier Layer 6 rollup.
 *
 * Aggregate view above the per-supplier lane panel that lives in
 * /admin/suppliers. Answers operator-level questions:
 *   - Where does most of our volume actually move?
 *   - How many suppliers ship from CA → TX?
 *   - Which lanes are dormant vs growing?
 *
 * Two views, both rendered:
 *   1. Region rollup tiles (Asia → US-East, etc.) — coarse, scannable
 *   2. State-level lane table — drill-down with topSuppliers per lane
 *
 * Optional country filters run server-side for narrow queries.
 */

type CrossLane = {
  key: string;
  origin: { country: string; state?: string };
  destination: { country: string; state?: string };
  supplierCount: number;
  transactionCount: number;
  totalUnits: number;
  totalRevenueCents: number;
  lastShipmentAt: string | null;
  firstShipmentAt: string | null;
  topSuppliers: Array<{
    supplierId: string;
    legalName: string;
    transactionCount: number;
    totalRevenueCents: number;
  }>;
};

type RegionLane = {
  key: string;
  originRegion: string;
  destinationRegion: string;
  laneCount: number;
  supplierCount: number;
  transactionCount: number;
  totalUnits: number;
  totalRevenueCents: number;
};

type LaneSeriesBucket = {
  weekStartIso: string;
  transactionCount: number;
  totalRevenueCents: number;
};
type LaneSeries = {
  laneKey: string;
  buckets: LaneSeriesBucket[];
  trendPct: number | null;
};

type LanesRollup = {
  computedAt: string;
  totalLinkedTransactions: number;
  missingDestinationCount: number;
  lanes: CrossLane[];
  series?: LaneSeries[];
  regions: RegionLane[];
  originCountries: string[];
  destinationCountries: string[];
};

const REGION_LABEL: Record<string, string> = {
  asia: "Asia",
  eu: "Europe (EU)",
  uk: "UK",
  "north-america-other": "Canada / Mexico",
  "south-america": "South America",
  "middle-east": "Middle East",
  africa: "Africa",
  oceania: "Oceania",
  "us-east": "US East",
  "us-west": "US West",
  "us-central": "US Central",
  us: "US (unspecified state)",
  other: "Other",
};

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function CrossSupplierLanesPage() {
  const [data, setData] = useState<LanesRollup | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originFilter, setOriginFilter] = useState("");
  const [destFilter, setDestFilter] = useState("");
  const [expandedLane, setExpandedLane] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (originFilter) params.set("originCountry", originFilter);
      if (destFilter) params.set("destCountry", destFilter);
      // Slice 35: always request the 13-week (90-day) series so the
      // sparkline column renders. Cheap to compute server-side.
      params.set("series", "true");
      const qs = params.toString();
      const r = await fetch(`/api/admin/lanes?${qs}`, { cache: "no-store" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Load failed (${r.status})`);
      }
      const d = await r.json();
      setData(d as LanesRollup);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load lanes");
    } finally {
      setLoading(false);
    }
  }, [originFilter, destFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalRevenue = useMemo(() => {
    return (data?.lanes ?? []).reduce((s, l) => s + l.totalRevenueCents, 0);
  }, [data]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Distribution lanes</h1>
          <p className="text-[12px] text-ink-tertiary">
            Cross-supplier Layer 6 rollup — every linked transaction grouped by
            origin → destination at the state level, with regional aggregates above.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-card px-2.5 py-1.5 text-[12px] text-ink-secondary hover:bg-bg-hover disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-bg-border bg-bg-card p-3">
        <Globe className="h-3.5 w-3.5 text-ink-tertiary" />
        <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
          Origin country
        </label>
        <input
          value={originFilter}
          onChange={(e) => setOriginFilter(e.target.value.toUpperCase())}
          placeholder="any"
          maxLength={2}
          className="h-8 w-16 rounded-md border border-bg-border bg-bg-app px-2 text-sm uppercase font-mono"
        />
        <span className="text-ink-tertiary">→</span>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
          Destination country
        </label>
        <input
          value={destFilter}
          onChange={(e) => setDestFilter(e.target.value.toUpperCase())}
          placeholder="any"
          maxLength={2}
          className="h-8 w-16 rounded-md border border-bg-border bg-bg-app px-2 text-sm uppercase font-mono"
        />
        {(originFilter || destFilter) && (
          <button
            type="button"
            onClick={() => {
              setOriginFilter("");
              setDestFilter("");
            }}
            className="rounded-md border border-bg-border bg-bg-app px-2 py-0.5 text-[11px] text-ink-secondary hover:text-ink-primary"
          >
            Clear
          </button>
        )}
        <div className="ml-auto text-[11px] text-ink-tertiary">
          {data && `${data.lanes.length} lane${data.lanes.length === 1 ? "" : "s"} · ${data.totalLinkedTransactions} linked txns · ${fmtUsd(totalRevenue)} routed`}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          {error}
        </div>
      )}

      {data && data.missingDestinationCount > 0 && (
        <div className="rounded-md border border-accent-amber/30 bg-accent-amber/5 px-3 py-2 text-[12px] text-ink-secondary">
          <strong className="text-accent-amber">{data.missingDestinationCount}</strong>{" "}
          linked transaction{data.missingDestinationCount === 1 ? "" : "s"} without a buyer destination —
          set one on each via{" "}
          <span className="font-mono">POST /api/transactions/[id]/destination</span> to include it
          in the rollup.
        </div>
      )}

      {/* Region rollup */}
      {data && data.regions.length > 0 && (
        <div>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
            Region rollup
          </h2>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            {data.regions.slice(0, 9).map((r) => (
              <div
                key={r.key}
                className="rounded-xl border border-bg-border bg-bg-card p-3"
              >
                <div className="flex items-center gap-2 text-[12px] font-semibold">
                  <span>{REGION_LABEL[r.originRegion] ?? r.originRegion}</span>
                  <span className="text-brand-300">→</span>
                  <span>{REGION_LABEL[r.destinationRegion] ?? r.destinationRegion}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <div className="text-ink-tertiary uppercase tracking-wider">Revenue</div>
                    <div className="mt-0.5 text-sm font-bold text-accent-green font-mono">
                      {fmtUsd(r.totalRevenueCents)}
                    </div>
                  </div>
                  <div>
                    <div className="text-ink-tertiary uppercase tracking-wider">Suppliers</div>
                    <div className="mt-0.5 text-sm font-bold">{r.supplierCount}</div>
                  </div>
                  <div>
                    <div className="text-ink-tertiary uppercase tracking-wider">Lanes</div>
                    <div className="mt-0.5 text-sm font-bold">{r.laneCount}</div>
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-ink-tertiary">
                  {r.transactionCount.toLocaleString()} txns · {r.totalUnits.toLocaleString()} units
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* State-level lane table */}
      {loading && !data ? (
        <div className="flex items-center gap-2 rounded-md border border-bg-border bg-bg-card px-3 py-2 text-[11px] text-ink-tertiary">
          <Loader2 className="h-3 w-3 animate-spin" /> Aggregating lanes…
        </div>
      ) : data && data.lanes.length === 0 ? (
        <div className="rounded-md border border-bg-border bg-bg-card px-4 py-10 text-center text-[12px] text-ink-tertiary">
          <AlertCircle className="mx-auto mb-2 h-5 w-5 opacity-50" />
          No lanes match. Either no transactions are linked to suppliers + have a buyer destination
          set, or your country filter excludes everything. Clear filters or set destinations on a
          few transactions and refresh.
        </div>
      ) : data ? (
        <div>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
            State-level lanes
          </h2>
          <div className="overflow-x-auto rounded-xl border border-bg-border bg-bg-card">
            <table className="w-full text-xs">
              <thead className="bg-bg-hover/40 text-[11px] uppercase tracking-wider text-ink-tertiary">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Lane</th>
                  <th className="px-3 py-2.5 text-right font-medium">Suppliers</th>
                  <th className="px-3 py-2.5 text-right font-medium">Txns</th>
                  <th className="px-3 py-2.5 text-right font-medium">Units</th>
                  <th className="px-3 py-2.5 text-right font-medium">Revenue</th>
                  <th className="px-3 py-2.5 text-right font-medium">90d trend</th>
                  <th className="px-3 py-2.5 text-right font-medium">Last shipment</th>
                </tr>
              </thead>
              <tbody>
                {data.lanes.map((lane) => {
                  const isOpen = expandedLane === lane.key;
                  const series = data.series?.find((s) => s.laneKey === lane.key);
                  return (
                    <>
                      <tr
                        key={lane.key}
                        onClick={() => setExpandedLane(isOpen ? null : lane.key)}
                        className={`cursor-pointer border-t border-bg-border ${
                          isOpen ? "bg-brand-500/10" : "hover:bg-bg-hover/30"
                        }`}
                      >
                        <td className="px-4 py-3 font-mono text-ink-primary">
                          {[lane.origin.state, lane.origin.country].filter(Boolean).join("-")}
                          <span className="mx-2 text-brand-300">→</span>
                          {[lane.destination.state, lane.destination.country].filter(Boolean).join("-")}
                        </td>
                        <td className="px-3 py-3 text-right text-ink-secondary">{lane.supplierCount}</td>
                        <td className="px-3 py-3 text-right text-ink-secondary">{lane.transactionCount}</td>
                        <td className="px-3 py-3 text-right text-ink-secondary">{lane.totalUnits.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right font-mono text-accent-green">{fmtUsd(lane.totalRevenueCents)}</td>
                        <td className="px-3 py-3 text-right">
                          <TrendCell series={series} />
                        </td>
                        <td className="px-3 py-3 text-right text-[11px] text-ink-tertiary">
                          {lane.lastShipmentAt ? relTime(lane.lastShipmentAt) : "—"}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${lane.key}-detail`} className="border-t border-bg-border bg-bg-app/40">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                              Top suppliers on this lane
                            </div>
                            <ul className="mt-2 space-y-1">
                              {lane.topSuppliers.map((s) => (
                                <li key={s.supplierId} className="flex items-center justify-between gap-3 text-[11px]">
                                  <Link
                                    href={`/admin/suppliers`}
                                    className="truncate font-medium text-brand-200 hover:underline"
                                    title={`Open ${s.legalName} in the supplier registry`}
                                  >
                                    {s.legalName}
                                  </Link>
                                  <div className="flex shrink-0 items-center gap-3 text-ink-tertiary">
                                    <span>{s.transactionCount} txn{s.transactionCount === 1 ? "" : "s"}</span>
                                    <span className="font-mono text-accent-green">{fmtUsd(s.totalRevenueCents)}</span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                            {/* Slice 39: per-lane freight estimate panel.
                                Hits /api/freight/estimate with the lane's
                                origin + destination + operator-specified
                                weight; renders rates per mode. */}
                            <FreightEstimatePanel lane={lane} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {data && (
        <div className="text-[10px] text-ink-tertiary">
          Computed {relTime(data.computedAt)} · region buckets are coarse (asia / eu / us-east / us-west / etc.) and
          tuned for freight planning, not full UN/M.49.
        </div>
      )}
    </div>
  );
}

// ─── TrendCell (slice 35) ──────────────────────────────────────────

/** Tiny SVG sparkline + trend% chip. Renders nothing when series
 *  data hasn't loaded yet (no flash of empty cells). */
function TrendCell({ series }: { series?: LaneSeries }) {
  if (!series || series.buckets.length === 0) {
    return <span className="text-[10px] text-ink-tertiary">—</span>;
  }
  const values = series.buckets.map((b) => b.totalRevenueCents);
  const max = Math.max(...values, 1);
  const w = 80;
  const h = 22;
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * w;
      const y = h - (v / max) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const trend = series.trendPct;
  const tone =
    trend == null
      ? "text-ink-tertiary"
      : trend > 5
        ? "text-accent-green"
        : trend < -5
          ? "text-accent-red"
          : "text-ink-tertiary";
  const stroke =
    trend == null
      ? "currentColor"
      : trend > 5
        ? "#22c55e"
        : trend < -5
          ? "#ef4444"
          : "#a3a3a3";
  return (
    <div className="inline-flex items-center gap-1.5">
      <svg width={w} height={h} className="opacity-80">
        <polyline
          fill="none"
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
      <span className={`font-mono text-[10px] ${tone}`}>
        {trend == null ? "—" : `${trend >= 0 ? "+" : ""}${Math.round(trend)}%`}
      </span>
    </div>
  );
}

// ─── Freight estimate panel (slice 39) ─────────────────────────────

type FreightRate = {
  mode: string;
  estimateUsd: number;
  transitDaysMin: number;
  transitDaysMax: number;
  notes?: string;
};

function FreightEstimatePanel({ lane }: { lane: CrossLane }) {
  const [open, setOpen] = useState(false);
  const [weightKg, setWeightKg] = useState("1000");
  const [busy, setBusy] = useState(false);
  const [rates, setRates] = useState<FreightRate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function estimate() {
    const w = Number.parseFloat(weightKg);
    if (!Number.isFinite(w) || w <= 0) {
      setError("Enter a weight in kg");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/freight/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          originCountry: lane.origin.country,
          originState: lane.origin.state,
          destCountry: lane.destination.country,
          destState: lane.destination.state,
          weightKg: w,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Estimate failed (${r.status})`);
      setRates(d.rates ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Estimate failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t border-bg-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] font-semibold text-accent-blue hover:underline"
      >
        {open ? "Hide" : "Estimate"} freight cost for this lane →
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] uppercase tracking-wider text-ink-tertiary">
              Weight (kg)
            </label>
            <input
              type="number"
              min="1"
              step="100"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              className="h-7 w-24 rounded-md border border-bg-border bg-bg-app px-2 text-right text-[12px] tabular-nums"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void estimate()}
              className="rounded-md bg-accent-blue px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Estimating..." : "Get rates"}
            </button>
          </div>
          {error && <div className="text-[11px] text-accent-red">{error}</div>}
          {rates && rates.length > 0 && (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-bg-border text-left text-[10px] uppercase tracking-wider text-ink-tertiary">
                  <th className="py-1">Mode</th>
                  <th className="py-1 text-right">Est. cost</th>
                  <th className="py-1 text-right">Transit (days)</th>
                  <th className="py-1">Source</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.mode} className="border-b border-bg-border/40 last:border-0">
                    <td className="py-1 font-mono text-[11px]">{r.mode}</td>
                    <td className="py-1 text-right font-mono text-accent-green">
                      ${r.estimateUsd.toLocaleString()}
                    </td>
                    <td className="py-1 text-right text-ink-secondary">
                      {r.transitDaysMin}-{r.transitDaysMax}
                    </td>
                    <td className="py-1 text-[10px] text-ink-tertiary">{r.notes ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
