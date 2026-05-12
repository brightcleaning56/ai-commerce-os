// Netlify Scheduled Function: outreach-jobs cron.
//
// Schedule defined in netlify.toml — runs every 5 minutes. Picks up
// the next pending/running OutreachJob and processes up to batchSize
// (default 25) businesses per tick. A 100-business campaign clears in
// ~20 minutes (4 ticks × 25); a 1000-business job clears in ~3.5 hrs.
//
// Calls /api/cron/outreach-jobs, which is auth-gated by CRON_SECRET.

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
    const res = await fetch(`${baseUrl}/api/cron/outreach-jobs`, { headers });
    const body = await res.text();
    const elapsed = Date.now() - start;
    if (!res.ok) {
      console.warn(`[cron-outreach-jobs] HTTP ${res.status} after ${elapsed}ms: ${body.slice(0, 240)}`);
      return new Response(
        JSON.stringify({ ok: false, status: res.status, elapsed }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    console.log(`[cron-outreach-jobs] ok in ${elapsed}ms — ${body.slice(0, 240)}`);
    return new Response(
      JSON.stringify({ ok: true, elapsed }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const elapsed = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[cron-outreach-jobs] failed after ${elapsed}ms:`, msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg, elapsed }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
};
