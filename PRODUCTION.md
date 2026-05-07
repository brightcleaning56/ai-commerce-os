# Production Deployment Checklist

This document is the bridge between "great demo" and "I'd run my real business on this." Follow it in order — each section assumes the previous ones are done.

---

## TL;DR — what changes vs. dev

| Concern | Dev (default) | Production |
|---|---|---|
| Storage | JSON files in `./data` | Vercel KV or Upstash Redis |
| Auth | Open (no gate) | `ADMIN_TOKEN` cookie/bearer required |
| Cron | Anyone can hit `/api/cron/*` | `CRON_SECRET` required |
| Spend | Tracked but no cap | `ANTHROPIC_DAILY_BUDGET_USD` enforced |
| Email | Simulated | Real Postmark/Resend with `EMAIL_LIVE=true` |
| SMS | Simulated | Real Twilio with `SMS_LIVE=true` |
| Errors | Console logs | Sentry (optional) + structured JSON logs |
| Webhooks | Unsigned outbound | HMAC-signed via `SHARE_FIRSTVIEW_WEBHOOK_SECRET` |

---

## Step 1 — Persistent storage (REQUIRED)

The default file backend uses `/tmp` on Vercel — **ephemeral**. Lambda recycles wipe everything (drafts, quotes, share links, access logs). You MUST switch to a persistent backend before going live.

### Option A: Vercel KV

```bash
# 1. Create a KV database in the Vercel dashboard
#    https://vercel.com/dashboard → your project → Storage → Create → KV

# 2. Install the package
npm install @vercel/kv

# 3. Vercel auto-injects KV_URL, KV_REST_API_TOKEN, KV_REST_API_READ_ONLY_TOKEN
#    into your project env. Verify in: Project Settings → Environment Variables.

# 4. Set the backend choice
vercel env add STORE_BACKEND production
# value: kv
```

### Option B: Upstash Redis (works on any host)

```bash
npm install @upstash/redis
# In env:
STORE_BACKEND=kv
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

### Migrate existing data (if you've been running on file backend)

```bash
# One-time script to copy data/*.json into KV
node scripts/migrate-to-kv.mjs   # NOT included; ~30 lines using @vercel/kv
```

If you're starting fresh on production, skip migration — first pipeline run populates everything.

### Verify

After deploy, hit `/api/admin/health` (with admin auth — see Step 2). Look for:

```json
{ "storage": { "name": "kv", "ok": true, "detail": "flavor=vercel, probe=ok" } }
```

---

## Step 2 — Admin auth (REQUIRED if multi-user)

Without `ADMIN_TOKEN` set, the entire `(app)/*` shell + every admin API is **wide open**. Anyone with the URL can run pipelines, send emails, revoke links, read access logs.

### Single-operator setup

```bash
# Generate a strong token (write it down — you'll paste it into the sign-in form)
openssl rand -hex 32
# example: 4f2c1e8a... (64 chars)

# Set in production env
vercel env add ADMIN_TOKEN production
# paste the value
```

After deploy, visiting `/` redirects to `/signin`. Paste your token. Cookie persists 30 days.

For programmatic API access (CI, scripts):

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://your-app.vercel.app/api/admin/health
```

### Multi-user setup (recommended for teams)

The `requireAdmin()` function in `lib/auth.ts` is the single auth boundary. Swap its implementation for Clerk / NextAuth / Auth0:

1. `npm install @clerk/nextjs` (or your provider of choice)
2. Wrap `app/(app)/layout.tsx` in `<ClerkProvider>`
3. Replace `requireAdmin()` body with `auth().userId` check
4. Add a `workspaceId` field to every entity in `lib/store.ts` and filter on it
5. The middleware already gates correctly — Clerk's middleware can replace ours

---

## Step 3 — Cron security

Vercel Cron sends `Authorization: Bearer $CRON_SECRET` if you've configured the secret. Without it, anyone with the URL can trigger your pipeline (and burn your Anthropic budget).

```bash
openssl rand -hex 32 | xargs -I {} vercel env add CRON_SECRET production
# Vercel auto-uses this when invoking /api/cron/*
```

`vercel.json` already has the cron schedule:

```json
{
  "crons": [
    { "path": "/api/cron/pipeline",  "schedule": "0 */6 * * *" },
    { "path": "/api/cron/followups", "schedule": "30 9 * * *" }
  ]
}
```

To pause cron without redeploying:

```bash
vercel env add CRON_ENABLED production   # value: false
```

---

## Step 4 — Spend cap (REQUIRED)

Without a cap, a buggy loop or an attacker hitting your API could run thousands of pipeline runs.

```bash
# Daily budget in USD. Calls fall back to deterministic stubs once exceeded.
vercel env add ANTHROPIC_DAILY_BUDGET_USD production   # e.g., 25
```

Default is $50. Set to `0` to disable (NOT recommended in prod).

Monitor via `GET /api/admin/spend` — returns today's totals + per-agent breakdown + 30-day history.

---

## Step 5 — Email delivery

### Provider setup

Postmark (recommended — better inbound parsing):

1. Sign up at https://postmarkapp.com
2. Create a server, verify your sending domain (SPF + DKIM + DMARC DNS records)
3. Copy the Server Token

```bash
vercel env add POSTMARK_TOKEN production
vercel env add EMAIL_FROM production   # outreach@yourdomain.com
vercel env add EMAIL_FROM_NAME production   # AVYN Wholesale
```

Or Resend:

```bash
vercel env add RESEND_TOKEN production
```

### Three-mode safety (DO NOT SKIP)

```bash
# Stage 1: leave EMAIL_LIVE unset → all sends route to EMAIL_TEST_RECIPIENT
vercel env add EMAIL_TEST_RECIPIENT staging   # your-test@gmail.com
# Run a few pipelines, verify the redirected emails arrive correctly.

