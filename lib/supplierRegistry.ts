/**
 * Supplier Registry — real, persisted supplier records.
 *
 * INTENTIONALLY separate from lib/suppliers.ts, which is mock seed
 * data for the operator-facing /suppliers browse demo. The registry
 * is the source of truth for actual suppliers AVYN has onboarded and
 * verified.
 *
 * Identity + verification layers map to Eric's framework:
 *   L1 Basic Identity         (domain / phone / email checks)
 *   L2 Business Verification  (license uploads, tax cert, insurance)  -- future slice
 *   L3 Operational            (MOQ, capacity, lead times)              -- future slice
 *   L4 Financial / Risk       (chargebacks, disputes)                  -- future slice
 *   L5 Supply Chain Intel     (shipping lanes, warehouses)             -- future slice
 *   L6 AI Trust Score         (rolled up from L1..L5)                  -- future slice
 *
 * Tier assignment is computed from the highest verification level the
 * supplier has cleared. Today only L1 is wired; tiers reflect that.
 *
 * Node-only. Imports lib/store.ts.
 */
import crypto from "node:crypto";
import { getBackend } from "./store";
import { computeTrustScore, type TrustScoreBreakdown } from "./supplierTrustScore";

const SUPPLIERS_FILE = "suppliers-registry.json";
const MAX_RETAINED = 5000;  // ring buffer; plenty for early-stage growth

// ─── Types ─────────────────────────────────────────────────────────────

export type SupplierTier =
  | "unverified"   // signed up, nothing checked
  | "basic"        // L1 cleared
  | "verified"     // L2 cleared (license + tax)
  | "trusted"      // L3 cleared (operational verified)
  | "enterprise";  // L4+ cleared (financial + audited)

export type SupplierKind = "Manufacturer" | "Wholesaler" | "Distributor" | "Dropship";

export type VerificationSignal = "good" | "warn" | "bad" | "skipped";

export type VerificationCheck = {
  id: string;                 // stable check id: "domain-resolves", "phone-valid", etc.
  label: string;              // human-readable name
  signal: VerificationSignal;
  evidence: string;           // 1-line "why we picked this signal"
  ranAt: string;              // ISO of the check run
};

export type VerificationLevel = "L1" | "L2" | "L3" | "L4" | "L5";

export type VerificationRun = {
  level: VerificationLevel;
  ranAt: string;
  checks: VerificationCheck[];
  score: number;              // 0-100; (good=1, warn=0.5, bad=0, skipped=null/excluded)
  passed: boolean;            // score >= passThreshold for the level
};

export type SupplierRecord = {
  id: string;                   // sup_<random>
  // ── Identity (L1 inputs) ──────────────────────────────────────────
  legalName: string;            // legal entity name
  dbaName?: string;             // doing-business-as if different
  registrationNumber?: string;  // business registration / EIN
  taxId?: string;               // VAT / sales tax id
  yearFounded?: number;
  // ── Contact ───────────────────────────────────────────────────────
  email: string;                // primary contact email (lowercased on write)
  phone?: string;               // E.164 preferred
  website?: string;             // bare domain or full URL; canonicalized on write
  // ── Geographic ────────────────────────────────────────────────────
  country: string;              // ISO-3166 alpha-2
  state?: string;
  city?: string;
  address1?: string;
  zip?: string;
  // ── Classification ────────────────────────────────────────────────
  kind: SupplierKind;
  categories: string[];         // free-text categories: "Roofing", "Electronics"
  // ── Operational (L3 inputs; can be self-reported up front) ────────
  moq?: number;
  leadTimeDays?: number;
  capacityUnitsPerMo?: number;
  // ── Verification state machine ────────────────────────────────────
  tier: SupplierTier;
  verificationRuns: VerificationRun[];  // append-only audit trail
  // Cached AI Trust Score — recomputed on every appendVerificationRun.
  // Optional because pre-existing records (created before scoring
  // shipped) won't have one until their next verify run.
  trustScore?: number;
  trustScoreBreakdown?: TrustScoreBreakdown;
  // ── Lifecycle ─────────────────────────────────────────────────────
  status: "pending" | "active" | "rejected" | "suspended";
  source: "manual" | "self-signup" | "csv-import" | "agent-discovery";
  createdAt: string;
  updatedAt: string;
  // ── Operator notes ────────────────────────────────────────────────
  internalNotes?: string;
  // ── Linked transactions/relationships (denormalized counters) ─────
  transactionCount?: number;
  lastTransactionAt?: string;
};

// ─── Helpers ───────────────────────────────────────────────────────────

function canonicalizeWebsite(input?: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (!trimmed) return undefined;
  return trimmed.toLowerCase();
}

function canonicalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

// ─── Store ─────────────────────────────────────────────────────────────

