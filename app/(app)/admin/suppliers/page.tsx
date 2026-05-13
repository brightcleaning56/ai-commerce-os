"use client";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
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
  const [selected, setSelected] = useState<SupplierRecord | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [portalToken, setPortalToken] = useState<{
    token: string;
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
      const r = await fetch("/api/admin/suppliers", { cache: "no-store" });
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
  }, []);

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

      {/* Tier roll-up tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Tile label="Total" value={counts.total} tone="brand" />
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
              <th className="px-3 py-2.5 text-left font-medium">Last verified</th>
              <th className="px-3 py-2.5 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[12px] text-ink-tertiary">
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
          email={portalToken.email}
          portalUrl={portalToken.portalUrl}
          supplierName={portalToken.supplierName}
          onClose={() => setPortalToken(null)}
          onCopied={() => toast(`Token copied — send it to ${portalToken.email}`, "success")}
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
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone: "brand" | "muted" | "blue" | "green" | "gradient" }) {
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
      <div className="mt-0.5 text-2xl font-bold">{value}</div>
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

function PortalTokenModal({
  token,
  email,
  portalUrl,
  supplierName,
  onClose,
  onCopied,
}: {
  token: string;
  email: string;
  portalUrl: string;
  supplierName: string;
  onClose: () => void;
  onCopied: () => void;
}) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      onCopied();
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setShow(true);
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

        <div className="mt-4 rounded-lg border border-bg-border bg-bg-app p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Sign-in token (180-day expiry)
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
            onClick={copy}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-bg-border bg-bg-hover/40 px-3 py-2 text-[12px] font-medium text-ink-primary hover:bg-bg-hover"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Copy token"}
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
