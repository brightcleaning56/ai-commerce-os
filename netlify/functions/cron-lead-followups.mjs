// Netlify Scheduled Function: lead-followup cron.
//
// Schedule defined in netlify.toml — runs daily at 10:00 UTC (30 min after
// the existing cron-followups job that handles buyer-side outreach drafts).
//
// Calls /api/cron/lead-followups, which scans inbound leads where:
//   - the AI auto-reply was sent 3+ days ago
//   - the lead is still status="new" (operator hasn't manually contacted)
// and fires a shorter second-touch nudge via Anthropic + Postmark.
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
    const res = await fetch(`${baseUrl}/api/cron/lead-followups`, { headers });
    const body = await res.text();
    const elapsed = Date.now() - start;
    if (!res.ok) {
      console.warn(`[cron-lead-followups] HTTP ${res.status} after ${elapsed}ms: ${body.slice(0, 200)}`);
      return new Response(
        JSON.stringify({ ok: false, status: res.status, elapsed }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    console.log(`[cron-lead-followups] ok in ${elapsed}ms — ${body.slice(0, 200)}`);
    return new Response(
      JSON.stringify({ ok: true, elapsed }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const elapsed = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[cron-lead-followups] failed after ${elapsed}ms:`, msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg, elapsed }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
};