export const supplierRegistry = {
  async list(filter?: {
    tier?: SupplierTier;
    status?: SupplierRecord["status"];
    country?: string;
    kind?: SupplierKind;
    query?: string;
  }): Promise<SupplierRecord[]> {
    const all = await getBackend().read<SupplierRecord[]>(SUPPLIERS_FILE, []);
    let out = all.filter(isSupplierShape);
    if (filter?.tier) out = out.filter((s) => s.tier === filter.tier);
    if (filter?.status) out = out.filter((s) => s.status === filter.status);
    if (filter?.country) out = out.filter((s) => s.country === filter.country);
    if (filter?.kind) out = out.filter((s) => s.kind === filter.kind);
    if (filter?.query) {
      const q = filter.query.toLowerCase();
      out = out.filter(
        (s) =>
          s.legalName.toLowerCase().includes(q) ||
          (s.dbaName ?? "").toLowerCase().includes(q) ||
          (s.website ?? "").includes(q) ||
          s.email.includes(q) ||
          s.categories.some((c) => c.toLowerCase().includes(q)),
      );
    }
    out.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return out;
  },

  async get(id: string): Promise<SupplierRecord | null> {
    const all = await supplierRegistry.list();
    return all.find((s) => s.id === id) ?? null;
  },

  async create(input: Omit<SupplierRecord, "id" | "createdAt" | "updatedAt" | "tier" | "verificationRuns"> & {
    tier?: SupplierTier;
  }): Promise<SupplierRecord> {
    const all = (await getBackend().read<SupplierRecord[]>(SUPPLIERS_FILE, [])).filter(isSupplierShape);
    const now = new Date().toISOString();
    const supplier: SupplierRecord = {
      ...input,
      id: `sup_${crypto.randomBytes(8).toString("hex")}`,
      email: canonicalizeEmail(input.email),
      website: canonicalizeWebsite(input.website),
      tier: input.tier ?? "unverified",
      verificationRuns: [],
      createdAt: now,
      updatedAt: now,
    };
    const next = [supplier, ...all].slice(0, MAX_RETAINED);
    await getBackend().write(SUPPLIERS_FILE, next);
    return supplier;
  },

  async update(id: string, patch: Partial<Omit<SupplierRecord, "id" | "createdAt">>): Promise<SupplierRecord | null> {
    const all = (await getBackend().read<SupplierRecord[]>(SUPPLIERS_FILE, [])).filter(isSupplierShape);
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const merged: SupplierRecord = {
      ...all[idx],
      ...patch,
      id: all[idx].id,
      email: patch.email ? canonicalizeEmail(patch.email) : all[idx].email,
      website: patch.website !== undefined ? canonicalizeWebsite(patch.website) : all[idx].website,
      updatedAt: new Date().toISOString(),
    };
    all[idx] = merged;
    await getBackend().write(SUPPLIERS_FILE, all);
    return merged;
  },

  /**
   * Append a verification run to the supplier's audit trail and re-
   * derive tier + trust score. Tier is the highest level whose latest
   * run `passed`. Score is the 0-100 rollup from lib/supplierTrustScore.
   */
  async appendVerificationRun(id: string, run: VerificationRun): Promise<SupplierRecord | null> {
    const supplier = await supplierRegistry.get(id);
    if (!supplier) return null;
    const runs = [...supplier.verificationRuns, run];
    const tier = deriveTier(runs);
    const trustScoreBreakdown = computeTrustScore({ verificationRuns: runs });
    return supplierRegistry.update(id, {
      verificationRuns: runs,
      tier,
      trustScore: trustScoreBreakdown.total,
      trustScoreBreakdown,
    });
  },
};

/**
 * Pick the highest level the supplier has cleared based on the latest
 * run per level. Today only L1 is wired but the logic supports L2-L5.
 */
function deriveTier(runs: VerificationRun[]): SupplierTier {
  // Reduce to "latest run per level"
  const latest: Partial<Record<VerificationLevel, VerificationRun>> = {};
  for (const r of runs) {
    const cur = latest[r.level];
    if (!cur || new Date(r.ranAt).getTime() > new Date(cur.ranAt).getTime()) {
      latest[r.level] = r;
    }
  }
  // Walk highest-to-lowest and return the first that passed.
  if (latest.L5?.passed) return "enterprise";
  if (latest.L4?.passed) return "enterprise";
  if (latest.L3?.passed) return "trusted";
  if (latest.L2?.passed) return "verified";
  if (latest.L1?.passed) return "basic";
  return "unverified";
}

function isSupplierShape(v: unknown): v is SupplierRecord {
  if (!v || typeof v !== "object") return false;
  const s = v as Partial<SupplierRecord>;
  return (
    typeof s.id === "string" &&
    typeof s.legalName === "string" &&
    typeof s.email === "string" &&
    typeof s.country === "string" &&
    typeof s.tier === "string" &&
    Array.isArray(s.verificationRuns)
  );
}

/**
 * Display string for a tier (used by UI labels). Owner-only.
 */
export const TIER_LABEL: Record<SupplierTier, string> = {
  unverified: "Unverified",
  basic: "Basic",
  verified: "Verified",
  trusted: "Trusted",
  enterprise: "Enterprise",
};
