"use client";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

/**
 * /portal — supplier dashboard.
 *
 * What the supplier sees:
 *   1. Their profile (legal name, contact, location, kind, categories)
 *      with the current trust tier badge
 *   2. The verification audit trail — every check the operator has run
 *      against their profile, with signal + evidence
 *   3. Their documents — uploaded files with approval status
 *   4. Upload form so they can submit a new document (lands as
 *      "pending" until owner reviews)
 *
 * Reads/writes go through /api/portal/* which scopes by supplierId
 * from the session token. Nothing about other suppliers is reachable.
 */

type SupplierTier = "unverified" | "basic" | "verified" | "trusted" | "enterprise";
type SupplierKind = "Manufacturer" | "Wholesaler" | "Distributor" | "Dropship";
type SupplierStatus = "pending" | "active" | "rejected" | "suspended";
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
  status: SupplierStatus;
  trustScore?: number;
  trustScoreBreakdown?: {
    total: number;
    l1: number;
    l2: number;
    l3plus: number;
    stalePenalty: number;
    summary: string;
  };
};

function trustBand(s: number): "strong" | "solid" | "baseline" | "weak" {
  if (s >= 80) return "strong";
  if (s >= 60) return "solid";
  if (s >= 40) return "baseline";
  return "weak";
}

