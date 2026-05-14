"use client";
import {
  Building2,
  CheckCircle2,
  Factory,
  Filter,
  Loader2,
  Search,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/Toast";

/**
 * /admin/suppliers/match — Layer 7 Matching Engine UI.
 *
 * Operator (or future buyer) types what they need; we return ranked
 * supplier matches from the registry with a per-bucket score
 * breakdown so they can see WHY each supplier ranked where they did.
 *
 * The matching logic lives in lib/supplierMatching.ts. This page
 * just collects criteria and renders the response.
 */

type SupplierKind = "Manufacturer" | "Wholesaler" | "Distributor" | "Dropship";
type SupplierTier = "unverified" | "basic" | "verified" | "trusted" | "enterprise";

type SupplierRecord = {
  id: string;
  legalName: string;
  email: string;
  phone?: string;
  website?: string;
  country: string;
  state?: string;
  city?: string;
  kind: SupplierKind;
  categories: string[];
  tier: SupplierTier;
  trustScore?: number;
  moq?: number;
  leadTimeDays?: number;
  capacityUnitsPerMo?: number;
};

type MatchScoreBreakdown = {
  total: number;
  trust: number;
  category: number;
  location: number;
  kind: number;
  unverifiedCap: number;
  reasons: string[];
};

type MatchResult = {
  supplier: SupplierRecord;
  breakdown: MatchScoreBreakdown;
};

const TIER_TONE: Record<SupplierTier, string> = {
  unverified: "bg-bg-hover text-ink-tertiary",
  basic:      "bg-accent-blue/15 text-accent-blue",
  verified:   "bg-accent-green/15 text-accent-green",
  trusted:    "bg-brand-500/20 text-brand-200",
  enterprise: "bg-gradient-brand text-white",
};

function bandTone(s: number): string {
  if (s >= 80) return "border-accent-green/30 bg-accent-green/10 text-accent-green";
  if (s >= 60) return "border-accent-blue/30 bg-accent-blue/10 text-accent-blue";
  if (s >= 40) return "border-accent-amber/30 bg-accent-amber/10 text-accent-amber";
  return "border-accent-red/30 bg-accent-red/10 text-accent-red";
}

export default function SupplierMatchPage() {
  const { toast } = useToast();
  const [categories, setCategories] = useState("");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [kind, setKind] = useState<SupplierKind | "">("");
  const [maxMoq, setMaxMoq] = useState("");
  const [maxLeadTimeDays, setMaxLeadTimeDays] = useState("");
  const [minCapacity, setMinCapacity] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<{
    matches: MatchResult[];
    count: number;
    totalSearched: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/suppliers/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: categories.split(",").map((c) => c.trim()).filter(Boolean),
          country: country.trim() || undefined,
          state: state.trim() || undefined,
          city: city.trim() || undefined,
          kind: kind || undefined,
          maxMoq: maxMoq ? Number(maxMoq) : undefined,
          maxLeadTimeDays: maxLeadTimeDays ? Number(maxLeadTimeDays) : undefined,
          minCapacityUnitsPerMo: minCapacity ? Number(minCapacity) : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Match failed (${r.status})`);
      setResult({ matches: d.matches ?? [], count: d.count ?? 0, totalSearched: d.totalSearched ?? 0 });
      if ((d.matches ?? []).length === 0) {
        toast(
          `No matches across ${d.totalSearched ?? 0} suppliers. Try widening categories or removing filters.`,
          "info",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Match failed");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Supplier Matching</h1>
          <p className="text-[12px] text-ink-tertiary">
            Type what you need; we rank verified suppliers from the registry by trust + category +
            location + kind.
          </p>
        </div>
        <Link
          href="/admin/suppliers"
          className="inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-card px-2.5 py-1.5 text-[12px] text-ink-secondary hover:bg-bg-hover"
        >
          ← Back to Registry
        </Link>
      </div>

      {/* Search form */}
      <form
        onSubmit={search}
        className="space-y-3 rounded-2xl border border-bg-border bg-bg-card p-5"
      >
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
          What do you need?
        </div>

        <FormRow label="Categories *">
          <input
            value={categories}
            onChange={(e) => setCategories(e.target.value)}
            placeholder="e.g. roofing, shingles, gutters"
            required
            className="h-10 w-full rounded-md border border-bg-border bg-bg-app px-3 text-sm"
          />
          <div className="mt-1 text-[10px] text-ink-tertiary">
            Comma-separated. Categories match by substring, both directions.
          </div>
        </FormRow>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <FormRow label="Country">
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              maxLength={2}
              placeholder="US"
              className="h-9 w-full rounded-md border border-bg-border bg-bg-app px-3 text-sm uppercase"
            />
          </FormRow>
          <FormRow label="State">
            <input
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              maxLength={2}
              placeholder="TX"
              className="h-9 w-full rounded-md border border-bg-border bg-bg-app px-3 text-sm uppercase"
            />
          </FormRow>
          <FormRow label="City">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="h-9 w-full rounded-md border border-bg-border bg-bg-app px-3 text-sm"
            />
          </FormRow>
          <FormRow label="Kind">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as SupplierKind | "")}
              className="h-9 w-full rounded-md border border-bg-border bg-bg-app px-3 text-sm"
            >
              <option value="">Any</option>
              <option value="Manufacturer">Manufacturer</option>
              <option value="Wholesaler">Wholesaler</option>
              <option value="Distributor">Distributor</option>
              <option value="Dropship">Dropship</option>
            </select>
          </FormRow>
        </div>

        <details className="rounded-md border border-bg-border bg-bg-app p-2 text-[12px]">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
            <Filter className="inline h-3 w-3 mr-1" />
            Operational filters
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <FormRow label="Max MOQ">
              <input
                type="number"
                value={maxMoq}
                onChange={(e) => setMaxMoq(e.target.value)}
                placeholder="500"
                className="h-9 w-full rounded-md border border-bg-border bg-bg-card px-3 text-sm"
              />
            </FormRow>
            <FormRow label="Max lead time (days)">
              <input
                type="number"
                value={maxLeadTimeDays}
                onChange={(e) => setMaxLeadTimeDays(e.target.value)}
                placeholder="30"
                className="h-9 w-full rounded-md border border-bg-border bg-bg-card px-3 text-sm"
              />
            </FormRow>
            <FormRow label="Min monthly capacity">
              <input
                type="number"
                value={minCapacity}
                onChange={(e) => setMinCapacity(e.target.value)}
                placeholder="10000"
                className="h-9 w-full rounded-md border border-bg-border bg-bg-card px-3 text-sm"
              />
            </FormRow>
          </div>
        </details>

        <button
          type="submit"
          disabled={searching || !categories.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-brand px-4 py-2 text-sm font-semibold shadow-glow disabled:opacity-50"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
          Find suppliers
        </button>
      </form>

      {error && (
        <div className="rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div>
          <div className="mb-2 flex items-center justify-between text-[12px] text-ink-tertiary">
            <div>
              {result.count} match{result.count === 1 ? "" : "es"} ranked from {result.totalSearched} suppliers
            </div>
          </div>
          {result.matches.length === 0 ? (
            <div className="rounded-md border border-bg-border bg-bg-card px-4 py-10 text-center text-[12px] text-ink-tertiary">
              No suppliers matched. Try widening the categories, removing the location filter, or
              relaxing the operational filters.
            </div>
          ) : (
            <ol className="space-y-3">
              {result.matches.map((m, i) => (
                <li key={m.supplier.id} className="rounded-xl border border-bg-border bg-bg-card p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bg-hover text-[11px] font-bold text-ink-secondary">
                      #{i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href="/admin/suppliers"
                          className="text-sm font-semibold text-ink-primary hover:text-brand-200 truncate"
                        >
                          {m.supplier.legalName}
                        </Link>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold capitalize ${TIER_TONE[m.supplier.tier]}`}
                        >
                          {m.supplier.tier}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-bg-hover px-2 py-0.5 text-[10px] text-ink-secondary">
                          <Factory className="h-3 w-3" />
                          {m.supplier.kind}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-tertiary">
                        <Building2 className="inline h-3 w-3 mr-1" />
                        {m.supplier.city ? `${m.supplier.city}, ` : ""}
                        {m.supplier.state ? `${m.supplier.state}, ` : ""}
                        {m.supplier.country}
                      </div>
                      {m.supplier.categories.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {m.supplier.categories.map((c) => (
                            <span key={c} className="rounded-md bg-bg-hover px-1.5 py-0.5 text-[10px] text-ink-secondary">
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div
                      className={`rounded-lg border px-3 py-1.5 text-right ${bandTone(m.breakdown.total)}`}
                    >
                      <div className="text-[9px] font-semibold uppercase tracking-wider opacity-80">
                        Match
                      </div>
                      <div className="text-2xl font-bold leading-none">
                        {m.breakdown.total}
                        <span className="ml-0.5 text-xs opacity-70">/100</span>
                      </div>
                    </div>
                  </div>

                  {/* Score breakdown */}
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    <Bucket label="Trust" value={m.breakdown.trust} max={40} />
                    <Bucket label="Category" value={m.breakdown.category} max={30} />
                    <Bucket label="Location" value={m.breakdown.location} max={20} />
                    <Bucket label="Kind" value={m.breakdown.kind} max={10} />
                  </div>

                  <div className="mt-2 text-[10px] text-ink-tertiary">
                    {m.breakdown.reasons.join(" · ")}
                  </div>

                  {(m.supplier.moq != null || m.supplier.leadTimeDays != null || m.supplier.capacityUnitsPerMo != null) && (
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-ink-secondary">
                      {m.supplier.moq != null && <span>MOQ {m.supplier.moq}</span>}
                      {m.supplier.leadTimeDays != null && <span>Lead time {m.supplier.leadTimeDays}d</span>}
                      {m.supplier.capacityUnitsPerMo != null && <span>Cap {m.supplier.capacityUnitsPerMo.toLocaleString()}/mo</span>}
                      {m.supplier.trustScore != null && (
                        <span>
                          <CheckCircle2 className="inline h-3 w-3 mr-0.5 text-accent-green" />
                          Trust {m.supplier.trustScore}/100
                        </span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {!result && !searching && (
        <div className="rounded-md border border-bg-border bg-bg-card px-4 py-10 text-center text-[12px] text-ink-tertiary">
          <Search className="mx-auto mb-2 h-5 w-5 opacity-50" />
          Enter a category and click <strong>Find suppliers</strong> to see ranked matches.
        </div>
      )}
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
        {label}
      </div>
      {children}
    </label>
  );
}

function Bucket({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const tone = value > 0 ? "text-ink-primary" : "text-ink-tertiary";
  return (
    <div className="rounded-md border border-bg-border bg-bg-app px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className={`mt-0.5 text-sm font-bold ${tone}`}>
        {value}
        <span className="ml-0.5 text-[9px] font-normal opacity-60">/{max}</span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-bg-hover">
        <div
          className="h-full rounded-full bg-brand-400"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
