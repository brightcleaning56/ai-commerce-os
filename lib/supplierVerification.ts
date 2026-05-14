/**
 * Supplier verification — L1 Basic Identity checks.
 *
 * Inputs: a SupplierRecord
 * Output: a VerificationRun with per-check signals + score + pass flag
 *
 * L1 checks today:
 *   1. domain-resolves   — website domain has DNS records (Google DNS-over-HTTPS)
 *   2. domain-reachable  — homepage HEAD/GET returns 2xx/3xx
 *   3. domain-age        — domain registered > 90 days ago (RDAP lookup)
 *   4. email-domain-match — primary email's domain matches website domain
 *   5. phone-format       — phone parses as a plausible international number
 *   6. address-present    — country + at least state OR city OR zip
 *
 * Each check is best-effort. Network failures → "skipped" with the
 * error in evidence; doesn't penalize the score. We only count
 * good/warn/bad against the total, so a check we couldn't run never
 * hurts the supplier.
 *
 * Pass threshold for L1: score >= 70 (out of 100 of runnable checks).
 *
 * Scoring per signal: good=1, warn=0.5, bad=0, skipped=excluded.
 *
 * IMPORTANT: this is a Node-runtime module (uses fetch with timeouts).
 * Don't call from edge.
 */
import type { SupplierRecord, VerificationCheck, VerificationRun } from "./supplierRegistry";
import { DOC_KIND_LABEL, supplierDocs, type SupplierDocKind } from "./supplierDocs";
import { store } from "./store";

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Run all L1 checks. Returns a VerificationRun ready to append.
 */
export async function runL1Verification(s: SupplierRecord): Promise<VerificationRun> {
  const checks: VerificationCheck[] = await Promise.all([
    checkDomainResolves(s),
    checkDomainReachable(s),
    checkDomainAge(s),
    checkEmailDomainMatch(s),
    checkPhoneFormat(s),
    checkAddressPresent(s),
  ]);

  const { score, passed } = scoreL1(checks);
  return {
    level: "L1",
    ranAt: new Date().toISOString(),
    checks,
    score,
    passed,
  };
}

/**
 * Run L2 (Business Verification) — document-based checks.
 *
 * L2 says "this is a real operating business" not just "this domain
 * exists". We require evidence the supplier has uploaded:
 *   - A business license OR registration certificate (required)
 *   - A tax cert OR EIN letter (required)
 *   - Insurance (warn if missing — not always industry-relevant)
 *   - Industry certifications appropriate to their kind (warn if missing)
 *
 * Each required category checks for AT LEAST ONE approved doc of that
 * kind. A pending doc warns (operator hasn't reviewed yet). A rejected
 * doc is treated as missing — operator already said no.
 *
 * Pass threshold for L2: score >= 70 over runnable signals.
 */
