import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/cron-trigger â€” admin-only.
 *
 * Lets the operator manually fire a cron handler from /admin/system-health
 * instead of waiting for the next scheduled tick. Useful for:
 *  - Verifying daily-digest output before the 9am UTC fire
 *  - Smoke-testing lead-followups after Postmark approval lands
 *  - Triggering auto-promote-sweep after raising the threshold
 *
 * Implementation: this endpoint runs server-side, looks up CRON_SECRET
 * from env, and makes a server-internal fetch to the matching cron route
 * with Authorization: Bearer ${CRON_SECRET}. The client never sees the
 * cron secret. Crons authenticate the same way they would from Netlify.
 *
 * Body: { kind: "lead-followups" | "outreach-jobs" | "followups" |
 *               "auto-promote-sweep" | "daily-digest" }
 *
 * Pipeline (the most expensive cron) is intentionally NOT triggerable
 * here â€” that's what the /pipeline page's "Run Pipeline" button is for,
 * with proper config inputs.
 */
type TriggerableKind =
  | "lead-followups"
  | "outreach-jobs"
  | "followups"
  | "auto-promote-sweep"
  | "daily-digest";

const KIND_TO_PATH: Record<TriggerableKind, string> = {
  "lead-followups": "/api/cron/lead-followups",
  "outreach-jobs": "/api/cron/outreach-jobs",
  followups: "/api/cron/followups",
  "auto-promote-sweep": "/api/cron/auto-promote-sweep",
  "daily-digest": "/api/cron/daily-digest",
};

const VALID_KINDS = Object.keys(KIND_TO_PATH) as TriggerableKind[];

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const body = await req.json().catch(() => ({}));
  const kind = body?.kind as TriggerableKind | undefined;
  if (!kind || !VALID_KINDS.includes(kind)) {
    return NextResponse.json(
      {
        error: `\`kind\` must be one of: ${VALID_KINDS.join(", ")}`,
      },
      { status: 400 },
    );
  }

  // Derive the origin from the incoming request so we proxy to ourselves
  // on the same host (works on Netlify, Vercel, localhost). req.nextUrl is
  // the canonical source.
  const origin = req.nextUrl.origin;
  const target = `${origin}${KIND_TO_PATH[kind]}`;

  // CRON_SECRET might not be set in dev. requireCron() accepts unauthenticated
  // calls in that case (it returns ok:true with mode:"dev"). Mirror that here
  // so the operator can test crons locally without setting CRON_SECRET.
  const cronSecret = process.env.CRON_SECRET;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cronSecret) {
    headers.Authorization = `Bearer ${cronSecret}`;
  }

  const startedAt = Date.now();
  let resp: Response;
  try {
    resp = await fetch(target, {
      method: "GET",
      headers,
      // Match Netlify's cron behavior -- no caching, no cookies.
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Network error proxying to cron",
        kind,
        target,
      },
      { status: 502 },
    );
  }

  const payload = await resp.json().catch(() => ({}));
  return NextResponse.json({
    ok: resp.ok,
    kind,
    target,
    statusCode: resp.status,
    durationMs: Date.now() - startedAt,
    // Pass through the cron handler's full response so the operator can see
    // exactly what it did (sent/skipped/errored counts, summary line, etc).
    payload,
  });
}
