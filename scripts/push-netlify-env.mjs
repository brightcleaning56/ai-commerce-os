// Push env vars to Netlify site via API
const TOKEN = process.env.NETLIFY_AUTH_TOKEN;
const SITE = process.env.SITE_ID;
if (!TOKEN || !SITE) {
  console.error("NETLIFY_AUTH_TOKEN + SITE_ID required");
  process.exit(1);
}

const envs = {
  OPERATOR_NAME: "Eric Moore",
  OPERATOR_EMAIL: "Ericduolo4@gmail.com",
  OPERATOR_COMPANY: "AVYN Commerce",
  OPERATOR_TITLE: "Founder",
  ADMIN_TOKEN: "40f92de8deecb680a06dc48dbfab4c6f9b3b9ff3bc70023e49ca9f0956c2cbe8",
  SHARE_FIRSTVIEW_WEBHOOK_SECRET: "c06cf55b4cae4496b15fff6e38490f23adcec50c8f0d52acca6f01069bc78643",
  ANTHROPIC_DAILY_BUDGET_USD: "25",
  ANTHROPIC_MODEL_CHEAP: "claude-haiku-4-5",
  ANTHROPIC_MODEL_SMART: "claude-sonnet-4-6",
  EMAIL_FROM: "Ericduolo4@gmail.com",
  EMAIL_FROM_NAME: "Eric Moore — AVYN Commerce",
  EMAIL_TEST_RECIPIENT: "Ericduolo4@gmail.com",
  EMAIL_LIVE: "false",
  OUTREACH_DEDUPE_DAYS: "14",
  LOG_FORMAT: "json",
  LOG_LEVEL: "info",
  CRON_ENABLED: "true",
  NEXT_PUBLIC_APP_ORIGIN: "https://ai-commerce-os.netlify.app",
};

const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

const siteRes = await fetch(`https://api.netlify.com/api/v1/sites/${SITE}`, { headers });
const site = await siteRes.json();
const accountSlug = site.account_slug;
console.log("  account_slug:", accountSlug);

// Free tier: scopes must be omitted (or restricted). Just set context=all.
const body = Object.entries(envs).map(([key, value]) => ({
  key,
  values: [{ value, context: "all" }],
}));

const res = await fetch(`https://api.netlify.com/api/v1/accounts/${accountSlug}/env?site_id=${SITE}`, {
  method: "POST",
  headers,
  body: JSON.stringify(body),
});
const result = await res.json();
if (!res.ok) {
  console.log("  ERR:", res.status, JSON.stringify(result).slice(0, 600));
  process.exit(1);
}
console.log("  set " + (Array.isArray(result) ? result.length : "?") + " env vars ✓");