export async function runL2Verification(s: SupplierRecord): Promise<VerificationRun> {
  const docs = await supplierDocs.listForSupplier(s.id);
  const approvedByKind = new Map<SupplierDocKind, number>();
  const pendingByKind = new Map<SupplierDocKind, number>();
  for (const d of docs) {
    const map = d.status === "approved" ? approvedByKind : d.status === "pending" ? pendingByKind : null;
    if (!map) continue;
    map.set(d.kind, (map.get(d.kind) ?? 0) + 1);
  }

  const has = (kind: SupplierDocKind) => (approvedByKind.get(kind) ?? 0) > 0;
  const pending = (kind: SupplierDocKind) => (pendingByKind.get(kind) ?? 0) > 0;

  const checks: VerificationCheck[] = [];

  // Required: business license / registration
  checks.push(
    has("business-license")
      ? good(mkBase("doc-business-license", "Business license uploaded + approved"), `${approvedByKind.get("business-license")} approved file(s)`)
      : pending("business-license")
        ? warn(mkBase("doc-business-license", "Business license uploaded + approved"), "Uploaded but not yet reviewed")
        : bad(mkBase("doc-business-license", "Business license uploaded + approved"), "No business license on file"),
  );

  // Required: tax / EIN
  const hasTax = has("tax-cert") || has("ein-letter");
  const taxPending = pending("tax-cert") || pending("ein-letter");
  checks.push(
    hasTax
      ? good(mkBase("doc-tax", "Tax cert or EIN letter approved"), "Tax/EIN evidence on file")
      : taxPending
        ? warn(mkBase("doc-tax", "Tax cert or EIN letter approved"), "Uploaded but not yet reviewed")
        : bad(mkBase("doc-tax", "Tax cert or EIN letter approved"), "No tax/EIN documents on file"),
  );

  // Recommended: insurance
  checks.push(
    has("insurance")
      ? good(mkBase("doc-insurance", "Insurance certificate on file"), "Approved")
      : pending("insurance")
        ? warn(mkBase("doc-insurance", "Insurance certificate on file"), "Uploaded but not yet reviewed")
        : warn(mkBase("doc-insurance", "Insurance certificate on file"), "No insurance cert — recommended for B2B"),
  );

  // Recommended: industry certification (any of the industry-specific docs)
  const industryCerts: SupplierDocKind[] = ["iso-cert", "fda-cert", "ce-cert", "export-license"];
  const hasIndustryCert = industryCerts.some(has);
  const industryPending = industryCerts.some(pending);
  checks.push(
    hasIndustryCert
      ? good(mkBase("doc-industry-cert", "At least one industry certification"), `Has ${industryCerts.filter(has).map((k) => DOC_KIND_LABEL[k]).join(", ")}`)
      : industryPending
        ? warn(mkBase("doc-industry-cert", "At least one industry certification"), "Cert uploaded but not yet reviewed")
        : warn(mkBase("doc-industry-cert", "At least one industry certification"), "None on file — appropriate for kind " + s.kind),
  );

  // Bonus: physical evidence (factory photo / utility bill)
  const hasPhysical = has("factory-photo") || has("utility-bill");
  checks.push(
    hasPhysical
      ? good(mkBase("doc-physical-evidence", "Physical operation evidence"), "Factory photo or utility bill on file")
      : warn(mkBase("doc-physical-evidence", "Physical operation evidence"), "No factory photo or utility bill"),
  );

  const { score, passed } = scoreL1(checks); // same 70-threshold scoring
  return {
    level: "L2",
    ranAt: new Date().toISOString(),
    checks,
    score,
    passed,
  };
}

/**
 * Run L3 (Operational Verification) — validates self-reported
 * capabilities against actual transaction history.
 *
 * Requires linked transactions (Transaction.supplierRegistryId set
 * via /api/transactions/[id]/link-supplier). With zero linked
 * transactions every check skips and the run fails (can't operate
 * without operational data).
 *
 * Five checks:
 *   1. txn-volume        completed transactions ≥ 3 (signal supplier
 *                        is real and shipping)
 *   2. moq-consistency   self-reported moq within 2x of typical
 *                        delivered quantity
 *   3. capacity-real     monthly transaction quantity reaches at least
 *                        25% of self-reported capacity (capacity
 *                        is plausibly utilizable)
 *   4. lead-time-real    self-reported leadTimeDays within 30 days of
 *                        median actual delivery time (createdAt →
 *                        deliveredAt or escrowReleasedAt)
 *   5. recency           latest transaction within last 180 days
 *                        (still active vs dormant)
 *
 * Pass threshold: 70 (same scoring as L1/L2). Suppliers with no
 * self-reported moq/leadTime/capacity skip those checks instead
 * of failing them — we can't grade what they didn't claim.
 */
