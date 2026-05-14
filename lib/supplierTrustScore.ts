/**
 * AI Trust Score — single 0-100 number per supplier rolled up from
 * the verification audit trail.
 *
 * Scoring model (current — L1 + L2 wired):
 *   L1 Identity       0-40  (mean signal across L1 checks × 40)
 *   L2 Business       0-40  (mean signal across L2 checks × 40)
 *   L3-L5 Future      0-20  (capped at 0 until those levels ship)
 *   Stale penalty     0 to -10  (latest run > 90 days ago)
 *   Cap               final clamped to [0, 100]
 *
 * No mock data. Suppliers with zero verification runs get 0. Suppliers
 * with only L1 max out at 40 (forcing them to upload docs for >40).
 *
 * The breakdown is persisted alongside the cached score so the UI can
 * explain WHY a supplier is at 67 vs 92 without re-reading every run.
 *
 * "AI" is generous — there's no model here. The name matches Eric's
 * spec; when we layer in Claude-based document parsing or fraud
 * scoring for L4, those signals fold into l3plus or a new bucket.
 */
import type { SupplierRecord, VerificationCheck, VerificationLevel, VerificationRun } from "./supplierRegistry";

export type TrustScoreBreakdown = {
  total: number;              // 0-100, clamped
  l1: number;                 // 0-40
  l2: number;                 // 0-40
  l3plus: number;             // 0-20 (always 0 today)
  stalePenalty: number;       // 0 to -10
  hasL1: boolean;
  hasL2: boolean;
  latestRunAt: string | null; // ISO of most recent run across all levels
  summary: string;            // 1-line plain-English explanation
  computedAt: string;
};

const STALE_THRESHOLD_DAYS = 90;
const MAX_STALE_PENALTY = 10;

export function computeTrustScore(s: Pick<SupplierRecord, "verificationRuns">): TrustScoreBreakdown {
  const latestByLevel = pickLatestPerLevel(s.verificationRuns);
  const l1Run = latestByLevel.L1;
  const l2Run = latestByLevel.L2;
  const l3Run = latestByLevel.L3;

  const l1 = l1Run ? levelToPoints(l1Run, 40) : 0;
  const l2 = l2Run ? levelToPoints(l2Run, 40) : 0;
  // L3 fills the full 20-point l3plus bucket. L4+L5 will share once
  // they're implemented (likely scaled to fit the same 20-point cap or
  // the bucket gets renamed/expanded to "advanced verification").
  const l3plus = l3Run ? levelToPoints(l3Run, 20) : 0;

  // Stale penalty — uses the LATEST run across all levels. Verification
  // certificates expire; a 6-month-old check shouldn't carry full weight.
  const latestRunAt = mostRecent([l1Run?.ranAt, l2Run?.ranAt, l3Run?.ranAt]);
  const stalePenalty = latestRunAt ? computeStalePenalty(latestRunAt) : 0;

  const raw = l1 + l2 + l3plus + stalePenalty;
  const total = Math.max(0, Math.min(100, Math.round(raw)));

  return {
    total,
    l1,
    l2,
    l3plus,
    stalePenalty,
    hasL1: !!l1Run,
    hasL2: !!l2Run,
    latestRunAt,
    summary: explainScore({
      total,
      hasL1: !!l1Run,
      hasL2: !!l2Run,
      hasL3: !!l3Run,
      l1Passed: l1Run?.passed ?? false,
      l2Passed: l2Run?.passed ?? false,
      l3Passed: l3Run?.passed ?? false,
      stalePenalty,
    }),
    computedAt: new Date().toISOString(),
  };
}

function pickLatestPerLevel(runs: VerificationRun[]): Partial<Record<VerificationLevel, VerificationRun>> {
  const out: Partial<Record<VerificationLevel, VerificationRun>> = {};
  for (const r of runs) {
    const cur = out[r.level];
    if (!cur || new Date(r.ranAt).getTime() > new Date(cur.ranAt).getTime()) {
      out[r.level] = r;
    }
  }
  return out;
}

function levelToPoints(run: VerificationRun, maxPoints: number): number {
  // Same signal weighting as the verification scoring: good=1, warn=0.5,
  // bad=0, skipped excluded. Lets us reuse the existing 0-100 score
  // logic to project onto the trust bucket.
  const runnable = run.checks.filter((c: VerificationCheck) => c.signal !== "skipped");
  if (runnable.length === 0) return 0;
  let sum = 0;
  for (const c of runnable) {
    if (c.signal === "good") sum += 1;
    else if (c.signal === "warn") sum += 0.5;
  }
  const fraction = sum / runnable.length;
  return Math.round(fraction * maxPoints);
}

function mostRecent(isos: Array<string | undefined>): string | null {
  let best: string | null = null;
  let bestTs = -Infinity;
  for (const iso of isos) {
    if (!iso) continue;
    const t = new Date(iso).getTime();
    if (t > bestTs) {
      best = iso;
      bestTs = t;
    }
  }
  return best;
}

function computeStalePenalty(latestRunIso: string): number {
  const ageDays = (Date.now() - new Date(latestRunIso).getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays <= STALE_THRESHOLD_DAYS) return 0;
  // Linear ramp: -1 point per ~10 days past threshold, capped at -10.
  const overage = ageDays - STALE_THRESHOLD_DAYS;
  const penalty = Math.min(MAX_STALE_PENALTY, Math.round(overage / 10));
  return -penalty;
}

function explainScore(input: {
  total: number;
  hasL1: boolean;
  hasL2: boolean;
  hasL3: boolean;
  l1Passed: boolean;
  l2Passed: boolean;
  l3Passed: boolean;
  stalePenalty: number;
}): string {
  if (!input.hasL1 && !input.hasL2 && !input.hasL3) {
    return "No verification yet — run L1 to start scoring.";
  }
  const bits: string[] = [];
  if (input.hasL1 && input.l1Passed) bits.push("L1 identity passed");
  else if (input.hasL1) bits.push("L1 identity needs fixes");
  if (input.hasL2 && input.l2Passed) bits.push("L2 business verified");
  else if (input.hasL2) bits.push("L2 docs need work");
  if (input.hasL3 && input.l3Passed) bits.push("L3 operational track record");
  else if (input.hasL3) bits.push("L3 operational gaps");
  if (input.stalePenalty < 0) bits.push(`stale (-${-input.stalePenalty})`);
  if (input.total >= 80) bits.unshift("Strong");
  else if (input.total >= 60) bits.unshift("Solid");
  else if (input.total >= 40) bits.unshift("Baseline");
  else bits.unshift("Weak");
  return bits.join(" · ");
}

/**
 * Band the score for badge tone purposes.
 *   >= 80 -> strong
 *   >= 60 -> solid
 *   >= 40 -> baseline
 *   < 40  -> weak
 */
export type TrustBand = "strong" | "solid" | "baseline" | "weak";
export function bandForScore(score: number): TrustBand {
  if (score >= 80) return "strong";
  if (score >= 60) return "solid";
  if (score >= 40) return "baseline";
  return "weak";
}
