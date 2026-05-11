// Netlify Scheduled Function: auto-promote sweep cron.
//
// Schedule defined in netlify.toml — runs hourly at :15 (offset from the
// other top-of-hour crons so they don't pile up).
//
// Calls /api/cron/auto-promote-sweep, which scans leads from the last 30
// days and promotes any unpromoted ones whose score has crossed the
// AUTO_PROMOTE_LEAD_SCORE threshold. Belt-and-suspenders for the
// synchronous auto-promote path on /api/leads.
//
// Failures are logged to Netlify Function logs but never throw — a failed
// cron tick should NOT block the next scheduled run.

export default async () => {
  const baseUrl =
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    "http://localhost:3000";

  const cronSecret = process.env.CRON_SECRET;
  const headers = {};
  if (cronSecret) headers["Authorization"] = `Bearer ${cronSecret}`;

  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/cron/auto-promote-sweep`, { headers });
    const body = await res.text();
    const elapsed = Date.now() - start;
    if (!res.ok) {
      console.warn(`[cron-auto-promote-sweep] HTTP ${res.status} after ${elapsed}ms: ${body.slice(0, 200)}`);
      return new Response(
        JSON.stringify({ ok: false, status: res.status, elapsed }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    console.log(`[cron-auto-promote-sweep] ok in ${elapsed}ms — ${body.slice(0, 240)}`);
    return new Response(
      JSON.stringify({ ok: true, elapsed }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const elapsed = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[cron-auto-promote-sweep] failed after ${elapsed}ms:`, msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg, elapsed }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
};