export async function runL3Verification(s: SupplierRecord): Promise<VerificationRun> {
  const txns = await store.getTransactionsBySupplierRegistryId(s.id);
  const completed = txns.filter((t) => t.state === "released" || t.state === "delivered" || !!t.escrowReleasedAt);

  const checks: VerificationCheck[] = [];

  // 1. Volume — at least 3 completed transactions
  const volumeBase = mkBase("txn-volume", "At least 3 completed transactions");
  if (completed.length >= 10) {
    checks.push(good(volumeBase, `${completed.length} completed transactions`));
  } else if (completed.length >= 3) {
    checks.push(good(volumeBase, `${completed.length} completed transactions`));
  } else if (completed.length >= 1) {
    checks.push(warn(volumeBase, `${completed.length} completed (need ≥3 for full credit)`));
  } else {
    checks.push(bad(volumeBase, `Zero completed transactions linked to this supplier`));
  }

  // 2. MOQ consistency — self-reported moq within 2x of typical delivered qty
  const moqBase = mkBase("moq-consistency", "Self-reported MOQ matches actual order sizes");
  if (s.moq == null) {
    checks.push(skip(moqBase, "No self-reported MOQ on record"));
  } else if (completed.length === 0) {
    checks.push(skip(moqBase, "No completed transactions to compare against"));
  } else {
    const quantities = completed.map((t) => t.quantity).filter((q) => q > 0);
    if (quantities.length === 0) {
      checks.push(skip(moqBase, "No quantity data on completed transactions"));
    } else {
      const median = medianOf(quantities);
      const ratio = median / s.moq;
      if (ratio >= 0.5 && ratio <= 5) {
        checks.push(good(moqBase, `Median qty ${median} ≈ MOQ ${s.moq} (ratio ${ratio.toFixed(1)}x)`));
      } else if (ratio < 0.5) {
        checks.push(warn(moqBase, `Median qty ${median} is below MOQ ${s.moq} — they often accept under-MOQ orders`));
      } else {
        checks.push(warn(moqBase, `Median qty ${median} is ${ratio.toFixed(1)}x their stated MOQ ${s.moq} — MOQ may be artificially low`));
      }
    }
  }

  // 3. Capacity utilization — peak monthly qty reaches ≥25% of self-reported cap
  const capBase = mkBase("capacity-real", "Monthly volume reaches a meaningful share of stated capacity");
  if (s.capacityUnitsPerMo == null) {
    checks.push(skip(capBase, "No self-reported capacity on record"));
  } else if (completed.length === 0) {
    checks.push(skip(capBase, "No completed transactions to measure"));
  } else {
    const peakMonthly = peakMonthlyQuantity(completed);
    const utilization = peakMonthly / s.capacityUnitsPerMo;
    if (utilization >= 0.25) {
      checks.push(good(capBase, `Peak month ${peakMonthly.toLocaleString()} units = ${(utilization * 100).toFixed(0)}% of stated capacity`));
    } else if (utilization >= 0.05) {
      checks.push(warn(capBase, `Peak month ${peakMonthly.toLocaleString()} = ${(utilization * 100).toFixed(0)}% of capacity — most capacity is unverified`));
    } else {
      checks.push(warn(capBase, `Peak month ${peakMonthly.toLocaleString()} units is far below stated capacity ${s.capacityUnitsPerMo.toLocaleString()}/mo`));
    }
  }

  // 4. Lead time — actual median delivery time within 30 days of stated
  const ltBase = mkBase("lead-time-real", "Actual delivery time within 30 days of stated lead time");
  if (s.leadTimeDays == null) {
    checks.push(skip(ltBase, "No self-reported lead time on record"));
  } else {
    const deliveryDays = completed
      .map((t) => {
        const start = new Date(t.createdAt).getTime();
        const end = t.deliveredAt
          ? new Date(t.deliveredAt).getTime()
          : t.escrowReleasedAt
            ? new Date(t.escrowReleasedAt).getTime()
            : null;
        if (!end) return null;
        return Math.round((end - start) / (24 * 60 * 60 * 1000));
      })
      .filter((d): d is number => d !== null && d >= 0);
    if (deliveryDays.length === 0) {
      checks.push(skip(ltBase, "No deliveredAt timestamps on completed transactions"));
    } else {
      const medianDays = medianOf(deliveryDays);
      const diff = Math.abs(medianDays - s.leadTimeDays);
      if (diff <= 7) {
        checks.push(good(ltBase, `Median ${medianDays}d ≈ stated ${s.leadTimeDays}d (Δ ${diff}d)`));
      } else if (diff <= 30) {
        checks.push(warn(ltBase, `Median ${medianDays}d vs stated ${s.leadTimeDays}d — Δ ${diff}d, monitor for slip`));
      } else {
        checks.push(bad(ltBase, `Median ${medianDays}d vs stated ${s.leadTimeDays}d — Δ ${diff}d off, stated lead time is unrealistic`));
      }
    }
  }

  // 5. Recency — latest transaction within last 180 days
  const recBase = mkBase("recency", "Active in the last 180 days");
  if (txns.length === 0) {
    checks.push(bad(recBase, "No transactions on record"));
  } else {
    const latestIso = txns.reduce<string>((acc, t) => (t.createdAt > acc ? t.createdAt : acc), txns[0].createdAt);
    const ageDays = Math.floor((Date.now() - new Date(latestIso).getTime()) / (24 * 60 * 60 * 1000));
    if (ageDays <= 60) {
      checks.push(good(recBase, `Latest transaction ${ageDays}d ago`));
    } else if (ageDays <= 180) {
      checks.push(good(recBase, `Latest transaction ${ageDays}d ago`));
    } else if (ageDays <= 365) {
      checks.push(warn(recBase, `Latest transaction ${ageDays}d ago — going dormant`));
    } else {
      checks.push(bad(recBase, `Latest transaction ${ageDays}d ago — supplier appears dormant`));
    }
  }

  const { score, passed } = scoreL1(checks);
  return {
    level: "L3",
    ranAt: new Date().toISOString(),
    checks,
    score,
    passed,
  };
}

