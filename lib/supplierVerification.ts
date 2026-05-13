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
