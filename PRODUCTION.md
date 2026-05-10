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

## Step 6.5 — Transaction orchestration (Stripe + contracts + shipping)

The platform handles full deal lifecycle: proposal → signature → escrow → ship → release → supplier payout. Three modes mirror the email/SMS pattern:

| Mode | When | Behavior |
|---|---|---|
| `simulated` | No `STRIPE_SECRET_KEY` set | Pay/escrow/release happen locally — no real money moves |
| `sandbox` | `STRIPE_SECRET_KEY=sk_test_...` | Real Stripe Checkout with test cards |
| `live` | `STRIPE_SECRET_KEY=sk_live_...` AND `STRIPE_LIVE=true` | Real money. Both required. |

### Stripe (payment + escrow + refunds)

```bash
# 1. Create a Stripe account, complete activation
#    https://dashboard.stripe.com → toggle Test/Live in top nav

# 2. Standard Connect (or Destination Charges) for supplier payouts
#    https://stripe.com/connect — onboard each supplier separately

# 3. Set keys (use sk_test_ first; promote to sk_live_ when ready)
vercel env add STRIPE_SECRET_KEY production         # sk_test_... or sk_live_...
vercel env add STRIPE_PUBLISHABLE_KEY production    # pk_test_... or pk_live_...
vercel env add STRIPE_LIVE production               # value: true (ONLY after sandbox testing)

# 4. Webhook endpoint — Stripe → Developers → Webhooks → Add endpoint
#    URL: https://<your-domain>/api/webhooks/stripe
#    Events: checkout.session.completed, payment_intent.payment_failed, charge.refunded
#    Copy the signing secret:
vercel env add STRIPE_WEBHOOK_SECRET production     # whsec_...

# 5. Platform economics (basis points — 800 = 8%)
vercel env add PLATFORM_FEE_BPS production          # default 800 (8%)
vercel env add ESCROW_FEE_BPS production            # default 100 (1%)
```

The webhook verifier is `lib/payments.ts` + `app/api/webhooks/stripe/route.ts`. It checks HMAC-SHA256 with 5-minute replay protection. Without `STRIPE_WEBHOOK_SECRET`, the endpoint returns 503 (refuses unsigned bodies).

### Supplier onboarding (Stripe Connect Express)

For real money to flow to suppliers on `delivered → released → completed`,
each supplier needs a Stripe Connect account that AVYN's platform owns
(Express type). The platform creates the account, the supplier completes
KYC via Stripe's hosted onboarding, and the account ID is stored on the
transaction. At capture time, Stripe automatically routes the supplier
portion via `payment_intent_data[transfer_data][destination]`.

```bash
# 1. Enable Connect on your Stripe dashboard (Test or Live)
#    https://dashboard.stripe.com/test/connect/accounts/overview
#    Choose "Platform or marketplace" + "Express accounts"

# 2. Set the platform fee + escrow fee in basis points (already covered above)
#    These end up in payment_intent_data[application_fee_amount] at checkout time

# 3. Configure return / refresh URLs in your account settings
#    Return URL:  https://<your-domain>/transactions?connected={txnId}
#    Refresh URL: https://<your-domain>/api/transactions/{txnId}/connect-supplier/refresh
#    (AVYN generates AccountLinks dynamically — Stripe uses these as fallbacks
#     only when the platform-supplied URLs in the AccountLink request fail.)
```

**Operator workflow:**

1. Open `/transactions`, expand a transaction in `signed` or `escrow_held` state
2. The "Supplier Connect" panel shows the current onboarding status
3. Click **Onboard Supplier** — opens Stripe-hosted onboarding in a new tab.
   The platform creates an Express account in the background, persists the
   `acct_xxx` to the transaction, and redirects the operator to the URL.
4. Operator copies the URL and sends it to the supplier (or the supplier is
   sitting next to them — depends on workflow). Supplier completes KYC.
5. Stripe redirects back to `/transactions?connected={id}`. The panel now
   shows "Charges + payouts enabled."
6. From here, every `pay` call passes `destinationAccountId` to Checkout, so
   the supplier gets paid the moment Stripe captures the payment minus the
   platform + escrow fees. Release/completion is just state-machine plumbing
   on AVYN's side — Stripe already moved the money.

In **simulated mode** (no `STRIPE_SECRET_KEY`), the onboarding flow fakes
end-to-end so the operator UI can be demoed: a synthetic `sim_acct_*`
gets persisted, and the panel always reads "Charges + payouts enabled."
This lets you build the workflow without needing real Stripe creds.

### Auto-release escrow (no orphan funds)

The platform shouldn't hold buyer funds indefinitely if the operator
forgets to click Release. The **`cron-auto-release`** scheduled function
runs every 6 hours and finds transactions in `delivered` state whose
`deliveredAt` is older than `AUTO_RELEASE_HOURS` (default 168h = 7 days)
without a dispute, then drives them through `released → completed`.

```bash
# Default: auto-release 7 days post-delivery
vercel env add AUTO_RELEASE_HOURS production    # default 168 (7 days)
# Set to a smaller window for active markets, larger for high-trust
# wholesale flows. Below 24 hours we recommend keeping manual-only.
```

The /transactions UI surfaces this on every delivered transaction:
"Auto-releases in ~3d if no dispute" countdown next to the **Release
Now** button. Once a transaction crosses the threshold, the UI says
"Eligible for auto-release at next cron tick" so the operator knows
manual action is no longer required.

Auto-released transactions get an extra detail line on their
stateHistory:
> Auto-released after 168h post-delivery (no dispute raised)

so they're visually distinct in `/admin/audit` from operator-released
ones.

### Contracts

```bash
# Default: in-app clickwrap signature (signer name + IP + UA stored)
vercel env add CONTRACT_MODE production             # in-app  (default)

# To enable DocuSign envelopes instead:
vercel env add CONTRACT_MODE production             # docusign
vercel env add DOCUSIGN_INTEGRATION_KEY production
vercel env add DOCUSIGN_USER_ID production
vercel env add DOCUSIGN_ACCOUNT_ID production
vercel env add DOCUSIGN_PRIVATE_KEY production      # RSA private key (escape newlines)
```

### Shipping & tracking

```bash
# Default: manual entry (operator types carrier + tracking number)
vercel env add SHIPPING_MODE production             # manual  (default)

# To enable Shippo for automated label + live tracking:
vercel env add SHIPPING_MODE production             # shippo
vercel env add SHIPPO_TOKEN production              # shippo_test_... or shippo_live_...
```

### Verifying the full flow before going live

```bash
# 1. Create a quote, accept it → /api/transactions  (POST quoteId)
# 2. Operator dashboard /transactions → Send Proposal (draft → proposed)
# 3. Open the buyer link in a private tab → sign + pay (Stripe test card 4242…)
# 4. Watch /api/webhooks/stripe receive checkout.session.completed
# 5. Operator dashboard → Mark Shipped → Confirm Delivered → Release to Supplier
# 6. /earnings should show the platform fee + escrow fee in "Live Platform Revenue"
```

`STRIPE_LIVE=true` is the dead-man switch. Even with `sk_live_` set, charges run in sandbox mode unless `STRIPE_LIVE=true`. This prevents accidentally charging real cards during a misconfigured deploy.

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
