// Netlify Scheduled Function: auto-release escrow cron.
//
// Schedule defined in netlify.toml — runs every 6 hours.
//
// Wraps the existing /api/cron/auto-release route, passing CRON_SECRET as
// Bearer auth. Finds all transactions in `delivered` whose deliveredAt is
// older than AUTO_RELEASE_HOURS (default 168 = 7 days) and runs them
// through released → completed. The platform shouldn't hold buyer funds
// forever if the operator forgets to click Release.
//
// Errors are logged to Netlify Function logs but never throw — a failed
// tick must not block the next scheduled run.

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
    const res = await fetch(`${baseUrl}/api/cron/auto-release`, { headers });
    const body = await res.text();
    const elapsed = Date.now() - start;
    if (!res.ok) {
      console.warn(`[cron-auto-release] HTTP ${res.status} after ${elapsed}ms: ${body.slice(0, 200)}`);
      return new Response(
        JSON.stringify({ ok: false, status: res.status, elapsed }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    console.log(`[cron-auto-release] ok in ${elapsed}ms · ${body.slice(0, 200)}`);
    return new Response(
      JSON.stringify({ ok: true, elapsed }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const elapsed = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[cron-auto-release] failed after ${elapsed}ms:`, msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg, elapsed }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
};