# Stage 2: only AFTER you're confident, flip live mode
vercel env add EMAIL_LIVE production   # value: true
```

**Three guards must align before a real customer email goes out:**
1. Provider token set (`POSTMARK_TOKEN` or `RESEND_TOKEN`)
2. `EMAIL_LIVE=true`
3. The send endpoint actually called

Unsetting any one drops back to safe mode.

### Inbound replies (Postmark only)

In Postmark dashboard → your server → Inbound Stream → Settings:

- Webhook URL: `https://your-app.vercel.app/api/webhooks/postmark/inbound`
- HTTP Basic Auth: set username + password

```bash
vercel env add POSTMARK_INBOUND_USER production
vercel env add POSTMARK_INBOUND_PASSWORD production
```

Optionally also verify Postmark's signature (HMAC-SHA1):

```bash
vercel env add POSTMARK_SIGNING_KEY production
```

The verifier is in `lib/webhooks.ts` (`verifyPostmarkSignature`).

---

## Step 6 — SMS delivery (optional)

LinkedIn DMs have no public API — those stay simulated. SMS uses Twilio:

```bash
# 1. Sign up at twilio.com, buy a phone number, verify your sender
vercel env add TWILIO_ACCOUNT_SID production
vercel env add TWILIO_AUTH_TOKEN production
vercel env add TWILIO_FROM_NUMBER production   # +1...

# 2. Same staged rollout as email — redirect first, then go live
vercel env add SMS_TEST_RECIPIENT staging   # +1... your phone
vercel env add SMS_LIVE production   # value: true (only after testing)
```

For inbound SMS replies, set the Twilio number's webhook to `/api/webhooks/twilio/inbound` (NOT yet implemented — wire it the same way as Postmark inbound; the verifier is `verifyTwilioSignature`).

---

## Step 7 — First-view webhook (optional)

Get a Slack ping (or any HTTP POST) when a recipient opens a tracked share link for the first time.

```bash
vercel env add SHARE_FIRSTVIEW_WEBHOOK_URL production
# Slack: https://hooks.slack.com/services/T.../B.../...
# Or any URL that accepts JSON POST

vercel env add SHARE_FIRSTVIEW_WEBHOOK_SECRET production
# openssl rand -hex 32 → use this for HMAC signing
```

The receiver MUST verify the `X-AICOS-Signature` header. See:
- `examples/webhook-receiver.mjs` — runnable example
- `lib/webhooks.ts` → `verifyAicosSignature` — drop-in helper for your receiver

Test it:

```bash
curl -X POST https://your-app.vercel.app/api/share-activity/test-webhook \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Step 8 — Public app origin

Used by the system to build absolute URLs in webhook payloads + tracked email bodies:

```bash
vercel env add NEXT_PUBLIC_APP_ORIGIN production   # https://your-app.vercel.app
```

If unset, the system falls back to `req.nextUrl.origin` which works on most Vercel setups but can be wrong behind some custom proxies.

---

## Step 9 — Observability (recommended)

### Structured logs

The app already emits JSON logs in production (`lib/logger.ts`). Vercel's log tail picks them up automatically. To filter:

```bash
vercel logs --since 1h | grep '"level":"error"'
```

### Sentry (optional)

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
# Follow the prompts — sets up sentry.{client,server,edge}.config.ts

vercel env add SENTRY_DSN production
vercel env add LOG_TO_SENTRY production   # value: true
```

