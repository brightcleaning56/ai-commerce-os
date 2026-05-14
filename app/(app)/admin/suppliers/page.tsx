"use client";
import Link from "next/link";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Compass,
  Copy,
  Download,
  Eye,
  EyeOff,
  Factory,
  FileText,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";

/**
 * /admin/suppliers — the REAL supplier registry view (separate from
 * the operator-facing /suppliers demo, which still renders mock seed
 * data while we migrate).
 *
 * What it does:
 *   - Lists every supplier in the registry (lib/supplierRegistry.ts)
 *   - Shows tier badges (Unverified / Basic / Verified / Trusted /
 *     Enterprise) derived from passed verification runs
 *   - Manual "Add supplier" creation
 *   - One-click "Run L1 verification" per supplier — fires
 *     /api/admin/suppliers/[id]/verify and re-renders the badge.
 *   - Per-supplier drawer with the full verification audit trail
 *     (each check + signal + evidence + when)
 *
 * Owner-only mutations server-side; we don't hide the buttons because
 * the failure path is informative (403 with reason).
 */

type SupplierTier = "unverified" | "basic" | "verified" | "trusted" | "enterprise";
type SupplierKind = "Manufacturer" | "Wholesaler" | "Distributor" | "Dropship";
type VerificationSignal = "good" | "warn" | "bad" | "skipped";

type VerificationCheck = {
  id: string;
  label: string;
  signal: VerificationSignal;
  evidence: string;
  ranAt: string;
};

type VerificationRun = {
  level: "L1" | "L2" | "L3" | "L4" | "L5";
  ranAt: string;
  checks: VerificationCheck[];
  score: number;
  passed: boolean;
};

type SupplierRecord = {
  id: string;
  legalName: string;
  dbaName?: string;
  email: string;
  phone?: string;
  website?: string;
  country: string;
  state?: string;
  city?: string;
  kind: SupplierKind;
  categories: string[];
  tier: SupplierTier;
  verificationRuns: VerificationRun[];
  status: "pending" | "active" | "rejected" | "suspended";
  source: "manual" | "self-signup" | "csv-import" | "agent-discovery";
  createdAt: string;
  updatedAt: string;
  registrationNumber?: string;
  taxId?: string;
  yearFounded?: number;
  moq?: number;
  leadTimeDays?: number;
  capacityUnitsPerMo?: number;
  // AI Trust Score cached on the record. Older records without one
  // render as "—" until their next verification run.
  trustScore?: number;
  trustScoreBreakdown?: {
    total: number;
    l1: number;
    l2: number;
    l3plus: number;
    stalePenalty: number;
    hasL1: boolean;
    hasL2: boolean;
    latestRunAt: string | null;
    summary: string;
    computedAt: string;
  };
};

type TrustBand = "strong" | "solid" | "baseline" | "weak";

function bandForScore(s: number): TrustBand {
  if (s >= 80) return "strong";
  if (s >= 60) return "solid";
  if (s >= 40) return "baseline";
  return "weak";
}

const BAND_TONE: Record<TrustBand, string> = {
  strong:   "bg-accent-green/15 text-accent-green border-accent-green/30",
  solid:    "bg-accent-blue/15 text-accent-blue border-accent-blue/30",
  baseline: "bg-accent-amber/15 text-accent-amber border-accent-amber/30",
  weak:     "bg-accent-red/15 text-accent-red border-accent-red/30",
};

type SupplierDocKind =
  | "business-license" | "tax-cert" | "ein-letter" | "insurance"
  | "export-license" | "iso-cert" | "fda-cert" | "ce-cert"
  | "factory-photo" | "utility-bill" | "bank-letter" | "other";

type SupplierDocStatus = "pending" | "approved" | "rejected";

