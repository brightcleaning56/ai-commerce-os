/**
 * Netlify Scheduled Function: pipeline cron.
 *
 * Schedule defined in netlify.toml: `0 */6 * * *` (every 6 hours).
 *
 * This function is a thin wrapper — it calls the existing /api/cron/pipeline
 * route on the same site, passing the CRON_SECRET as Bearer auth. Keeps the
 * pipeline code path unified across deploy targets (Vercel cron also calls
 * /api/cron/pipeline directly).
 *
 * Errors are logged to Netlify Function logs (visible in the dashboard) but
 * never throw — a failed cron tick should NOT block the next scheduled run.
 */

export default async () => {
  const baseUrl =
    process.env.URL ||                    // Netlify production URL
    process.env.DEPLOY_PRIME_URL ||       // Netlify branch/preview URL
    process.env.NEXT_PUBLIC_APP_ORIGIN || // explicit override
    "http://localhost:3000";              // local fallback

  const cronSecret = process.env.CRON_SECRET;
  const headers = {};
  if (cronSecret) headers["Authorization"] = `Bearer ${cronSecret}`;

  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/cron/pipeline`, { headers });
    const body = await res.text();
    const elapsed = Date.now() - start;
    if (!res.ok) {
      console.warn(`[cron-pipeline] HTTP ${res.status} after ${elapsed}ms: ${body.slice(0, 200)}`);
      return new Response(
        JSON.stringify({ ok: false, status: res.status, elapsed }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    console.log(`[cron-pipeline] ok in ${elapsed}ms`);
    return new Response(
      JSON.stringify({ ok: true, elapsed }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const elapsed = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[cron-pipeline] failed after ${elapsed}ms:`, msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg, elapsed }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
};
