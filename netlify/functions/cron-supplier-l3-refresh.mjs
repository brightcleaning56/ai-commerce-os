// Netlify Scheduled Function: supplier L3 verification refresh.
//
// Schedule defined in netlify.toml — runs daily at 04:30 UTC.
//
// Re-runs L3 (Operational Verification) for suppliers whose linked
// transactions have changed since the last L3 run. Keeps trust scores
// fresh without operator clicks. See /api/cron/supplier-l3-refresh
// for the actual logic.

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
    const res = await fetch(`${baseUrl}/api/cron/supplier-l3-refresh`, { headers });
    const body = await res.text();
    const elapsed = Date.now() - start;
    if (!res.ok) {
      console.warn(
        `[cron-supplier-l3-refresh] HTTP ${res.status} after ${elapsed}ms: ${body.slice(0, 200)}`,
      );
      return new Response(
        JSON.stringify({ ok: false, status: res.status, elapsed }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    console.log(`[cron-supplier-l3-refresh] ok in ${elapsed}ms`);
    return new Response(
      JSON.stringify({ ok: true, elapsed }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const elapsed = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[cron-supplier-l3-refresh] failed after ${elapsed}ms:`, msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg, elapsed }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
};
