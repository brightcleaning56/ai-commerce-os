// Netlify Scheduled Function: stale approvals digest.
//
// Schedule defined in netlify.toml — runs hourly.
//
// Scans cadence-scheduled queue items where requiresApproval=true
// and createdAt > STALE_APPROVAL_HOURS (default 24) ago. Posts a
// digest to SLACK_WEBHOOK_URL when there's anything to report.
// See /api/cron/stale-approvals for the actual logic.

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
    const res = await fetch(`${baseUrl}/api/cron/stale-approvals`, { headers });
    const body = await res.text();
    const elapsed = Date.now() - start;
    if (!res.ok) {
      console.warn(`[cron-stale-approvals] HTTP ${res.status} after ${elapsed}ms: ${body.slice(0, 200)}`);
      return new Response(
        JSON.stringify({ ok: false, status: res.status, elapsed }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    console.log(`[cron-stale-approvals] ok in ${elapsed}ms`);
    return new Response(
      JSON.stringify({ ok: true, elapsed }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const elapsed = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[cron-stale-approvals] failed after ${elapsed}ms:`, msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg, elapsed }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
};