The structured logger automatically bridges errors to Sentry when `LOG_TO_SENTRY=true` and the package is installed. The error boundary (`app/error.tsx`) catches uncaught client-side errors. Sentry's auto-instrumentation handles the rest.

---

## Step 10 — Run the test suite

Before deploy:

```bash
npm run typecheck   # tsc --noEmit
npm test            # node --test tests/*.test.mjs
```

The test suite hits a running dev server. To run against staging:

```bash
TEST_BASE_URL=https://your-staging.vercel.app npm test
```

---

## Step 11 — DNS, domain, and HTTPS

Vercel handles HTTPS automatically. To use a custom domain:

1. Vercel → project → Settings → Domains → Add
2. Update DNS at your registrar (CNAME `cname.vercel-dns.com`)
3. Wait for cert provisioning (usually < 5 min)

Update `NEXT_PUBLIC_APP_ORIGIN` to the custom domain so absolute URLs in emails point to the right host.

---

## Step 12 — Final pre-launch checklist

| Check | How to verify |
|---|---|
| Storage is KV (not /tmp) | `GET /api/admin/health` shows `storeBackend: "kv"` |
| `ADMIN_TOKEN` set | sign-in page redirects you when you visit `/` |
| `CRON_SECRET` set | `health` shows `cronSecretEnabled: true` |
| `ANTHROPIC_DAILY_BUDGET_USD` set | `health` shows numeric budget |
| Email: staged rollout done | Run a real pipeline, verify the email arrives where expected |
| Cron actually fires | Check `/api/cron/status` shows recent runs |
| `tsc --noEmit` clean | `npm run typecheck` exits 0 |
| Tests pass | `npm test` exits 0 |
| Sentry receiving errors (if enabled) | Trigger an error: `curl /api/admin/health -H "Authorization: Bearer wrong"` and check Sentry |
| Logs are structured JSON | `vercel logs` shows `{"ts":"...","level":"info",...}` lines |

---

## What's still NOT production-grade

Honest list of remaining gaps you'd want to address based on your scale:

### Concurrency / race conditions
The store uses read-modify-write patterns. Two simultaneous PATCHes on the same draft can lose one update. With KV this is rare (most ops are atomic at the entity level) but not impossible. For high-write workloads, swap KV for Postgres + Prisma transactions.

### Multi-tenancy
The `requireAdmin()` boundary is single-tenant. To onboard multiple workspaces:
- Add `workspaceId` to every entity
- Filter every store read by `workspaceId`
- Route auth via Clerk/NextAuth and read `workspaceId` from the session

### Per-day buyer-contact rate limit
Today: dedupe within 14 days. Future: per-day cap on outreach to any one buyer (e.g., max 3 emails per buyer per week).

### LinkedIn API
There is no public LinkedIn DM API. The simulated send creates a tracked URL the operator pastes manually. If LinkedIn ever ships a real API, swap `lib/messaging.ts:sendLinkedIn`.

### Bigger pipelines
At 1000+ pipeline runs/day, the file backend's "load entire array" pattern gets slow on KV too. Move to Postgres + paginated queries.

### Anthropic retry/backoff
The SDK has built-in retries but they're conservative. For long-running pipelines, wrap calls in your own retry logic with jitter.

---

## Operational runbook

**Daily:**
- Check `/api/admin/spend` — make sure no surprise budget burns
- Check `/api/admin/health` — `ok: true` everywhere

**On suspicious activity:**
- A leaked share link: revoke it from the Pipeline page or `POST /api/share/[id]/revoke?token=<token>`
- Compromised admin token: rotate via `vercel env`, redeploy, all cookies become invalid

**Pause everything:**
```bash
vercel env add CRON_ENABLED production   # value: false
vercel env add EMAIL_LIVE production     # value: false
```

This stops cron pipeline runs and forces all sends to simulated.

---

## Support

Issues / improvements: file in your fork's GitHub. The architecture is intentionally modular — most production hardening is a single-file swap.