type SupplierDocMeta = {
  id: string;
  supplierId: string;
  kind: SupplierDocKind;
  filename: string;
  mime: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
  status: SupplierDocStatus;
  reviewNotes?: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

const DOC_KIND_LABEL: Record<SupplierDocKind, string> = {
  "business-license": "Business license",
  "tax-cert":         "Tax certificate",
  "ein-letter":       "EIN letter",
  "insurance":        "Insurance",
  "export-license":   "Export license",
  "iso-cert":         "ISO cert",
  "fda-cert":         "FDA cert",
  "ce-cert":          "CE mark",
  "factory-photo":    "Factory photo",
  "utility-bill":     "Utility bill",
  "bank-letter":      "Bank letter",
  "other":            "Other",
};

const DOC_STATUS_TONE: Record<SupplierDocStatus, string> = {
  pending:  "bg-accent-amber/15 text-accent-amber",
  approved: "bg-accent-green/15 text-accent-green",
  rejected: "bg-accent-red/15 text-accent-red",
};

const MAX_DOC_BYTES = 4 * 1024 * 1024;

const TIER_TONE: Record<SupplierTier, string> = {
  unverified: "bg-bg-hover text-ink-tertiary",
  basic:      "bg-accent-blue/15 text-accent-blue",
  verified:   "bg-accent-green/15 text-accent-green",
  trusted:    "bg-brand-500/20 text-brand-200",
  enterprise: "bg-gradient-brand text-white",
};

const SIGNAL_TONE: Record<VerificationSignal, string> = {
  good:    "text-accent-green",
  warn:    "text-accent-amber",
  bad:     "text-accent-red",
  skipped: "text-ink-tertiary",
};
const SIGNAL_ICON: Record<VerificationSignal, React.ComponentType<{ className?: string }>> = {
  good:    CheckCircle2,
  warn:    AlertCircle,
  bad:     XCircle,
  skipped: AlertCircle,
};

export default function AdminSuppliersPage() {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<SupplierTier | "all">("all");
  const [sortBy, setSortBy] = useState<"updatedAt" | "trustScore" | "legalName">("updatedAt");
  const [selected, setSelected] = useState<SupplierRecord | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [openDiscover, setOpenDiscover] = useState(false);
  const [portalToken, setPortalToken] = useState<{
    token: string;
    magicLink: string;
    portalUrl: string;
    email: string;
    supplierName: string;
  } | null>(null);
  const [issuingPortalId, setIssuingPortalId] = useState<string | null>(null);

  async function issuePortalToken(s: SupplierRecord) {
    setIssuingPortalId(s.id);
    try {
      const r = await fetch(`/api/admin/suppliers/${s.id}/portal-token`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Mint failed (${r.status})`);
      setPortalToken({
        token: d.token,
        magicLink: d.magicLink ?? `${d.portalUrl}`,
        portalUrl: d.portalUrl,
        email: d.email,
        supplierName: s.legalName,
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't issue portal token", "error");
    } finally {
      setIssuingPortalId(null);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (sortBy !== "updatedAt") params.set("sortBy", sortBy);
      const qs = params.toString();
      const r = await fetch(`/api/admin/suppliers${qs ? `?${qs}` : ""}`, { cache: "no-store" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Load failed (${r.status})`);
      }
      const d = await r.json();
      setSuppliers(d.suppliers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load suppliers");
    } finally {
      setLoading(false);
    }
  }, [sortBy]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runVerification(s: SupplierRecord, level: "L1" | "L2" = "L1") {
    setVerifyingId(s.id);
    try {
      const r = await fetch(`/api/admin/suppliers/${s.id}/verify?level=${level}`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Verify failed (${r.status})`);
      const updated = d.supplier as SupplierRecord;
      setSuppliers((prev) => prev.map((x) => (x.id === s.id ? updated : x)));
      if (selected?.id === s.id) setSelected(updated);
      const run = d.run as VerificationRun;
      toast(
        run.passed
          ? `${level} passed — score ${run.score}/100 → ${updated.tier}`
          : `${level} failed — score ${run.score}/100, see the audit trail`,
        run.passed ? "success" : "error",
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Verification failed", "error");
    } finally {
      setVerifyingId(null);
    }
  }

  const filtered = useMemo(() => {
    let out = suppliers;
    if (tierFilter !== "all") out = out.filter((s) => s.tier === tierFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter(
        (s) =>
          s.legalName.toLowerCase().includes(q) ||
          (s.dbaName ?? "").toLowerCase().includes(q) ||
          (s.website ?? "").includes(q) ||
          s.email.includes(q) ||
          s.categories.some((c) => c.toLowerCase().includes(q)),
      );
    }
    return out;
  }, [suppliers, tierFilter, query]);

  const counts = useMemo(() => {
    const c: Record<SupplierTier | "total", number> = {
      total: suppliers.length,
      unverified: 0, basic: 0, verified: 0, trusted: 0, enterprise: 0,
    };
    for (const s of suppliers) c[s.tier] += 1;
    return c;
  }, [suppliers]);

  // Average trust score across suppliers that have one. Zero-score
  // (truly unverified) records skew the mean downward intentionally —
  // operators should see "we have a lot of suppliers we haven't
  // scored yet" reflected in the average.
  const avgTrust = useMemo(() => {
    if (suppliers.length === 0) return null;
    const scored = suppliers.map((s) => s.trustScore ?? 0);
    const sum = scored.reduce((a, b) => a + b, 0);
    return Math.round(sum / scored.length);
  }, [suppliers]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Supplier Registry</h1>
          <p className="text-[12px] text-ink-tertiary">
            Real supplier records + identity verification. Separate from the demo /suppliers browse view.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-card px-2.5 py-1.5 text-[12px] text-ink-secondary hover:bg-bg-hover disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <Link
            href="/admin/suppliers/match"
            className="inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-card px-3 py-1.5 text-[12px] text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
            title="Match suppliers to a buyer's needs by trust + category + location + kind"
          >
            <Target className="h-3.5 w-3.5" />
            Match
          </Link>
          <button
            type="button"
            onClick={() => setOpenDiscover(true)}
            className="inline-flex items-center gap-1 rounded-md border border-brand-500/40 bg-brand-500/10 px-3 py-1.5 text-[12px] font-semibold text-brand-200 hover:bg-brand-500/20"
            title="Find real suppliers from external data sources (USAspending.gov, etc.)"
          >
            <Compass className="h-3.5 w-3.5" />
            Discover
          </button>
          <button
            type="button"
            onClick={() => setOpenCreate(true)}
            className="inline-flex items-center gap-1 rounded-md bg-gradient-brand px-3 py-1.5 text-[12px] font-semibold shadow-glow"
          >
            <Plus className="h-3.5 w-3.5" />
            Add supplier
          </button>
        </div>
      </div>

      {/* Tier roll-up tiles + avg trust */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <Tile label="Total" value={counts.total} tone="brand" />
        <Tile
          label="Avg trust"
          value={avgTrust ?? 0}
          tone={
            avgTrust == null ? "muted"
              : avgTrust >= 80 ? "green"
              : avgTrust >= 60 ? "blue"
              : avgTrust >= 40 ? "muted"
              : "muted"
          }
          suffix={avgTrust == null ? "—" : "/100"}
        />
        <Tile label="Unverified" value={counts.unverified} tone="muted" />
        <Tile label="Basic" value={counts.basic} tone="blue" />
        <Tile label="Verified" value={counts.verified} tone="green" />
        <Tile label="Trusted" value={counts.trusted} tone="brand" />
        <Tile label="Enterprise" value={counts.enterprise} tone="gradient" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, domain, email, category…"
            className="h-9 w-full rounded-lg border border-bg-border bg-bg-card pl-9 pr-3 text-sm placeholder:text-ink-tertiary focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-bg-border bg-bg-card p-1 text-xs">
          {(["all", "unverified", "basic", "verified", "trusted", "enterprise"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className={`rounded-md px-2.5 py-1 capitalize ${
                tierFilter === t
                  ? "bg-brand-500/15 text-brand-200"
                  : "text-ink-secondary hover:bg-bg-hover"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="h-9 rounded-lg border border-bg-border bg-bg-card px-2 text-xs text-ink-secondary"
          title="Sort"
        >
          <option value="updatedAt">Sort: Recent</option>
          <option value="trustScore">Sort: Trust score</option>
          <option value="legalName">Sort: Name (A-Z)</option>
        </select>
      </div>

      {error && (
        <div className="rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-bg-border bg-bg-card">
        <table className="w-full text-xs">
          <thead className="bg-bg-hover/40 text-[11px] uppercase tracking-wider text-ink-tertiary">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Supplier</th>
              <th className="px-3 py-2.5 text-left font-medium">Kind</th>
              <th className="px-3 py-2.5 text-left font-medium">Location</th>
              <th className="px-3 py-2.5 text-left font-medium">Tier</th>
              <th className="px-3 py-2.5 text-left font-medium">Trust</th>
              <th className="px-3 py-2.5 text-left font-medium">Last verified</th>
              <th className="px-3 py-2.5 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[12px] text-ink-tertiary">
                  {loading
                    ? "Loading…"
                    : suppliers.length === 0
                      ? "No suppliers yet. Add one manually or import from CSV (coming soon)."
                      : "No suppliers match your filters."}
                </td>
              </tr>
            ) : (
              filtered.map((s) => {
                const latestL1 = [...s.verificationRuns].reverse().find((r) => r.level === "L1");
                return (
                  <tr key={s.id} className="border-t border-bg-border hover:bg-bg-hover/30">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelected(s)}
                        className="text-left"
                      >
                        <div className="font-semibold text-ink-primary">{s.legalName}</div>
                        <div className="text-[10px] text-ink-tertiary">
                          {s.website ? <span className="font-mono">{s.website}</span> : <span>{s.email}</span>}
                        </div>
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 rounded-md bg-bg-hover px-2 py-0.5 text-[10px] text-ink-secondary">
                        <Factory className="h-3 w-3" /> {s.kind}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-ink-secondary">
                      <div>{s.city ? `${s.city}, ` : ""}{s.country}</div>
                      {s.state && <div className="text-[10px] text-ink-tertiary">{s.state}</div>}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold capitalize ${TIER_TONE[s.tier]}`}
                      >
                        {s.tier}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {typeof s.trustScore === "number" ? (
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold ${BAND_TONE[bandForScore(s.trustScore)]}`}
                          title={s.trustScoreBreakdown?.summary ?? `Score ${s.trustScore}/100`}
                        >
                          {s.trustScore}
                          <span className="ml-0.5 text-[9px] font-normal opacity-70">/100</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-ink-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[10px] text-ink-tertiary">
                      {latestL1 ? (
                        <>
                          <div className={SIGNAL_TONE[latestL1.passed ? "good" : "bad"]}>
                            {latestL1.passed ? "✓" : "✗"} L1 · {latestL1.score}/100
                          </div>
                          <div>{relTime(latestL1.ranAt)}</div>
                        </>
                      ) : (
                        "never"
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => runVerification(s)}
                        disabled={verifyingId === s.id}
                        className="inline-flex items-center gap-1 rounded-md border border-brand-500/40 bg-brand-500/10 px-2 py-1 text-[10px] font-semibold text-brand-200 hover:bg-brand-500/20 disabled:opacity-50"
                      >
                        {verifyingId === s.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-3 w-3" />
                        )}
                        {verifyingId === s.id ? "Running…" : "Run L1"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <SupplierDrawer
          supplier={selected}
          onClose={() => setSelected(null)}
          onVerify={(level) => runVerification(selected, level)}
          verifying={verifyingId === selected.id}
          onIssuePortalToken={() => issuePortalToken(selected)}
          issuingPortalToken={issuingPortalId === selected.id}
        />
      )}

      {portalToken && (
        <PortalTokenModal
          token={portalToken.token}
          magicLink={portalToken.magicLink}
          email={portalToken.email}
          portalUrl={portalToken.portalUrl}
          supplierName={portalToken.supplierName}
          onClose={() => setPortalToken(null)}
          onCopied={(what) => toast(`${what} copied — send it to ${portalToken.email}`, "success")}
        />
      )}

      {openCreate && (
        <CreateSupplierModal
          onClose={() => setOpenCreate(false)}
          onCreated={async (s) => {
            await load();
            setSelected(s);
          }}
        />
      )}

      {openDiscover && (
        <DiscoverModal
          onClose={() => setOpenDiscover(false)}
          onImported={async () => {
            await load();
          }}
        />
      )}
    </div>
  );
}

function Tile({ label, value, tone, suffix }: { label: string; value: number; tone: "brand" | "muted" | "blue" | "green" | "gradient"; suffix?: string }) {
  const toneClass =
    tone === "gradient"
      ? "bg-gradient-brand text-white"
      : tone === "brand"
        ? "border border-brand-500/30 bg-brand-500/10 text-brand-200"
        : tone === "blue"
          ? "border border-accent-blue/30 bg-accent-blue/10 text-accent-blue"
          : tone === "green"
            ? "border border-accent-green/30 bg-accent-green/10 text-accent-green"
            : "border border-bg-border bg-bg-card text-ink-secondary";
  return (
    <div className={`rounded-xl px-4 py-3 ${toneClass}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-0.5 text-2xl font-bold">
        {value}
        {suffix && <span className="ml-1 text-sm font-medium opacity-70">{suffix}</span>}
      </div>
    </div>
  );
}

function SupplierDrawer({
  supplier,
  onClose,
  onVerify,
  verifying,
  onIssuePortalToken,
  issuingPortalToken,
}: {
  supplier: SupplierRecord;
  onClose: () => void;
  onVerify: (level: "L1" | "L2") => void;
  verifying: boolean;
  onIssuePortalToken: () => void;
  issuingPortalToken: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-bg-app/70 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-y-auto bg-bg-panel">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-bg-border bg-bg-panel px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-brand-300" />
            <div className="truncate text-sm font-semibold">{supplier.legalName}</div>
            <span
              className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold capitalize ${TIER_TONE[supplier.tier]}`}
            >
              {supplier.tier}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onIssuePortalToken}
              disabled={issuingPortalToken}
              title="Mint a sign-in token so this supplier can self-serve verification at /portal"
              className="inline-flex items-center gap-1 rounded-md border border-brand-500/40 bg-brand-500/10 px-2 py-1 text-[11px] font-semibold text-brand-200 hover:bg-brand-500/20 disabled:opacity-50"
            >
              {issuingPortalToken ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
              {issuingPortalToken ? "Issuing…" : "Issue portal access"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-7 w-7 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-5 p-5">
          {/* Identity */}
          <Section title="Identity">
            <Field label="Legal name" value={supplier.legalName} />
            {supplier.dbaName && <Field label="DBA" value={supplier.dbaName} />}
            {supplier.registrationNumber && <Field label="Registration #" value={supplier.registrationNumber} mono />}
            {supplier.taxId && <Field label="Tax ID" value={supplier.taxId} mono />}
            {supplier.yearFounded && <Field label="Founded" value={String(supplier.yearFounded)} />}
            <Field label="Email" value={supplier.email} mono />
            {supplier.phone && <Field label="Phone" value={supplier.phone} mono />}
            {supplier.website && (
              <Field
                label="Website"
                value={
                  <a
                    href={`https://${supplier.website.replace(/^https?:\/\//, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-200 underline"
                  >
                    {supplier.website}
                  </a>
                }
              />
            )}
          </Section>

          {/* Location */}
          <Section title="Location">
            <Field label="Country" value={supplier.country} mono />
            {supplier.state && <Field label="State" value={supplier.state} />}
            {supplier.city && <Field label="City" value={supplier.city} />}
          </Section>

          {/* Classification */}
          <Section title="Classification">
            <Field label="Kind" value={supplier.kind} />
            <Field
              label="Categories"
              value={
                supplier.categories.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {supplier.categories.map((c) => (
                      <span key={c} className="rounded-md bg-bg-hover px-2 py-0.5 text-[10px]">{c}</span>
                    ))}
                  </div>
                ) : (
                  <span className="text-ink-tertiary">none</span>
                )
              }
            />
          </Section>

          {/* AI Trust Score */}
          {typeof supplier.trustScore === "number" && (
            <div className="rounded-xl border border-bg-border bg-bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                    AI Trust Score
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-secondary">
                    {supplier.trustScoreBreakdown?.summary ?? "Computed from L1+L2 evidence"}
                  </div>
                </div>
                <div
                  className={`rounded-lg border px-3 py-1.5 text-right ${BAND_TONE[bandForScore(supplier.trustScore)]}`}
                >
                  <div className="text-2xl font-bold leading-none">
                    {supplier.trustScore}
                    <span className="ml-0.5 text-xs opacity-70">/100</span>
                  </div>
                </div>
              </div>
              {supplier.trustScoreBreakdown && (
                <div className="mt-3 grid grid-cols-4 gap-2 text-[10px]">
                  <ScoreBucket label="L1 Identity" value={supplier.trustScoreBreakdown.l1} max={40} />
                  <ScoreBucket label="L2 Business" value={supplier.trustScoreBreakdown.l2} max={40} />
                  <ScoreBucket label="L3+ Future" value={supplier.trustScoreBreakdown.l3plus} max={20} />
                  <ScoreBucket
                    label="Stale"
                    value={supplier.trustScoreBreakdown.stalePenalty}
                    max={-10}
                    isPenalty
                  />
                </div>
              )}
            </div>
          )}

          {/* Linked transactions */}
          <SupplierTransactionsPanel supplierId={supplier.id} />

          {/* Documents (L2 evidence) */}
          <SupplierDocsPanel supplierId={supplier.id} />

          {/* Verification audit */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
                Verification audit ({supplier.verificationRuns.length} run{supplier.verificationRuns.length === 1 ? "" : "s"})
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onVerify("L1")}
                  disabled={verifying}
                  className="inline-flex items-center gap-1 rounded-md border border-brand-500/40 bg-brand-500/10 px-2.5 py-1 text-[11px] font-semibold text-brand-200 hover:bg-brand-500/20 disabled:opacity-50"
                >
                  {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Run L1
                </button>
                <button
                  type="button"
                  onClick={() => onVerify("L2")}
                  disabled={verifying}
                  className="inline-flex items-center gap-1 rounded-md bg-gradient-brand px-2.5 py-1 text-[11px] font-semibold shadow-glow disabled:opacity-50"
                  title="Score uploaded documents (license, tax/EIN, insurance, industry certs)"
                >
                  {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                  Run L2
                </button>
              </div>
            </div>
            {supplier.verificationRuns.length === 0 ? (
              <div className="rounded-md border border-bg-border bg-bg-card px-3 py-3 text-[11px] text-ink-tertiary">
                Nothing run yet. Click <strong>Run L1</strong> to start identity verification.
              </div>
            ) : (
              <div className="space-y-3">
                {[...supplier.verificationRuns].reverse().map((run, i) => (
                  <div key={i} className="rounded-md border border-bg-border bg-bg-card p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-semibold">
                        {run.level} · {run.passed ? <span className="text-accent-green">passed</span> : <span className="text-accent-red">failed</span>} · score {run.score}/100
                      </div>
                      <div className="text-[10px] text-ink-tertiary">{relTime(run.ranAt)}</div>
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {run.checks.map((c) => {
                        const Icon = SIGNAL_ICON[c.signal];
                        return (
                          <li key={c.id} className="flex items-start gap-2 text-[11px]">
                            <Icon className={`mt-0.5 h-3 w-3 shrink-0 ${SIGNAL_TONE[c.signal]}`} />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-ink-primary">{c.label}</div>
                              <div className="text-[10px] text-ink-tertiary">{c.evidence}</div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateSupplierModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (s: SupplierRecord) => Promise<void>;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    legalName: "",
    email: "",
    country: "US",
    kind: "Manufacturer" as SupplierKind,
    website: "",
    phone: "",
    city: "",
    state: "",
    categories: "",
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!form.legalName.trim() || !form.email.trim()) {
      toast("legalName and email are required", "error");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/admin/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legalName: form.legalName.trim(),
          email: form.email.trim(),
          country: form.country.trim().toUpperCase().slice(0, 2),
          kind: form.kind,
          website: form.website.trim() || undefined,
          phone: form.phone.trim() || undefined,
          city: form.city.trim() || undefined,
          state: form.state.trim() || undefined,
          categories: form.categories
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean),
          source: "manual",
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Create failed (${r.status})`);
      toast(`Added ${d.supplier.legalName}`, "success");
      await onCreated(d.supplier as SupplierRecord);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Create failed", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-app/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-bg-border bg-bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-brand-300" />
            <div className="text-sm font-semibold">Add supplier</div>
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

        <div className="mt-4 space-y-3 text-[12px]">
          <FormRow label="Legal name *">
            <input
              value={form.legalName}
              onChange={(e) => setForm({ ...form, legalName: e.target.value })}
              className="h-9 w-full rounded-md border border-bg-border bg-bg-app px-2 text-sm"
            />
          </FormRow>
          <FormRow label="Email *">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="h-9 w-full rounded-md border border-bg-border bg-bg-app px-2 text-sm"
            />
          </FormRow>
          <FormRow label="Website">
            <input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="example.com"
              className="h-9 w-full rounded-md border border-bg-border bg-bg-app px-2 text-sm"
            />
          </FormRow>
          <FormRow label="Phone">
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+1 555 555 1234"
              className="h-9 w-full rounded-md border border-bg-border bg-bg-app px-2 text-sm"
            />
          </FormRow>
          <div className="grid grid-cols-3 gap-2">
            <FormRow label="Country">
              <input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })}
                maxLength={2}
                className="h-9 w-full rounded-md border border-bg-border bg-bg-app px-2 text-sm uppercase"
              />
            </FormRow>
            <FormRow label="State">
              <input
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="h-9 w-full rounded-md border border-bg-border bg-bg-app px-2 text-sm"
              />
            </FormRow>
            <FormRow label="City">
              <input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="h-9 w-full rounded-md border border-bg-border bg-bg-app px-2 text-sm"
              />
            </FormRow>
          </div>
          <FormRow label="Kind">
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as SupplierKind })}
              className="h-9 w-full rounded-md border border-bg-border bg-bg-app px-2 text-sm"
            >
              <option value="Manufacturer">Manufacturer</option>
              <option value="Wholesaler">Wholesaler</option>
              <option value="Distributor">Distributor</option>
              <option value="Dropship">Dropship</option>
            </select>
          </FormRow>
          <FormRow label="Categories (comma-separated)">
            <input
              value={form.categories}
              onChange={(e) => setForm({ ...form, categories: e.target.value })}
              placeholder="Roofing, Shingles, Construction"
              className="h-9 w-full rounded-md border border-bg-border bg-bg-app px-2 text-sm"
            />
          </FormRow>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-bg-border bg-bg-app px-3 py-2 text-[12px] text-ink-secondary hover:text-ink-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !form.legalName.trim() || !form.email.trim()}
            className="inline-flex items-center gap-1 rounded-lg bg-gradient-brand px-3 py-2 text-[12px] font-semibold shadow-glow disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Create supplier
          </button>
        </div>
      </div>
    </div>
  );
}

type DiscoveryCandidate = {
  externalId: string | null;
  source: string;
  legalName: string;
  country: string;
  state?: string;
  city?: string;
  zip?: string;
  naicsCode?: string;
  naicsDescription?: string;
  kind: SupplierKind;
  categories: string[];
  evidence: string;
  largestAwardUsd?: number;
  totalAwardUsd?: number;
  website?: string;
};

type DiscoveryResult = {
  source: string;
  query: { naicsCode?: string; state?: string; limit?: number };
  candidates: DiscoveryCandidate[];
  fetchedAt: string;
  totalMatches?: number;
  error?: string;
};

function DiscoverModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [naicsCode, setNaicsCode] = useState("");
  const [state, setState] = useState("");
  const [limit, setLimit] = useState(25);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function candidateKey(c: DiscoveryCandidate): string {
    return c.externalId || `${c.source}:${c.legalName.toUpperCase()}`;
  }

  async function search() {
    setSearching(true);
    setError(null);
    setResult(null);
    setSelected(new Set());
    try {
      const r = await fetch("/api/admin/suppliers/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "usaspending",
          query: {
            naicsCode: naicsCode.trim() || undefined,
            state: state.trim() || undefined,
            limit,
          },
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
    if (selected.size === result.candidates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(result.candidates.map(candidateKey)));
    }
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
          // Generate a placeholder email — USAspending doesn't return
          // contact emails. The operator can edit this on the supplier
          // record before issuing portal access.
          const slug = c.legalName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
          const placeholderEmail = `unknown-${slug}-${(c.externalId ?? "").toLowerCase().slice(0, 8)}@unverified.invalid`;

          const r = await fetch("/api/admin/suppliers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              legalName: c.legalName,
              email: placeholderEmail,
              country: c.country || "US",
              kind: c.kind,
              categories: c.categories,
              state: c.state,
              city: c.city,
              zip: c.zip,
              source: "agent-discovery",
              externalId: c.externalId ?? undefined,
              externalIdSource: c.externalId ? c.source : undefined,
              internalNotes: `Imported from ${c.source}. ${c.evidence}${c.externalId ? ` (UEI ${c.externalId})` : ""}. Edit email + website before issuing portal access.`,
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
      if (dupes > 0) parts.push(`${dupes} already in registry`);
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
            <div className="text-sm font-semibold">Discover suppliers from USAspending.gov</div>
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
          Real US federal contract awardees from the last 24 months. Bias toward gov contractors —
          good for construction, defense-adjacent, IT services. Future sources (OpenCorporates,
          GLEIF, ThomasNet) plug into the same flow.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
          <label className="block">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">NAICS code</div>
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
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">State (optional)</div>
            <input
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              maxLength={2}
              placeholder="TX"
              className="h-9 w-full rounded-md border border-bg-border bg-bg-app px-2 text-sm uppercase"
            />
          </label>
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
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={search}
            disabled={searching}
            className="inline-flex items-center gap-1 rounded-lg bg-gradient-brand px-3 py-2 text-[12px] font-semibold shadow-glow disabled:opacity-50"
          >
            {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Compass className="h-3.5 w-3.5" />}
            {searching ? "Searching…" : "Search"}
          </button>
          {result && result.candidates.length > 0 && (
            <button
              type="button"
              onClick={importSelected}
              disabled={importing || selected.size === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-accent-green/40 bg-accent-green/15 px-3 py-2 text-[12px] font-semibold text-accent-green hover:bg-accent-green/25 disabled:opacity-50"
            >
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Import {selected.size} selected
            </button>
          )}
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
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-brand-200 hover:underline"
                >
                  {selected.size === result.candidates.length ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>
            <div className="max-h-[40vh] overflow-y-auto rounded-md border border-bg-border">
              {result.candidates.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-ink-tertiary">
                  No candidates. Try a broader NAICS code or remove the state filter.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-bg-card">
                    <tr className="border-b border-bg-border text-left text-[10px] uppercase tracking-wider text-ink-tertiary">
                      <th className="w-8 px-2 py-2"></th>
                      <th className="px-2 py-2 font-medium">Vendor</th>
                      <th className="px-2 py-2 font-medium">Kind</th>
                      <th className="px-2 py-2 font-medium">NAICS</th>
                      <th className="px-2 py-2 text-right font-medium">Awards</th>
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
                            <div className="font-semibold text-ink-primary">{c.legalName}</div>
                            <div className="text-[10px] text-ink-tertiary">
                              {c.city ? `${c.city}, ` : ""}{c.state || c.country}
                              {c.externalId && <span className="ml-1 font-mono">UEI {c.externalId}</span>}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-ink-secondary">{c.kind}</td>
                          <td className="px-2 py-2 text-[10px] text-ink-tertiary">
                            {c.naicsCode && <div className="font-mono">{c.naicsCode}</div>}
                            {c.naicsDescription && <div className="truncate max-w-[200px]" title={c.naicsDescription}>{c.naicsDescription}</div>}
                          </td>
                          <td className="px-2 py-2 text-right text-[10px] text-ink-secondary">
                            {c.totalAwardUsd != null && (
                              <div className="font-mono">${formatUsd(c.totalAwardUsd)}</div>
                            )}
                            <div className="text-ink-tertiary truncate max-w-[160px]" title={c.evidence}>{c.evidence}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <p className="mt-2 text-[10px] text-ink-tertiary">
              Imported records get a placeholder email <span className="font-mono">unknown-...-@unverified.invalid</span>.
              Edit each supplier&apos;s email + website before issuing portal access — they need a real
              contact to receive their sign-in link.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function formatUsd(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

function ScoreBucket({
  label,
  value,
  max,
  isPenalty,
}: {
  label: string;
  value: number;
  max: number;
  isPenalty?: boolean;
}) {
  const tone = isPenalty
    ? value < 0 ? "text-accent-red" : "text-ink-tertiary"
    : value > 0 ? "text-ink-primary" : "text-ink-tertiary";
  return (
    <div className="rounded-md border border-bg-border bg-bg-app px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className={`mt-0.5 text-sm font-bold ${tone}`}>
        {value}
        <span className="ml-0.5 text-[9px] font-normal opacity-60">
          {isPenalty ? `/${max}` : `/${max}`}
        </span>
      </div>
    </div>
  );
}

function PortalTokenModal({
  token,
  magicLink,
  email,
  portalUrl,
  supplierName,
  onClose,
  onCopied,
}: {
  token: string;
  magicLink: string;
  email: string;
  portalUrl: string;
  supplierName: string;
  onClose: () => void;
  onCopied: (what: string) => void;
}) {
  const [show, setShow] = useState(false);
  const [copiedKey, setCopiedKey] = useState<"token" | "magic" | null>(null);

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedKey("token");
      onCopied("Token");
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      setShow(true);
    }
  }
  async function copyMagicLink() {
    try {
      await navigator.clipboard.writeText(magicLink);
      setCopiedKey("magic");
      onCopied("Sign-in link");
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Fallback handled inline below
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-app/80 px-5 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-bg-border bg-bg-card p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-md text-ink-tertiary hover:bg-bg-hover hover:text-ink-primary"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/15">
            <KeyRound className="h-4 w-4 text-brand-200" />
          </div>
          <div>
            <div className="text-sm font-semibold">Portal access for {supplierName}</div>
            <div className="text-[11px] text-ink-tertiary">
              Send this token + sign-in URL to <span className="font-mono">{email}</span>. Won&apos;t be shown again.
            </div>
          </div>
        </div>

        {/* Magic link — primary path. One click signs them in. */}
        <div className="mt-4 rounded-lg border border-brand-500/30 bg-brand-500/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-200">
              One-click sign-in link (recommended)
            </div>
            <button
              type="button"
              onClick={copyMagicLink}
              className="inline-flex items-center gap-1 rounded-md border border-brand-500/40 bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-200 hover:bg-brand-500/25"
            >
              <Copy className="h-3 w-3" />
              {copiedKey === "magic" ? "Copied" : "Copy link"}
            </button>
          </div>
          <div className="mt-2 break-all rounded-md border border-bg-border bg-bg-app px-3 py-2 font-mono text-[10px] text-ink-primary">
            {magicLink}
          </div>
          <div className="mt-1 text-[10px] text-ink-tertiary">
            Sending in an email? Use this — they click once and land in /portal. The token is in
            the URL though, so don&apos;t paste this in a public channel.
          </div>
        </div>

        {/* Raw token — fallback for paste-into-portal flow */}
        <div className="mt-3 rounded-lg border border-bg-border bg-bg-app p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Raw token (for paste at /signin)
            </div>
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="inline-flex items-center gap-1 rounded-md border border-bg-border bg-bg-hover/40 px-2 py-0.5 text-[11px] text-ink-secondary hover:bg-bg-hover hover:text-ink-primary"
            >
              {show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {show ? "Hide" : "Reveal"}
            </button>
          </div>
          <div
            className="mt-2 max-h-32 overflow-auto break-all rounded-md border border-bg-border bg-bg-card px-3 py-2 font-mono text-[11px] text-ink-primary"
            style={{ filter: show ? undefined : "blur(5px)" }}
          >
            {token}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={copyToken}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-bg-border bg-bg-hover/40 px-3 py-2 text-[12px] font-medium text-ink-primary hover:bg-bg-hover"
          >
            <Copy className="h-3.5 w-3.5" />
            {copiedKey === "token" ? "Copied" : "Copy raw token"}
          </button>
          <a
            href={portalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-bg-border px-3 py-2 text-[12px] font-medium text-ink-secondary hover:text-ink-primary"
          >
            Open /portal
          </a>
        </div>

        <div className="mt-4 rounded-lg border border-accent-amber/30 bg-accent-amber/5 p-3 text-[11px] text-ink-secondary">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-amber" />
            <div>
              Anyone with this token can sign in as <span className="font-mono">{email}</span> and
              upload documents on behalf of <strong>{supplierName}</strong>. Send it over a private
              channel. Need to revoke? Rotate ADMIN_TOKEN to invalidate every outstanding token
              (staff + suppliers) at once.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type SupplierTxRollup = {
  count: number;
  totalRevenueCents: number;
  totalUnits: number;
  completedCount: number;
  lastTransactionAt: string | null;
};

type SupplierTxSlim = {
  id: string;
  productName: string;
  buyerCompany: string;
  buyerName: string;
  quantity: number;
  unitPriceCents: number;
  productTotalCents: number;
  supplierPayoutCents: number;
  state: string;
  createdAt: string;
  deliveredAt?: string;
  escrowReleasedAt?: string;
};

function SupplierTransactionsPanel({ supplierId }: { supplierId: string }) {
  const { toast } = useToast();
  const [data, setData] = useState<{ transactions: SupplierTxSlim[]; rollup: SupplierTxRollup } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkTxnId, setLinkTxnId] = useState("");
  const [linking, setLinking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/suppliers/${supplierId}/transactions`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Load failed (${r.status})`);
      setData({ transactions: d.transactions ?? [], rollup: d.rollup });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load transactions");
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function linkTransaction() {
    const id = linkTxnId.trim();
    if (!id) return;
    setLinking(true);
    try {
      const r = await fetch(`/api/transactions/${id}/link-supplier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierRegistryId: supplierId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Link failed (${r.status})`);
      toast(`Linked transaction ${id}`, "success");
      setLinkTxnId("");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Link failed", "error");
    } finally {
      setLinking(false);
    }
  }

  const fmtUsd = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
          Linked transactions {data ? `(${data.rollup.count})` : ""}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center gap-2 rounded-md border border-bg-border bg-bg-card px-3 py-2 text-[11px] text-ink-tertiary">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      ) : data && data.rollup.count > 0 ? (
        <div className="space-y-3">
          {/* Rollup tiles */}
          <div className="grid grid-cols-3 gap-2">
            <RollupTile label="Total revenue" value={fmtUsd(data.rollup.totalRevenueCents)} tone="green" />
            <RollupTile label="Total units" value={data.rollup.totalUnits.toLocaleString()} tone="brand" />
            <RollupTile label="Completed" value={`${data.rollup.completedCount}/${data.rollup.count}`} tone="muted" />
          </div>

          {/* Recent transactions list */}
          <ul className="max-h-60 overflow-y-auto rounded-md border border-bg-border bg-bg-card divide-y divide-bg-border">
            {data.transactions.slice(0, 10).map((t) => (
              <li key={t.id} className="px-3 py-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink-primary">{t.productName}</div>
                    <div className="truncate text-[10px] text-ink-tertiary">
                      {t.buyerCompany} · {t.quantity} units · {relTime(t.createdAt)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-[11px] text-ink-primary">
                      {fmtUsd(t.productTotalCents)}
                    </div>
                    <div className="text-[10px] text-ink-tertiary">{t.state}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {data.transactions.length > 10 && (
            <div className="text-[10px] text-ink-tertiary">
              + {data.transactions.length - 10} more
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-bg-border bg-bg-card px-3 py-2 text-[11px] text-ink-tertiary">
          No transactions linked yet. Paste a transaction id below to associate one with this
          supplier — useful for backfilling old transactions that pre-date the registry.
        </div>
      )}

      {/* Link form — always visible so the operator can backfill */}
      <div className="mt-3 rounded-md border border-bg-border bg-bg-app p-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
          Link a transaction
        </div>
        <div className="mt-1 flex items-center gap-2">
          <input
            value={linkTxnId}
            onChange={(e) => setLinkTxnId(e.target.value)}
            placeholder="t_abc123..."
            className="h-8 flex-1 rounded-md border border-bg-border bg-bg-card px-2 text-[11px] font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") void linkTransaction();
            }}
          />
          <button
            type="button"
            onClick={() => void linkTransaction()}
            disabled={linking || !linkTxnId.trim()}
            className="inline-flex items-center gap-1 rounded-md border border-brand-500/40 bg-brand-500/10 px-2.5 py-1 text-[11px] font-semibold text-brand-200 hover:bg-brand-500/20 disabled:opacity-50"
          >
            {linking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Link
          </button>
        </div>
        <div className="mt-1 text-[10px] text-ink-tertiary">
          Find ids on /transactions. Linking unlocks per-supplier revenue rollup + future L3
          operational verification (auto-validate self-reported MOQ vs actual deliveries).
        </div>
      </div>
    </div>
  );
}

function RollupTile({ label, value, tone }: { label: string; value: string; tone: "green" | "brand" | "muted" }) {
  const toneClass =
    tone === "green"
      ? "border-accent-green/30 bg-accent-green/10 text-accent-green"
      : tone === "brand"
        ? "border-brand-500/30 bg-brand-500/10 text-brand-200"
        : "border-bg-border bg-bg-card text-ink-secondary";
  return (
    <div className={`rounded-md border px-2.5 py-1.5 ${toneClass}`}>
      <div className="text-[9px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-0.5 text-sm font-bold">{value}</div>
    </div>
  );
}

function SupplierDocsPanel({ supplierId }: { supplierId: string }) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<SupplierDocMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [uploadKind, setUploadKind] = useState<SupplierDocKind>("business-license");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/suppliers/${supplierId}/documents`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Load failed (${r.status})`);
      setDocs(d.documents ?? []);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't load documents", "error");
    } finally {
      setLoading(false);
    }
  }, [supplierId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so the same filename can be re-uploaded
    if (!file) return;
    if (file.size > MAX_DOC_BYTES) {
      toast(`File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB (max 4 MB)`, "error");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", uploadKind);
      const r = await fetch(`/api/admin/suppliers/${supplierId}/documents`, {
        method: "POST",
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Upload failed (${r.status})`);
      toast(`Uploaded ${d.document.filename}`, "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  }

  async function review(docId: string, status: SupplierDocStatus) {
    setReviewingId(docId);
    try {
      const r = await fetch(
        `/api/admin/suppliers/${supplierId}/documents/${docId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Review failed (${r.status})`);
      setDocs((prev) => prev.map((x) => (x.id === docId ? (d.document as SupplierDocMeta) : x)));
      toast(`Marked ${status}`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Review failed", "error");
    } finally {
      setReviewingId(null);
    }
  }

  async function remove(docId: string, filename: string) {
    if (!confirm(`Delete ${filename}? This can't be undone.`)) return;
    setReviewingId(docId);
    try {
      const r = await fetch(
        `/api/admin/suppliers/${supplierId}/documents/${docId}`,
        { method: "DELETE" },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Delete failed (${r.status})`);
      setDocs((prev) => prev.filter((x) => x.id !== docId));
      toast(`Deleted ${filename}`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete failed", "error");
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
          Documents ({docs.length})
        </div>
        <div className="flex items-center gap-1">
          <select
            value={uploadKind}
            onChange={(e) => setUploadKind(e.target.value as SupplierDocKind)}
            className="h-7 rounded-md border border-bg-border bg-bg-app px-2 text-[11px]"
          >
            {(Object.keys(DOC_KIND_LABEL) as SupplierDocKind[]).map((k) => (
              <option key={k} value={k}>{DOC_KIND_LABEL[k]}</option>
            ))}
          </select>
          <label className="inline-flex items-center gap-1 rounded-md border border-brand-500/40 bg-brand-500/10 px-2.5 py-1 text-[11px] font-semibold text-brand-200 hover:bg-brand-500/20 cursor-pointer">
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            Upload
            <input
              type="file"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx"
            />
          </label>
        </div>
      </div>

      {loading && docs.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-bg-border bg-bg-card px-3 py-2 text-[11px] text-ink-tertiary">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading documents…
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-md border border-bg-border bg-bg-card px-3 py-2 text-[11px] text-ink-tertiary">
          No documents yet. Upload a business license + tax cert/EIN to advance to L2.
        </div>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="rounded-md border border-bg-border bg-bg-card p-3">
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-tertiary" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-medium text-ink-primary truncate">
                      {DOC_KIND_LABEL[d.kind]}
                    </span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${DOC_STATUS_TONE[d.status]}`}>
                      {d.status}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[10px] font-mono text-ink-tertiary" title={d.filename}>
                    {d.filename} · {(d.sizeBytes / 1024).toFixed(0)} KB · {relTime(d.uploadedAt)}
                  </div>
                  {d.reviewedAt && (
                    <div className="text-[10px] text-ink-tertiary">
                      Reviewed by {d.reviewedBy} {relTime(d.reviewedAt)}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <a
                    href={`/api/admin/suppliers/${supplierId}/documents/${d.id}?download=1`}
                    title="Download"
                    className="grid h-6 w-6 place-items-center rounded-md border border-bg-border bg-bg-app text-ink-tertiary hover:text-ink-primary"
                  >
                    <Download className="h-3 w-3" />
                  </a>
                  {d.status !== "approved" && (
                    <button
                      type="button"
                      onClick={() => review(d.id, "approved")}
                      disabled={reviewingId === d.id}
                      title="Approve"
                      className="grid h-6 w-6 place-items-center rounded-md border border-accent-green/40 bg-accent-green/15 text-accent-green hover:bg-accent-green/25 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                    </button>
                  )}
                  {d.status !== "rejected" && (
                    <button
                      type="button"
                      onClick={() => review(d.id, "rejected")}
                      disabled={reviewingId === d.id}
                      title="Reject"
                      className="grid h-6 w-6 place-items-center rounded-md border border-accent-red/40 bg-accent-red/15 text-accent-red hover:bg-accent-red/25 disabled:opacity-50"
                    >
                      <XCircle className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(d.id, d.filename)}
                    disabled={reviewingId === d.id}
                    title="Delete"
                    className="grid h-6 w-6 place-items-center rounded-md border border-bg-border bg-bg-app text-ink-tertiary hover:text-accent-red disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
        {title}
      </div>
      <div className="space-y-1.5 rounded-md border border-bg-border bg-bg-card p-3 text-[12px]">
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-start gap-2">
      <span className="text-ink-tertiary">{label}</span>
      <span className={mono ? "font-mono text-[11px] text-ink-primary" : "text-ink-primary"}>
        {value}
      </span>
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

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}