const TRUST_BAND_TONE: Record<"strong" | "solid" | "baseline" | "weak", string> = {
  strong:   "border-accent-green/30 bg-accent-green/10 text-accent-green",
  solid:    "border-accent-blue/30 bg-accent-blue/10 text-accent-blue",
  baseline: "border-accent-amber/30 bg-accent-amber/10 text-accent-amber",
  weak:     "border-accent-red/30 bg-accent-red/10 text-accent-red",
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

const TIER_TONE: Record<SupplierTier, string> = {
  unverified: "bg-bg-hover text-ink-tertiary",
  basic:      "bg-accent-blue/15 text-accent-blue",
  verified:   "bg-accent-green/15 text-accent-green",
  trusted:    "bg-brand-500/20 text-brand-200",
  enterprise: "bg-gradient-brand text-white",
};

const TIER_BLURB: Record<SupplierTier, string> = {
  unverified: "Identity hasn't been checked yet. The workspace owner will run verification when they review your application.",
  basic:      "Identity confirmed — your domain, contact details, and address pass basic checks.",
  verified:   "Business confirmed — your license + tax/EIN documents have been approved.",
  trusted:    "Operationally verified — your reported capacity and lead times have been validated against transaction history.",
  enterprise: "Fully audited — financial stability + supply chain intel are on file. You appear at the top of buyer match results.",
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

const DOC_STATUS_TONE: Record<SupplierDocStatus, string> = {
  pending:  "bg-accent-amber/15 text-accent-amber",
  approved: "bg-accent-green/15 text-accent-green",
  rejected: "bg-accent-red/15 text-accent-red",
};

const MAX_DOC_BYTES = 4 * 1024 * 1024;

export default function PortalPage() {
  const { toast } = useToast();
  const [supplier, setSupplier] = useState<SupplierRecord | null>(null);
  const [session, setSession] = useState<{ email: string; exp: number } | null>(null);
  const [documents, setDocuments] = useState<SupplierDocMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadKind, setUploadKind] = useState<SupplierDocKind>("business-license");

  const load = useCallback(async () => {
    setLoading(true);
    setAuthError(null);
    try {
      const meR = await fetch("/api/portal/me", { cache: "no-store" });
      if (meR.status === 401) {
        setAuthError("You need to sign in to access the supplier portal.");
        setLoading(false);
        return;
      }
      if (!meR.ok) {
        const d = await meR.json().catch(() => ({}));
        throw new Error(d.error ?? `me failed (${meR.status})`);
      }
      const meD = await meR.json();
      setSupplier(meD.supplier as SupplierRecord);
      setSession({ email: meD.session.email, exp: meD.session.exp });

      const docR = await fetch("/api/portal/documents", { cache: "no-store" });
      if (docR.ok) {
        const docD = await docR.json();
        setDocuments(docD.documents ?? []);
      }
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Couldn't load your account");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
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
      const r = await fetch("/api/portal/documents", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Upload failed (${r.status})`);
      toast(`Uploaded ${d.document.filename}`, "success");
      setDocuments((prev) => [d.document as SupplierDocMeta, ...prev]);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  }

  async function deleteDoc(docId: string, filename: string) {
    if (!confirm(`Delete ${filename}? You can re-upload it later.`)) return;
    setDeletingId(docId);
    try {
      const r = await fetch(`/api/portal/documents/${docId}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Delete failed (${r.status})`);
      setDocuments((prev) => prev.filter((x) => x.id !== docId));
      toast("Deleted", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete failed", "error");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-tertiary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your portal…
      </div>
    );
  }

  if (authError) {
    return (
      <div className="rounded-2xl border border-accent-amber/30 bg-accent-amber/5 p-6">
        <div className="flex items-center gap-2 text-accent-amber">
          <AlertCircle className="h-5 w-5" />
          <h1 className="text-base font-semibold">Sign-in required</h1>
        </div>
        <p className="mt-2 text-[13px] text-ink-secondary">{authError}</p>
        <p className="mt-1 text-[12px] text-ink-tertiary">
          Use the sign-in token your account contact sent you. If you don&apos;t have one yet,
          ask the workspace owner to issue a portal access token.
        </p>
        <a
          href="/signin?next=/portal"
          className="mt-4 inline-flex items-center gap-1 rounded-lg bg-gradient-brand px-4 py-2 text-[12px] font-semibold shadow-glow"
        >
          Go to sign-in
        </a>
      </div>
    );
  }

  if (!supplier) return null;

  const latestL1 = [...supplier.verificationRuns].reverse().find((r) => r.level === "L1");
  const latestL2 = [...supplier.verificationRuns].reverse().find((r) => r.level === "L2");

  return (
    <div className="space-y-6">
      {/* Welcome + tier card */}
      <div className="rounded-2xl border border-bg-border bg-bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-bg-hover">
              <Building2 className="h-5 w-5 text-brand-300" />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight">{supplier.legalName}</h1>
              <div className="text-[11px] text-ink-tertiary">
                {supplier.kind} · {supplier.city ? `${supplier.city}, ` : ""}{supplier.country}
              </div>
              {session && (
                <div className="mt-0.5 text-[10px] text-ink-tertiary">
                  Signed in as <span className="font-mono">{session.email}</span>
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
              Trust tier
            </div>
            <div
              className={`mt-1 inline-block rounded-md px-3 py-1 text-sm font-bold capitalize ${TIER_TONE[supplier.tier]}`}
            >
              {supplier.tier}
            </div>
            {typeof supplier.trustScore === "number" && (
              <div
                className={`mt-2 inline-block rounded-lg border px-3 py-1 text-right ${TRUST_BAND_TONE[trustBand(supplier.trustScore)]}`}
                title={supplier.trustScoreBreakdown?.summary ?? "AI Trust Score"}
              >
                <div className="text-[9px] font-semibold uppercase tracking-wider opacity-80">
                  AI Trust Score
                </div>
                <div className="text-xl font-bold leading-none">
                  {supplier.trustScore}
                  <span className="ml-0.5 text-xs font-medium opacity-70">/100</span>
                </div>
              </div>
            )}
            <div className="mt-2 max-w-[260px] text-[11px] text-ink-secondary">
              {TIER_BLURB[supplier.tier]}
            </div>
          </div>
        </div>
      </div>

      {/* Verification status */}
      <div>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
          Verification status
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <LevelCard
            level="L1"
            title="Basic Identity"
            description="Domain, contact details, address checks."
            run={latestL1}
          />
          <LevelCard
            level="L2"
            title="Business Verification"
            description="Uploaded license, tax/EIN, insurance, industry certs."
            run={latestL2}
          />
        </div>
      </div>

      {/* Documents */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
            Your documents ({documents.length})
          </h2>
          <div className="flex items-center gap-1">
            <select
              value={uploadKind}
              onChange={(e) => setUploadKind(e.target.value as SupplierDocKind)}
              className="h-8 rounded-md border border-bg-border bg-bg-card px-2 text-[12px]"
            >
              {(Object.keys(DOC_KIND_LABEL) as SupplierDocKind[]).map((k) => (
                <option key={k} value={k}>{DOC_KIND_LABEL[k]}</option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1 cursor-pointer rounded-md bg-gradient-brand px-3 py-1.5 text-[12px] font-semibold shadow-glow">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Upload document
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

        <p className="mb-2 text-[11px] text-ink-tertiary">
          Upload your business license, tax cert/EIN, insurance, and any industry certifications.
          New uploads land in <strong>pending</strong> until the workspace owner reviews them.
          You can re-upload or delete pending documents; approved ones can only be removed by the owner.
        </p>

        {documents.length === 0 ? (
          <div className="rounded-md border border-bg-border bg-bg-card px-4 py-6 text-center text-[12px] text-ink-tertiary">
            No documents uploaded yet. Start with your business license + tax cert/EIN to qualify
            for Tier 2 (<strong>Verified</strong>).
          </div>
        ) : (
          <ul className="space-y-2">
            {documents.map((d) => (
              <li key={d.id} className="rounded-md border border-bg-border bg-bg-card p-3">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-tertiary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium text-ink-primary">
                        {DOC_KIND_LABEL[d.kind]}
                      </span>
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${DOC_STATUS_TONE[d.status]}`}
                      >
                        {d.status}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-ink-tertiary">
                      {d.filename} · {(d.sizeBytes / 1024).toFixed(0)} KB · uploaded {relTime(d.uploadedAt)}
                    </div>
                    {d.reviewNotes && (
                      <div className="mt-1 rounded-md border border-bg-border bg-bg-hover/40 p-2 text-[11px] text-ink-secondary">
                        <strong>Reviewer note:</strong> {d.reviewNotes}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <a
                      href={`/api/portal/documents/${d.id}?download=1`}
                      title="Download"
                      className="grid h-7 w-7 place-items-center rounded-md border border-bg-border bg-bg-app text-ink-tertiary hover:text-ink-primary"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                    {d.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => deleteDoc(d.id, d.filename)}
                        disabled={deletingId === d.id}
                        title="Delete"
                        className="grid h-7 w-7 place-items-center rounded-md border border-bg-border bg-bg-app text-ink-tertiary hover:text-accent-red disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-bg-border bg-bg-card p-4 text-[11px] text-ink-tertiary">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-300" />
          <div>
            <strong className="text-ink-secondary">Coming soon:</strong> direct buyer matching,
            RFQ inbox, payout history, and AI demand forecasts for your categories — once you
            reach Tier 3 (<strong>Trusted</strong>).
          </div>
        </div>
      </div>
    </div>
  );
}

function LevelCard({
  level,
  title,
  description,
  run,
}: {
  level: string;
  title: string;
  description: string;
  run?: VerificationRun;
}) {
  const tone = !run
    ? "border-bg-border bg-bg-card"
    : run.passed
      ? "border-accent-green/30 bg-accent-green/5"
      : "border-accent-amber/30 bg-accent-amber/5";
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-brand-300" />
          <div>
            <div className="text-sm font-semibold">{level} · {title}</div>
            <div className="text-[10px] text-ink-tertiary">{description}</div>
          </div>
        </div>
        {run ? (
          <div
            className={`text-right ${run.passed ? "text-accent-green" : "text-accent-amber"}`}
          >
            <div className="text-xl font-bold">{run.score}/100</div>
            <div className="text-[10px] uppercase tracking-wider">
              {run.passed ? "passed" : "not yet"}
            </div>
          </div>
        ) : (
          <div className="text-right text-[10px] text-ink-tertiary">
            not run yet
          </div>
        )}
      </div>

      {run && (
        <ul className="mt-3 space-y-1">
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
      )}
    </div>
  );
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}