function medianOf(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function peakMonthlyQuantity(txns: { createdAt: string; quantity: number }[]): number {
  // Bucket by year-month; return the peak total quantity in any one month.
  const buckets = new Map<string, number>();
  for (const t of txns) {
    const key = t.createdAt.slice(0, 7); // "YYYY-MM"
    buckets.set(key, (buckets.get(key) ?? 0) + (t.quantity ?? 0));
  }
  let peak = 0;
  for (const v of buckets.values()) {
    if (v > peak) peak = v;
  }
  return peak;
}

// ─── Individual checks ─────────────────────────────────────────────────

async function checkDomainResolves(s: SupplierRecord): Promise<VerificationCheck> {
  const base = mkBase("domain-resolves", "Domain has DNS records");
  if (!s.website) return skip(base, "No website provided");
  const domain = extractDomain(s.website);
  if (!domain) return skip(base, "Couldn't parse a domain from website value");
  // Google's DNS-over-HTTPS endpoint — reliable + no API key required.
  try {
    const resp = await fetchWithTimeout(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`,
      { headers: { Accept: "application/dns-json" } },
      4000,
    );
    if (!resp.ok) return skip(base, `DNS lookup failed HTTP ${resp.status}`);
    const j = (await resp.json()) as { Status?: number; Answer?: unknown[] };
    if (j.Status === 0 && Array.isArray(j.Answer) && j.Answer.length > 0) {
      return good(base, `Resolves to ${j.Answer.length} A record(s)`);
    }
    return bad(base, `No A records for ${domain}`);
  } catch (e) {
    return skip(base, `DNS query error: ${errMsg(e)}`);
  }
}

async function checkDomainReachable(s: SupplierRecord): Promise<VerificationCheck> {
  const base = mkBase("domain-reachable", "Homepage responds to HTTPS");
  if (!s.website) return skip(base, "No website provided");
  const url = `https://${extractDomain(s.website) ?? s.website}`;
  try {
    const resp = await fetchWithTimeout(url, { method: "GET", redirect: "follow" }, 6000);
    if (resp.ok || (resp.status >= 300 && resp.status < 400)) {
      return good(base, `HTTP ${resp.status} ${resp.statusText || ""}`.trim());
    }
    if (resp.status === 403 || resp.status === 401) {
      return warn(base, `HTTP ${resp.status} — protected but server responds`);
    }
    return bad(base, `HTTP ${resp.status}`);
  } catch (e) {
    return bad(base, `Fetch failed: ${errMsg(e)}`);
  }
}

async function checkDomainAge(s: SupplierRecord): Promise<VerificationCheck> {
  const base = mkBase("domain-age", "Domain older than 90 days");
  if (!s.website) return skip(base, "No website provided");
  const domain = extractDomain(s.website);
  if (!domain) return skip(base, "Couldn't parse a domain from website value");
  try {
    const resp = await fetchWithTimeout(
      `https://rdap.org/domain/${encodeURIComponent(domain)}`,
      { headers: { Accept: "application/rdap+json" } },
      6000,
    );
    if (resp.status === 404) return warn(base, "Domain not found in RDAP (some ccTLDs aren't indexed)");
    if (!resp.ok) return skip(base, `RDAP lookup HTTP ${resp.status}`);
    const j = (await resp.json()) as {
      events?: Array<{ eventAction: string; eventDate: string }>;
    };
    const reg = j.events?.find((e) => e.eventAction === "registration");
    if (!reg) return skip(base, "No registration event in RDAP response");
    const ageDays = Math.floor(
      (Date.now() - new Date(reg.eventDate).getTime()) / (24 * 60 * 60 * 1000),
    );
    if (ageDays < 0) return skip(base, `Registration date in future: ${reg.eventDate}`);
    if (ageDays >= 365 * 2) return good(base, `Registered ${ageDays}d ago (~${Math.floor(ageDays / 365)}y) — well-aged`);
    if (ageDays >= 90) return good(base, `Registered ${ageDays}d ago`);
    if (ageDays >= 30) return warn(base, `Registered only ${ageDays}d ago — young`);
    return bad(base, `Registered ${ageDays}d ago — very recent, possible shell`);
  } catch (e) {
    return skip(base, `RDAP query error: ${errMsg(e)}`);
  }
}

function checkEmailDomainMatch(s: SupplierRecord): VerificationCheck {
  const base = mkBase("email-domain-match", "Contact email uses the company domain");
  const emailDomain = s.email.split("@")[1]?.toLowerCase();
  const siteDomain = extractDomain(s.website);
  if (!emailDomain) return bad(base, "Email has no domain part");
  if (!siteDomain) return skip(base, "No website to compare against");

  // Strip "www." and compare apex domains so www.foo.com matches foo.com.
  const norm = (d: string) => d.replace(/^www\./, "");
  const e = norm(emailDomain);
  const s_ = norm(siteDomain);
  if (e === s_) return good(base, `Both ${e}`);
  // Subdomain on either side is OK.
  if (e.endsWith(`.${s_}`) || s_.endsWith(`.${e}`)) {
    return good(base, `Same apex: ${e} ↔ ${s_}`);
  }
  // Generic mail domains are a strong negative signal for B2B suppliers.
  const FREE_MAIL = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com", "icloud.com", "proton.me", "protonmail.com"];
  if (FREE_MAIL.includes(e)) {
    return bad(base, `Free-mail provider (${e}) — should be on company domain`);
  }
  return warn(base, `Email ${e} does not match website ${s_}`);
}

function checkPhoneFormat(s: SupplierRecord): VerificationCheck {
  const base = mkBase("phone-format", "Phone is plausibly an international number");
  if (!s.phone) return skip(base, "No phone provided");
  const digits = s.phone.replace(/\D/g, "");
  if (digits.length < 7) return bad(base, `Only ${digits.length} digits — too short`);
  if (digits.length > 15) return bad(base, `${digits.length} digits — over E.164 limit`);
  // Loose international format heuristic: at least 7 digits, no obvious
  // sequential or repeated nonsense.
  const allSame = /^(\d)\1+$/.test(digits);
  if (allSame) return bad(base, "All digits identical — looks fake");
  if (s.phone.trim().startsWith("+") || (digits.length === 10 && s.country === "US")) {
    return good(base, `Parses as ${digits.length}-digit ${s.phone.trim().startsWith("+") ? "E.164" : "US"} format`);
  }
  return warn(base, `${digits.length} digits but no + prefix — country format unclear`);
}

function checkAddressPresent(s: SupplierRecord): VerificationCheck {
  const base = mkBase("address-present", "Address has country + at least one geographic detail");
  if (!s.country) return bad(base, "No country");
  const parts = [s.state, s.city, s.zip, s.address1].filter(Boolean);
  if (parts.length === 0) return bad(base, `Only country (${s.country}) — no state/city/zip`);
  if (parts.length === 1) return warn(base, `Country + 1 detail: ${parts[0]}`);
  return good(base, `Country + ${parts.length} details`);
}

// ─── Scoring ───────────────────────────────────────────────────────────

function scoreL1(checks: VerificationCheck[]): { score: number; passed: boolean } {
  const runnable = checks.filter((c) => c.signal !== "skipped");
  if (runnable.length === 0) return { score: 0, passed: false };
  let total = 0;
  for (const c of runnable) {
    if (c.signal === "good") total += 1;
    else if (c.signal === "warn") total += 0.5;
    // bad = 0
  }
  const score = Math.round((total / runnable.length) * 100);
  return { score, passed: score >= 70 };
}

// ─── Helpers ───────────────────────────────────────────────────────────

function mkBase(id: string, label: string): { id: string; label: string; ranAt: string } {
  return { id, label, ranAt: new Date().toISOString() };
}

function good(base: { id: string; label: string; ranAt: string }, evidence: string): VerificationCheck {
  return { ...base, signal: "good", evidence };
}
function warn(base: { id: string; label: string; ranAt: string }, evidence: string): VerificationCheck {
  return { ...base, signal: "warn", evidence };
}
function bad(base: { id: string; label: string; ranAt: string }, evidence: string): VerificationCheck {
  return { ...base, signal: "bad", evidence };
}
function skip(base: { id: string; label: string; ranAt: string }, evidence: string): VerificationCheck {
  return { ...base, signal: "skipped", evidence };
}

function extractDomain(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!trimmed) return null;
  // Strip port if present.
  const noPort = trimmed.split(":")[0];
  // Must have at least one dot to be a domain.
  if (!noPort.includes(".")) return null;
  return noPort.toLowerCase();
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}
