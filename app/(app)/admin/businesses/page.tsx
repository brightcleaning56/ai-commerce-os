"use client";
import {
  AlertCircle,
  Brain,
  Building2,
  CheckCircle2,
  Compass,
  Database,
  GitBranch,
  Loader2,
  MapPin,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";

type BusinessStatus =
  | "active"
  | "queued"
  | "contacted"
  | "responded"
  | "won"
  | "lost"
  | "do_not_contact";

type BusinessSource =
  | "manual"
  | "csv_import"
  | "lead_promote"
  | "agent_discover"
  | "data_axle"
  | "google_places"
  | "census";

type SupplyEdgeKind = "sources_from" | "distributes_through" | "competes_with" | "partners_with";
type SupplyEdgeSource = "ai_profile" | "transaction" | "operator" | "partner";

type SupplyEdge = {
  id: string;
  fromBusinessId: string;
  fromBusinessName: string;
  toName: string;
  toBusinessId?: string;
  kind: SupplyEdgeKind;
  source: SupplyEdgeSource;
  confidence: number;
  evidence?: string;
  observedAt: string;
  lastSeenAt: string;
  alternativesFound?: number;
};

type EdgesPayload = {
  businessId: string;
  businessName: string;
  totalEdges: number;
  byKind: Record<SupplyEdgeKind, SupplyEdge[]>;
};

type AiProfile = {
  scannedAt: string;
  homepageUrl?: string;
  productsSold: string[];
  likelySupplierBrands: string[];
  likelyDistributors: string[];
  industryRefined?: string;
  summary?: string;
  confidence: number;
  modelUsed: string;
  estCostUsd?: number;
  fetchError?: string;
  usedFallback: boolean;
};

type BusinessRecord = {
  id: string;
  name: string;
  legalName?: string;
  email?: string;
  phone?: string;
  website?: string;
  address1?: string;
  city?: string;
  county?: string;
  state?: string;
  zip?: string;
  country: string;
  industry?: string;
  naicsCode?: string;
  employeesBand?: string;
  revenueBand?: string;
  contactName?: string;
  contactTitle?: string;
  status: BusinessStatus;
  source: BusinessSource;
  notes?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  lastContactedAt?: string;
  outreachCount?: number;
  doNotContact?: boolean;
  aiProfile?: AiProfile;
};

type Counts = {
  byStatus: Record<string, number>;
  byState: Record<string, number>;
};

type ListResponse = {
  businesses: BusinessRecord[];
  total: number;
  filteredTotal: number;
  counts: Counts;
};

type ImportResponse = {
  ok: boolean;
  totalRows: number;
  parsed: number;
  rejected: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: { lineNumber: number; error: string }[];
  errorTruncated?: boolean;
};

const STATUS_TONE: Record<BusinessStatus, string> = {
  active: "bg-bg-hover text-ink-secondary",
  queued: "bg-accent-blue/15 text-accent-blue",
  contacted: "bg-brand-500/15 text-brand-200",
  responded: "bg-accent-cyan/15 text-accent-cyan",
  won: "bg-accent-green/15 text-accent-green",
  lost: "bg-bg-hover text-ink-tertiary",
  do_not_contact: "bg-accent-red/15 text-accent-red",
};

const STATUSES: BusinessStatus[] = [
  "active",
  "queued",
  "contacted",
  "responded",
  "won",
  "lost",
  "do_not_contact",
];

const SOURCE_LABEL: Record<BusinessSource, string> = {
  manual: "Manual",
  csv_import: "CSV import",
  lead_promote: "Lead → Buyer",
  agent_discover: "Agent",
  data_axle: "Data Axle",
  google_places: "Google Places",
  census: "Census",
};

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 30 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function BusinessesPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<BusinessStatus | "">("");
  const [zipFilter, setZipFilter] = useState("");

  const [importOpen, setImportOpen] = useState(false);
  const [openDiscover, setOpenDiscover] = useState(false);
  const [importCsv, setImportCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);

  const [selected, setSelected] = useState<BusinessRecord | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [draftingOutreach, setDraftingOutreach] = useState(false);
  const [scanningProfile, setScanningProfile] = useState<string | null>(null);
  const [batchScanning, setBatchScanning] = useState(false);
  const [edges, setEdges] = useState<EdgesPayload | null>(null);
  const [loadingEdges, setLoadingEdges] = useState(false);
  const { toast } = useToast();

  // Max batch size matches the endpoint's MAX_BUSINESSES_PER_BATCH.
  // Operator can run the action multiple times for larger campaigns.
  const MAX_BATCH = 25;
  // Profile-batch endpoint is capped lower (homepage fetch + Claude per row).
  const MAX_PROFILE_BATCH = 10;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (stateFilter) params.set("state", stateFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (zipFilter) params.set("zip", zipFilter);
      const r = await fetch(`/api/admin/businesses?${params}`, { cache: "no-store" });
      if (r.status === 401) {
        setLoadError("Not signed in — visit /signin and try again.");
        return;
      }
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setLoadError(`API returned ${r.status}: ${body.error ?? r.statusText}`);
        return;
      }
      setData(await r.json());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [q, stateFilter, statusFilter, zipFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Lazy-load edges for the selected business — keeps the list page fast
  // (edges file can grow large) and gets fresh data after every profile scan.
  useEffect(() => {
    if (!selected) {
      setEdges(null);
      return;
    }
    let cancelled = false;
    async function loadEdges(id: string) {
      setLoadingEdges(true);
      try {
        const r = await fetch(`/api/admin/businesses/${id}/edges`, { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as EdgesPayload;
        if (!cancelled) setEdges(d);
      } catch {
        // Silent — UI shows "no edges yet" if this fails.
      } finally {
        if (!cancelled) setLoadingEdges(false);
      }
    }
    loadEdges(selected.id);
    return () => { cancelled = true; };
  }, [selected]);

  async function deleteEdge(edgeId: string) {
    if (!confirm("Delete this edge from the graph?")) return;
    try {
      const r = await fetch(`/api/admin/edges/${edgeId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`Delete failed (${r.status})`);
      toast("Edge deleted");
      // Reload edges for current selection
      if (selected) {
        const re = await fetch(`/api/admin/businesses/${selected.id}/edges`, { cache: "no-store" });
        if (re.ok) setEdges(await re.json());
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Edge delete failed", "error");
    }
  }

  async function submitImport() {
    if (!importCsv.trim() || importing) return;
    setImporting(true);
    setImportResult(null);
    try {
      const r = await fetch("/api/admin/businesses/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: importCsv }),
      });
      const d = (await r.json()) as ImportResponse | { error: string };
      if (!r.ok) throw new Error(("error" in d && d.error) || `Import failed (${r.status})`);
      setImportResult(d as ImportResponse);
      toast(
        `Imported ${(d as ImportResponse).inserted} new + ${(d as ImportResponse).updated} updated`,
        "success",
      );
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Import failed", "error");
    } finally {
      setImporting(false);
    }
  }

  async function deleteOne(b: BusinessRecord) {
    if (!confirm(`Delete "${b.name}"? Use Status: do_not_contact to keep audit trail instead.`)) return;
    try {
      const r = await fetch(`/api/admin/businesses/${b.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`Delete failed (${r.status})`);
      toast(`Deleted ${b.name}`, "success");
      if (selected?.id === b.id) setSelected(null);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete failed", "error");
    }
  }

  async function setStatus(b: BusinessRecord, next: BusinessStatus) {
    try {
      const r = await fetch(`/api/admin/businesses/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Update failed (${r.status})`);
      toast(`Marked ${next}`);
      if (selected?.id === b.id) setSelected(d.business);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "error");
    }
  }

  function toggleChecked(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_BATCH) next.add(id);
      else toast(`Batch capped at ${MAX_BATCH} — run the action and select more after.`, "info");
      return next;
    });
  }

  function selectAllVisible() {
    if (!data) return;
    setChecked((prev) => {
      const next = new Set(prev);
      for (const b of data.businesses) {
        if (next.size >= MAX_BATCH) break;
        // Don't auto-pick suppressed rows — they'd just be skipped server-side.
        if (b.status === "do_not_contact" || b.doNotContact) continue;
        next.add(b.id);
      }
      return next;
    });
  }

  function clearChecked() {
    setChecked(new Set());
  }

  async function draftOutreachForChecked() {
    const ids = Array.from(checked);
    if (ids.length === 0) return;
    setDraftingOutreach(true);
    try {
      const r = await fetch("/api/admin/businesses/draft-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessIds: ids }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Draft outreach failed (${r.status})`);
      const drafted = d.drafted ?? 0;
      const skipped = d.skipped ?? 0;
      const errored = d.errored ?? 0;
      toast(
        `Drafted ${drafted}${skipped ? ` · skipped ${skipped}` : ""}${errored ? ` · errored ${errored}` : ""} — review in /outreach`,
        drafted > 0 ? "success" : "info",
      );
      setChecked(new Set());
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Draft outreach failed", "error");
    } finally {
      setDraftingOutreach(false);
    }
  }

  async function runProfileScanOne(b: BusinessRecord) {
    if (scanningProfile) return;
    if (!b.website) {
      toast("No website on record — add one to enable profile scan", "info");
      return;
    }
    setScanningProfile(b.id);
    try {
      const r = await fetch(`/api/admin/businesses/${b.id}/profile`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Scan failed (${r.status})`);
      const conf = d.profile?.confidence ?? 0;
      const products = d.profile?.productsSold?.length ?? 0;
      toast(
        d.profile?.fetchError
          ? `Scan failed: ${d.profile.fetchError}`
          : `Profile scanned — ${products} products found · ${conf}% confidence`,
        d.profile?.fetchError ? "error" : "success",
      );
      // Update local selected if open
      if (selected?.id === b.id) {
        setSelected({ ...selected, aiProfile: d.profile });
      }
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Profile scan failed", "error");
    } finally {
      setScanningProfile(null);
    }
  }

  async function runProfileScanBatch() {
    const ids = Array.from(checked).slice(0, MAX_PROFILE_BATCH);
    if (ids.length === 0) return;
    setBatchScanning(true);
    try {
      const r = await fetch("/api/admin/businesses/profile-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessIds: ids }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Batch scan failed (${r.status})`);
      const scanned = d.scanned ?? 0;
      const skipped = d.skipped ?? 0;
      const errored = d.errored ?? 0;
      toast(
        `Scanned ${scanned}${skipped ? ` · skipped ${skipped}` : ""}${errored ? ` · errored ${errored}` : ""}`,
        scanned > 0 ? "success" : "info",
      );
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Batch scan failed", "error");
    } finally {
      setBatchScanning(false);
    }
  }

  const tilesData = useMemo(() => {
    const total = data?.total ?? 0;
    const byStatus = data?.counts.byStatus ?? {};
    return [
      { k: "Total businesses", v: total, hint: undefined as string | undefined, statusKey: "" as BusinessStatus | "", href: undefined as string | undefined },
      { k: "Active", v: byStatus.active ?? 0, hint: "eligible for outreach", statusKey: "active" as BusinessStatus | "", href: undefined as string | undefined },
      { k: "Contacted", v: (byStatus.contacted ?? 0) + (byStatus.responded ?? 0), hint: "in flight", statusKey: "contacted" as BusinessStatus | "", href: undefined as string | undefined },
      { k: "DNC", v: byStatus.do_not_contact ?? 0, hint: "suppressed", statusKey: "do_not_contact" as BusinessStatus | "", href: "/admin/suppressions" as string | undefined },
    ];
  }, [data]);

  const stateOptions = useMemo(() => {
    const states = Object.keys(data?.counts.byState ?? {}).sort();
    return states;
  }, [data]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand shadow-glow">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Business Directory</h1>
            <p className="text-xs text-ink-secondary">
              {data?.total === 0
                ? "No businesses yet — import a CSV or add one to get started"
                : `${data?.filteredTotal ?? 0} of ${data?.total ?? 0} businesses · grouped by state, ZIP, industry`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpenDiscover(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-2 text-sm font-semibold text-brand-200 hover:bg-brand-500/20"
            title="Find real US businesses from USAspending.gov + Google Places"
          >
            <Compass className="h-4 w-4" /> Discover
          </button>
          <button
            onClick={() => setImportOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover"
          >
            <Upload className="h-4 w-4" /> Import CSV
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-gradient-brand px-3 py-2 text-sm font-medium shadow-glow disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/5 px-4 py-3">
        <div className="flex items-start gap-3 text-[12px]">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-amber/15">
            <AlertCircle className="h-3.5 w-3.5 text-accent-amber" />
          </div>
          <div className="flex-1 text-ink-secondary">
            <span className="font-semibold text-accent-amber">Slice 1 of the Business Network Intelligence build</span>
            {" "}— this directory is the foundation. Today: store + import. Coming next: AI profile scan,
            geo-targeted outreach gated by suppression checks, supply-edge graph from real transactions,
            then optional Data Axle / Google Places / Census ingestion.
          </div>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-accent-red/40 bg-accent-red/5 px-4 py-3 text-xs text-accent-red">
          <strong className="font-semibold">Couldn&apos;t load directory:</strong> {loadError}
        </div>
      )}

      {/* Tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tilesData.map((t) => {
          const body = (
            <>
              <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{t.k}</div>
              <div className="mt-1 text-2xl font-bold">{t.v.toLocaleString()}</div>
              {t.hint && <div className="text-[10px] text-ink-tertiary">{t.hint}</div>}
            </>
          );
          if (t.href) {
            return (
              <Link
                key={t.k}
                href={t.href}
                className="group block rounded-xl border border-bg-border bg-bg-card p-4 ring-1 ring-transparent transition-all hover:bg-bg-hover hover:ring-brand-500/40"
              >
                {body}
              </Link>
            );
          }
          if (t.statusKey !== undefined) {
            const active = statusFilter === t.statusKey;
            return (
              <button
                key={t.k}
                type="button"
                onClick={() => setStatusFilter(t.statusKey)}
                className={`group block w-full rounded-xl border border-bg-border bg-bg-card p-4 text-left ring-1 transition-all hover:bg-bg-hover hover:ring-brand-500/40 ${active ? "ring-brand-500/60" : "ring-transparent"}`}
              >
                {body}
              </button>
            );
          }
          return (
            <div key={t.k} className="rounded-xl border border-bg-border bg-bg-card p-4">
              {body}
            </div>
          );
        })}
      </div>

      {/* Import drawer */}
      {importOpen && (
        <div className="rounded-xl border border-brand-500/40 bg-gradient-to-br from-brand-500/5 to-transparent p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Import CSV</div>
            <button
              onClick={() => { setImportOpen(false); setImportResult(null); setImportCsv(""); }}
              className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
              aria-label="Close import"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1 text-[11px] text-ink-tertiary">
            Paste raw CSV (header row required). The importer maps common synonyms automatically:
            {" "}<code className="rounded bg-bg-hover px-1">name|company|business</code>,
            {" "}<code className="rounded bg-bg-hover px-1">email|contact_email</code>,
            {" "}<code className="rounded bg-bg-hover px-1">phone|tel</code>,
            {" "}<code className="rounded bg-bg-hover px-1">zip|postal_code</code>,
            {" "}<code className="rounded bg-bg-hover px-1">state|province</code>, and many more.
            Only <code className="rounded bg-bg-hover px-1">name</code> is required.
            Dedups on email, then (name+zip), then (name+city).
          </p>
          <textarea
            value={importCsv}
            onChange={(e) => setImportCsv(e.target.value)}
            placeholder="name,email,city,state,zip,industry&#10;Acme Roofing,sales@acmeroofing.com,Dallas,TX,75201,Roofing"
            rows={8}
            className="mt-3 w-full rounded-lg border border-bg-border bg-bg-app p-3 font-mono text-[11px] placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={submitImport}
              disabled={importing || !importCsv.trim()}
              className="flex items-center gap-2 rounded-lg bg-gradient-brand px-4 py-2 text-sm font-semibold shadow-glow disabled:opacity-60"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import
            </button>
            <span className="text-[10px] text-ink-tertiary">
              {importCsv ? `${(importCsv.length / 1024).toFixed(1)} KB · ${(importCsv.match(/\n/g)?.length ?? 0) + 1} lines` : "0 lines"}
            </span>
          </div>
          {importResult && (
            <div className="mt-3 rounded-lg border border-accent-green/30 bg-accent-green/5 p-3 text-[12px]">
              <div className="font-semibold text-accent-green">
                Done · {importResult.inserted} inserted · {importResult.updated} updated · {importResult.skipped} skipped · {importResult.rejected} rejected
              </div>
              {importResult.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-[11px] font-semibold text-ink-secondary">Rejected rows:</div>
                  {importResult.errors.map((err, i) => (
                    <div key={i} className="font-mono text-[11px] text-ink-tertiary">
                      Line {err.lineNumber}: {err.error}
                    </div>
                  ))}
                  {importResult.errorTruncated && (
                    <div className="text-[10px] italic text-ink-tertiary">
                      (more errors hidden — fix these and re-import)
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, website, notes…"
            className="h-9 w-full rounded-lg border border-bg-border bg-bg-card pl-9 pr-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
          />
        </div>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="h-9 rounded-lg border border-bg-border bg-bg-card px-3 text-sm"
        >
          <option value="">All states</option>
          {stateOptions.map((s) => (
            <option key={s} value={s}>{s} ({data?.counts.byState[s]})</option>
          ))}
        </select>
        <input
          value={zipFilter}
          onChange={(e) => setZipFilter(e.target.value)}
          placeholder="ZIP prefix"
          className="h-9 w-32 rounded-lg border border-bg-border bg-bg-card px-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as BusinessStatus | "")}
          className="h-9 rounded-lg border border-bg-border bg-bg-card px-3 text-sm"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s} ({data?.counts.byStatus[s] ?? 0})</option>
          ))}
        </select>
      </div>

      {/* Bulk action bar — only renders when at least one row is checked */}
      {checked.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-500/40 bg-gradient-to-r from-brand-500/10 to-transparent px-4 py-3">
          <div className="text-[12px]">
            <span className="font-semibold text-brand-200">{checked.size}</span>
            <span className="text-ink-secondary"> selected</span>
            <span className="text-ink-tertiary"> · batch cap {MAX_BATCH}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={selectAllVisible}
              disabled={!data || data.businesses.length === 0}
              className="rounded-lg border border-bg-border bg-bg-card px-3 py-1.5 text-[11px] hover:bg-bg-hover disabled:opacity-60"
            >
              Select all visible
            </button>
            <button
              onClick={clearChecked}
              className="rounded-lg border border-bg-border bg-bg-card px-3 py-1.5 text-[11px] hover:bg-bg-hover"
            >
              Clear
            </button>
            <button
              onClick={runProfileScanBatch}
              disabled={batchScanning || checked.size === 0}
              title={`Run the AI Profile Scan on up to ${MAX_PROFILE_BATCH} selected at a time. Fetches each homepage, extracts products + suppliers + distributors via Claude. ~$0.003 per scan.`}
              className="flex items-center gap-2 rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-1.5 text-[11px] hover:bg-brand-500/20 disabled:opacity-60"
            >
              {batchScanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
              Profile scan (≤{MAX_PROFILE_BATCH})
            </button>
            <button
              onClick={draftOutreachForChecked}
              disabled={draftingOutreach || checked.size === 0}
              title="Generate a personalized AVYN-onboarding draft per business. Suppressed (DNC) rows are skipped server-side. Drafts land in /outreach for review before send."
              className="flex items-center gap-2 rounded-lg bg-gradient-brand px-4 py-1.5 text-[12px] font-semibold shadow-glow disabled:opacity-60"
            >
              {draftingOutreach ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Draft outreach for {checked.size}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-bg-border bg-bg-card">
          {data === null && !loadError ? (
            <div className="flex items-center gap-2 px-5 py-8 text-[12px] text-ink-tertiary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading…
            </div>
          ) : data && data.businesses.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Database className="mx-auto h-8 w-8 text-ink-tertiary" />
              <div className="mt-3 text-base font-semibold">
                {data.total === 0 ? "No businesses yet" : "No matches"}
              </div>
              <p className="mt-1 text-xs text-ink-tertiary">
                {data.total === 0
                  ? <>Click <strong>Import CSV</strong> above to seed the directory from a spreadsheet, or POST a single record to <code className="rounded bg-bg-hover px-1">/api/admin/businesses</code>.</>
                  : "Adjust filters or clear them to see more."
                }
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-ink-tertiary">
                  <tr className="border-b border-bg-border">
                    <th className="w-8 px-3 py-2.5 text-left font-medium">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium">Business</th>
                    <th className="px-3 py-2.5 text-left font-medium">Location</th>
                    <th className="px-3 py-2.5 text-left font-medium">Industry</th>
                    <th className="px-3 py-2.5 text-left font-medium">Status</th>
                    <th className="px-3 py-2.5 text-left font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.businesses ?? []).map((b) => {
                    const active = selected?.id === b.id;
                    const isChecked = checked.has(b.id);
                    const suppressed = b.status === "do_not_contact" || b.doNotContact;
                    return (
                      <tr
                        key={b.id}
                        onClick={() => setSelected(b)}
                        className={`cursor-pointer border-t border-bg-border hover:bg-bg-hover/30 ${active ? "bg-bg-hover/40" : ""}`}
                      >
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={suppressed}
                            onChange={() => toggleChecked(b.id)}
                            className="h-3.5 w-3.5 cursor-pointer accent-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
                            title={suppressed ? "Suppressed (DNC) — can't include in outreach" : "Select for bulk action"}
                            aria-label={`Select ${b.name}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{b.name}</span>
                            {b.aiProfile && b.aiProfile.confidence >= 30 && !b.aiProfile.fetchError && (
                              <span
                                title={`AI profile scanned · ${b.aiProfile.confidence}% confidence`}
                                className="flex items-center gap-0.5 rounded bg-brand-500/15 px-1 py-0.5 text-[9px] font-semibold text-brand-200"
                              >
                                <Brain className="h-2.5 w-2.5" />
                                {b.aiProfile.confidence}
                              </span>
                            )}
                          </div>
                          {b.email && (
                            <div className="text-[11px] text-ink-tertiary">{b.email}</div>
                          )}
                          {!b.email && b.website && (
                            <div className="text-[11px] text-ink-tertiary">{b.website}</div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-ink-secondary">
                          <div className="flex items-center gap-1 text-[12px]">
                            {b.state || b.city ? (
                              <>
                                <MapPin className="h-3 w-3 text-ink-tertiary" />
                                {b.city ? `${b.city}, ` : ""}{b.state ?? ""}
                                {b.zip && <span className="ml-1 text-[10px] text-ink-tertiary">{b.zip}</span>}
                              </>
                            ) : (
                              <span className="text-ink-tertiary">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-ink-secondary text-[12px]">
                          {b.industry ?? <span className="text-ink-tertiary">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[b.status]}`}>
                            {b.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-[11px] text-ink-tertiary">
                          {SOURCE_LABEL[b.source]}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {data && data.filteredTotal > data.businesses.length && (
                <div className="border-t border-bg-border px-4 py-2 text-center text-[10px] text-ink-tertiary">
                  Showing first {data.businesses.length} of {data.filteredTotal} matching · refine filters or paginate
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <aside className="rounded-xl border border-bg-border bg-bg-card p-5">
          {selected ? (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Business</div>
                <div className="text-lg font-bold">{selected.name}</div>
                {selected.legalName && (
                  <div className="text-[11px] text-ink-tertiary">Legal: {selected.legalName}</div>
                )}
              </div>

              <div className="space-y-1.5 text-[12px]">
                {selected.email && <Field k="Email" v={selected.email} />}
                {selected.phone && <Field k="Phone" v={selected.phone} />}
                {selected.website && (
                  <Field k="Website" v={
                    <a href={`https://${selected.website.replace(/^https?:\/\//, "")}`} target="_blank" rel="noopener noreferrer" className="text-brand-300 hover:underline">
                      {selected.website}
                    </a>
                  } />
                )}
                {(selected.address1 || selected.city) && (
                  <Field k="Address" v={[selected.address1, selected.city, selected.state, selected.zip].filter(Boolean).join(", ")} />
                )}
                {selected.industry && <Field k="Industry" v={selected.industry} />}
                {selected.naicsCode && <Field k="NAICS" v={selected.naicsCode} />}
                {selected.employeesBand && <Field k="Employees" v={selected.employeesBand} />}
                {selected.revenueBand && <Field k="Revenue" v={selected.revenueBand} />}
                {selected.contactName && (
                  <Field k="Contact" v={`${selected.contactName}${selected.contactTitle ? ` · ${selected.contactTitle}` : ""}`} />
                )}
                <Field k="Source" v={SOURCE_LABEL[selected.source]} />
                <Field k="Created" v={relTime(selected.createdAt)} />
                {selected.lastContactedAt && (
                  <Field k="Last contacted" v={relTime(selected.lastContactedAt)} />
                )}
                {selected.outreachCount && selected.outreachCount > 0 && (
                  <Field k="Outreach attempts" v={String(selected.outreachCount)} />
                )}
              </div>

              {/* AI Profile Scan — shown when present + button to (re)run */}
              <div className="rounded-lg border border-brand-500/30 bg-gradient-to-br from-brand-500/5 to-transparent p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-brand-200">
                    <Brain className="h-3.5 w-3.5" />
                    AI Profile Scan
                    {selected.aiProfile && (
                      <span className="text-[10px] font-normal text-ink-tertiary">
                        · {selected.aiProfile.confidence}% confidence
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => runProfileScanOne(selected)}
                    disabled={scanningProfile === selected.id || !selected.website}
                    title={!selected.website ? "Needs a website on the record" : "Re-run the homepage fetch + AI extraction"}
                    className="flex items-center gap-1 rounded-md border border-bg-border bg-bg-card px-2 py-1 text-[10px] hover:bg-bg-hover disabled:opacity-60"
                  >
                    {scanningProfile === selected.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    {selected.aiProfile ? "Re-scan" : "Run scan"}
                  </button>
                </div>

                {!selected.aiProfile ? (
                  <p className="mt-2 text-[11px] text-ink-tertiary">
                    {selected.website
                      ? <>No scan yet. Click <strong>Run scan</strong> to fetch the homepage + extract products / suppliers / distributors via Claude (~$0.003).</>
                      : "Add a website to the record first — the scan reads from the homepage."}
                  </p>
                ) : selected.aiProfile.fetchError ? (
                  <div className="mt-2 rounded-md border border-accent-red/30 bg-accent-red/5 px-2 py-1.5 text-[11px] text-accent-red">
                    Scan failed: {selected.aiProfile.fetchError}
                  </div>
                ) : (
                  <div className="mt-2 space-y-2 text-[11px]">
                    {selected.aiProfile.summary && (
                      <p className="text-ink-secondary">{selected.aiProfile.summary}</p>
                    )}
                    {selected.aiProfile.industryRefined && selected.aiProfile.industryRefined !== selected.industry && (
                      <div className="text-ink-tertiary">
                        <span className="font-semibold text-ink-secondary">Refined:</span> {selected.aiProfile.industryRefined}
                      </div>
                    )}
                    {selected.aiProfile.productsSold.length > 0 && (
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-ink-tertiary">Sells</div>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {selected.aiProfile.productsSold.map((p) => (
                            <span key={p} className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] text-brand-200">{p}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selected.aiProfile.likelySupplierBrands.length > 0 && (
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-ink-tertiary">Likely buys from</div>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {selected.aiProfile.likelySupplierBrands.map((b) => (
                            <span key={b} className="rounded bg-accent-amber/15 px-1.5 py-0.5 text-[10px] text-accent-amber">{b}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selected.aiProfile.likelyDistributors.length > 0 && (
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-ink-tertiary">Sells through</div>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {selected.aiProfile.likelyDistributors.map((d) => (
                            <span key={d} className="rounded bg-accent-cyan/15 px-1.5 py-0.5 text-[10px] text-accent-cyan">{d}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="text-[10px] text-ink-tertiary">
                      Scanned {relTime(selected.aiProfile.scannedAt)}
                      {selected.aiProfile.estCostUsd && ` · $${selected.aiProfile.estCostUsd.toFixed(4)}`}
                      {selected.aiProfile.usedFallback && " · fallback (no Anthropic)"}
                    </div>
                  </div>
                )}
              </div>

              {/* Supply graph — observed + inferred relationships */}
              <div className="rounded-lg border border-accent-cyan/30 bg-gradient-to-br from-accent-cyan/5 to-transparent p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-accent-cyan">
                    <GitBranch className="h-3.5 w-3.5" />
                    Supply graph
                    {edges && (
                      <span className="text-[10px] font-normal text-ink-tertiary">
                        · {edges.totalEdges} edge{edges.totalEdges === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  {loadingEdges && <Loader2 className="h-3 w-3 animate-spin text-ink-tertiary" />}
                </div>

                {!edges || edges.totalEdges === 0 ? (
                  <p className="mt-2 text-[11px] text-ink-tertiary">
                    {selected.aiProfile && selected.aiProfile.confidence >= 30
                      ? "No edges yet — re-run the profile scan to seed."
                      : <>No edges yet. Edges appear here when a Profile Scan extracts supplier/distributor signals (confidence ≥ 30) or when a real transaction closes on AVYN.</>
                    }
                  </p>
                ) : (
                  <div className="mt-2 space-y-2.5">
                    {edges.byKind.sources_from.length > 0 && (
                      <EdgeGroup
                        title="Sources from"
                        hint="Suppliers this business likely buys from"
                        edges={edges.byKind.sources_from}
                        onDelete={deleteEdge}
                        kindTone="amber"
                      />
                    )}
                    {edges.byKind.distributes_through.length > 0 && (
                      <EdgeGroup
                        title="Distributes through"
                        hint="Channels this business sells through"
                        edges={edges.byKind.distributes_through}
                        onDelete={deleteEdge}
                        kindTone="cyan"
                      />
                    )}
                    {edges.byKind.partners_with.length > 0 && (
                      <EdgeGroup
                        title="Partners with"
                        hint=""
                        edges={edges.byKind.partners_with}
                        onDelete={deleteEdge}
                        kindTone="brand"
                      />
                    )}
                    {edges.byKind.competes_with.length > 0 && (
                      <EdgeGroup
                        title="Competes with"
                        hint=""
                        edges={edges.byKind.competes_with}
                        onDelete={deleteEdge}
                        kindTone="ink"
                      />
                    )}
                  </div>
                )}
                <div className="mt-2 text-[10px] text-ink-tertiary">
                  Sources: <span className="text-accent-green">transaction</span> (highest signal),{" "}
                  <span className="text-brand-200">operator</span>,{" "}
                  <span className="text-ink-secondary">ai_profile</span>,{" "}
                  <span className="text-ink-secondary">partner</span>
                </div>
              </div>

              {selected.notes && (
                <div className="rounded-lg border border-bg-border bg-bg-hover/30 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Notes</div>
                  <p className="mt-1 whitespace-pre-wrap text-[12px] text-ink-secondary">{selected.notes}</p>
                </div>
              )}

              {selected.tags && selected.tags.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-tertiary">Tags</div>
                  <div className="flex flex-wrap gap-1">
                    {selected.tags.map((t) => (
                      <span key={t} className="rounded bg-bg-hover px-1.5 py-0.5 text-[10px] text-ink-secondary">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="mb-1.5 text-[10px] uppercase tracking-wider text-ink-tertiary">Status</div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map((s) => {
                    const active = selected.status === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setStatus(selected, s)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                          active ? STATUS_TONE[s] : "border border-bg-border bg-bg-hover/40 text-ink-secondary hover:bg-bg-hover"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => deleteOne(selected)}
                className="flex items-center gap-2 rounded-md border border-accent-red/30 bg-accent-red/5 px-3 py-1.5 text-[11px] text-accent-red hover:bg-accent-red/10"
              >
                <Trash2 className="h-3 w-3" /> Delete record
              </button>
            </div>
          ) : (
            <div className="grid h-full place-items-center px-3 py-12 text-center text-xs text-ink-tertiary">
              Select a business to see the full record and update status.
            </div>
          )}
        </aside>
      </div>

      {openDiscover && (
        <BusinessDiscoverModal
          onClose={() => setOpenDiscover(false)}
          onImported={async () => {
            await load();
          }}
        />
      )}
    </div>
  );
}

type DiscoveryCandidate = {
  externalId: string | null;
  source: "usaspending" | "google_places";
  name: string;
  country: string;
  state?: string;
  city?: string;
  zip?: string;
  address1?: string;
  phone?: string;
  website?: string;
  email?: string;
  naicsCode?: string;
  industryHint?: string;
  ratingHint?: number;
  evidence: string;
  largestAwardUsd?: number;
  totalAwardUsd?: number;
};

type DiscoveryResult = {
  source: "usaspending" | "google_places";
  candidates: DiscoveryCandidate[];
  fetchedAt: string;
  totalMatches?: number;
  error?: string;
};

function BusinessDiscoverModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [source, setSource] = useState<"google_places" | "usaspending">("google_places");
  // Google Places fields
  const [textQuery, setTextQuery] = useState("");
  // USAspending fields
  const [naicsCode, setNaicsCode] = useState("");
  const [state, setState] = useState("");
  // Common
  const [limit, setLimit] = useState(25);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function candidateKey(c: DiscoveryCandidate): string {
    return c.externalId || `${c.source}:${c.name.toUpperCase()}`;
  }

  async function search() {
    setSearching(true);
    setError(null);
    setResult(null);
    setSelected(new Set());
    try {
      const r = await fetch("/api/admin/businesses/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          query: source === "google_places"
            ? { textQuery, limit }
            : { naicsCode: naicsCode || undefined, state: state || undefined, limit },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Discover failed (${r.status})`);
      setResult(d as DiscoveryResult);
      if (d.error) setError(d.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discover failed");
    } finally {
      setSearching(false);
    }
  }

  function toggle(c: DiscoveryCandidate) {
    const key = candidateKey(c);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleAll() {
    if (!result) return;
    if (selected.size === result.candidates.length) setSelected(new Set());
    else setSelected(new Set(result.candidates.map(candidateKey)));
  }

  async function importSelected() {
    if (!result || selected.size === 0) return;
    setImporting(true);
    let successes = 0;
    let dupes = 0;
    let failures = 0;
    try {
      for (const c of result.candidates) {
        if (!selected.has(candidateKey(c))) continue;
        try {
          const r = await fetch("/api/admin/businesses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: c.name,
              country: c.country || "US",
              state: c.state,
              city: c.city,
              zip: c.zip,
              address1: c.address1,
              phone: c.phone,
              website: c.website,
              email: c.email,
              industry: c.industryHint,
              naicsCode: c.naicsCode,
              source: c.source,                    // "google_places" | "usaspending" → mapped to BusinessSource
              externalId: c.externalId ?? undefined,
              externalIdSource: c.source,
              notes: `Discovery import (${c.source}): ${c.evidence}`,
              status: "active",
            }),
          });
          if (!r.ok) {
            failures += 1;
            continue;
          }
          const d = await r.json().catch(() => ({}));
          if (d.alreadyExisted) dupes += 1;
          else successes += 1;
        } catch {
          failures += 1;
        }
      }
      const parts = [`Imported ${successes}`];
      if (dupes > 0) parts.push(`${dupes} already in directory`);
      if (failures > 0) parts.push(`${failures} failed`);
      toast(parts.join(", "), failures === 0 ? "success" : "info");
      await onImported();
      onClose();
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-app/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl border border-bg-border bg-bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-brand-300" />
            <div className="text-sm font-semibold">Discover real businesses</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-1 text-[11px] text-ink-tertiary">
          USAspending = US fed contractors (no contact info). Google Places = local businesses with
          phone + website (no emails). Both free; Places needs <span className="font-mono">GOOGLE_PLACES_API_KEY</span>.
        </p>

        {/* Source picker */}
        <div className="mt-4 flex items-center gap-1 rounded-lg border border-bg-border bg-bg-app p-1 text-xs">
          {(
            [
              { id: "google_places" as const, label: "Google Places" },
              { id: "usaspending" as const, label: "USAspending.gov" },
            ]
          ).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSource(s.id)}
              className={`flex-1 rounded-md px-3 py-1.5 ${
                source === s.id ? "bg-brand-500/15 text-brand-200 font-semibold" : "text-ink-secondary hover:bg-bg-hover"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Source-specific filters */}
        {source === "google_places" ? (
          <div className="mt-3">
            <label className="block">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                Search query
              </div>
              <input
                value={textQuery}
                onChange={(e) => setTextQuery(e.target.value)}
                placeholder="roofing contractors in Dallas TX"
                className="h-10 w-full rounded-md border border-bg-border bg-bg-app px-3 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void search();
                }}
              />
              <div className="mt-1 text-[10px] text-ink-tertiary">
                Use natural language. Combine business type + location: &quot;HVAC suppliers in Houston&quot;,
                &quot;commercial bakeries in Brooklyn&quot;.
              </div>
            </label>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                NAICS code
              </div>
              <input
                value={naicsCode}
                onChange={(e) => setNaicsCode(e.target.value)}
                placeholder="e.g. 236220"
                className="h-9 w-full rounded-md border border-bg-border bg-bg-app px-2 text-sm font-mono"
              />
              <div className="mt-1 text-[10px] text-ink-tertiary">
                <a href="https://www.naics.com/search/" target="_blank" rel="noreferrer" className="text-brand-200 hover:underline">
                  Find a NAICS code
                </a>
              </div>
            </label>
            <label className="block">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                State (optional)
              </div>
              <input
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase())}
                maxLength={2}
                placeholder="TX"
                className="h-9 w-full rounded-md border border-bg-border bg-bg-app px-2 text-sm uppercase"
              />
            </label>
          </div>
        )}

        <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-2">
          <label className="block">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">Limit</div>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Math.min(100, Math.max(1, Number(e.target.value) || 25)))}
              min={1}
              max={100}
              className="h-9 w-full rounded-md border border-bg-border bg-bg-app px-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={search}
            disabled={searching || (source === "google_places" && !textQuery.trim())}
            className="inline-flex items-center gap-1 rounded-lg bg-gradient-brand px-4 py-2 text-[12px] font-semibold shadow-glow disabled:opacity-50"
          >
            {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Compass className="h-3.5 w-3.5" />}
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-[11px] text-ink-tertiary">
              <div>
                {result.candidates.length} candidate{result.candidates.length === 1 ? "" : "s"}
                {result.totalMatches != null && result.totalMatches !== result.candidates.length && (
                  <span> of {result.totalMatches.toLocaleString()} total matches</span>
                )}
              </div>
              {result.candidates.length > 0 && (
                <button type="button" onClick={toggleAll} className="text-brand-200 hover:underline">
                  {selected.size === result.candidates.length ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>

            <div className="max-h-[40vh] overflow-y-auto rounded-md border border-bg-border">
              {result.candidates.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-ink-tertiary">
                  No results. Try a different search.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-bg-card">
                    <tr className="border-b border-bg-border text-left text-[10px] uppercase tracking-wider text-ink-tertiary">
                      <th className="w-8 px-2 py-2"></th>
                      <th className="px-2 py-2 font-medium">Business</th>
                      <th className="px-2 py-2 font-medium">Contact</th>
                      <th className="px-2 py-2 font-medium">Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.candidates.map((c) => {
                      const key = candidateKey(c);
                      const checked = selected.has(key);
                      return (
                        <tr
                          key={key}
                          onClick={() => toggle(c)}
                          className={`cursor-pointer border-t border-bg-border ${
                            checked ? "bg-brand-500/10" : "hover:bg-bg-hover/30"
                          }`}
                        >
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(c)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <div className="font-semibold text-ink-primary">{c.name}</div>
                            <div className="text-[10px] text-ink-tertiary">
                              {[c.city, c.state, c.country].filter(Boolean).join(", ")}
                              {c.naicsCode && <span className="ml-1 font-mono">NAICS {c.naicsCode}</span>}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-[10px] text-ink-secondary">
                            {c.phone && <div className="font-mono">{c.phone}</div>}
                            {c.website && (
                              <div className="truncate max-w-[160px]" title={c.website}>{c.website}</div>
                            )}
                            {!c.phone && !c.website && <span className="text-ink-tertiary italic">—</span>}
                          </td>
                          <td className="px-2 py-2 text-[10px] text-ink-tertiary">
                            <div className="truncate max-w-[200px]" title={c.evidence}>{c.evidence}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {result.candidates.length > 0 && (
              <div className="mt-3 flex items-center justify-end">
                <button
                  type="button"
                  onClick={importSelected}
                  disabled={importing || selected.size === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-accent-green/40 bg-accent-green/15 px-3 py-2 text-[12px] font-semibold text-accent-green hover:bg-accent-green/25 disabled:opacity-50"
                >
                  {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Import {selected.size} selected
                </button>
              </div>
            )}

            <p className="mt-2 text-[10px] text-ink-tertiary">
              Imported records have NO email. You&apos;ll need to enrich emails separately (visit the
              website, paid enrichment tool, etc.) before sending outreach.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] uppercase tracking-wider text-ink-tertiary">{k}</span>
      <span className="text-right text-[12px] text-ink-secondary">{v}</span>
    </div>
  );
}

function EdgeGroup({
  title,
  hint,
  edges,
  onDelete,
  kindTone,
}: {
  title: string;
  hint?: string;
  edges: SupplyEdge[];
  onDelete: (id: string) => void;
  kindTone: "amber" | "cyan" | "brand" | "ink";
}) {
  const toneClass = {
    amber: "bg-accent-amber/15 text-accent-amber",
    cyan: "bg-accent-cyan/15 text-accent-cyan",
    brand: "bg-brand-500/15 text-brand-200",
    ink: "bg-bg-hover text-ink-secondary",
  }[kindTone];
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="text-[9px] uppercase tracking-wider text-ink-tertiary">{title}</div>
        {hint && <div className="text-[9px] italic text-ink-tertiary">{hint}</div>}
      </div>
      <div className="mt-1 space-y-1">
        {edges.map((e) => (
          <div
            key={e.id}
            className="group flex items-center justify-between gap-2 rounded-md border border-bg-border bg-bg-card/40 px-2 py-1"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${toneClass}`}>
                  {e.toName}
                </span>
                <span
                  className={`text-[9px] font-mono ${
                    e.source === "transaction"
                      ? "text-accent-green"
                      : e.source === "operator"
                        ? "text-brand-200"
                        : "text-ink-tertiary"
                  }`}
                  title={`Source: ${e.source} · evidence: ${e.evidence ?? "—"}`}
                >
                  {e.source}
                </span>
                <span className="text-[9px] text-ink-tertiary">{e.confidence}%</span>
              </div>
              {e.evidence && (
                <div className="mt-0.5 truncate text-[9px] text-ink-tertiary" title={e.evidence}>
                  {e.evidence}
                </div>
              )}
            </div>
            <button
              onClick={() => onDelete(e.id)}
              className="opacity-0 transition group-hover:opacity-100 text-ink-tertiary hover:text-accent-red"
              aria-label="Delete edge"
              title="Delete this edge from the graph"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
