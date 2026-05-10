# Netlify Deployment Guide

This is the Netlify-flavored companion to PRODUCTION.md. The architecture, security boundaries, and code are identical — only the deploy mechanics differ.

> **Owner:** Eric Moore — Ericduolo4@gmail.com
> **Netlify team:** ericduolo4 (`https://app.netlify.com/teams/ericduolo4/projects`)

---

## Quick start

```bash
# 1. Install Netlify CLI (one-time)
npm install -g netlify-cli

# 2. From the project root, sign in to your Netlify account
netlify login

# 3. Connect this project to a new Netlify site
netlify init
# - "Create & configure a new site"
# - Pick the ericduolo4 team
# - Site name: ai-commerce-os (or whatever)
# - Build command: npm run build
# - Publish directory: .next
# - (Netlify auto-detects @netlify/plugin-nextjs from netlify.toml)

# 4. Push to your repo. Netlify auto-builds + deploys.
git push origin main
```

---

## Build configuration

Already done — `netlify.toml` at the project root configures:

- `@netlify/plugin-nextjs` — the official Next.js plugin (handles App Router, API routes, middleware, edge functions automatically)
- esbuild for fast cold starts
- Two Scheduled Functions for cron (see below)
- Security headers (X-Frame-Options, etc.) on `/*`, with relaxed rules on `/share/*` and `/quote/*` so they can be embedded in pitch decks

---

## Environment variables

Set these via Netlify CLI or the dashboard:

```bash
# REQUIRED — operator identity
netlify env:set OPERATOR_NAME "Eric Moore"
netlify env:set OPERATOR_EMAIL "Ericduolo4@gmail.com"
netlify env:set OPERATOR_COMPANY "AI Commerce OS"
netlify env:set OPERATOR_TITLE "Founder"

# REQUIRED — admin auth (use the token from your local .env.local, or generate fresh)
netlify env:set ADMIN_TOKEN "$(openssl rand -hex 32)"

# REQUIRED — cron auth (different from ADMIN_TOKEN — used by Netlify scheduled functions)
netlify env:set CRON_SECRET "$(openssl rand -hex 32)"

# REQUIRED — Anthropic API
netlify env:set ANTHROPIC_API_KEY "sk-ant-..."
netlify env:set ANTHROPIC_DAILY_BUDGET_USD "25"
netlify env:set ANTHROPIC_MODEL_CHEAP "claude-haiku-4-5"
netlify env:set ANTHROPIC_MODEL_SMART "claude-sonnet-4-6"

# REQUIRED — storage (file backend doesn't work on Netlify because the build
# bundle is read-only AND there's no /tmp persistence between functions).
# You MUST switch to KV before going live.
netlify env:set STORE_BACKEND "kv"

# Public origin (used to build absolute URLs in tracked emails + webhooks)
netlify env:set NEXT_PUBLIC_APP_ORIGIN "https://your-site.netlify.app"

# OPTIONAL — staged email rollout
netlify env:set EMAIL_FROM "Ericduolo4@gmail.com"
netlify env:set EMAIL_FROM_NAME "Eric Moore — AI Commerce OS"
netlify env:set EMAIL_TEST_RECIPIENT "Ericduolo4@gmail.com"
netlify env:set EMAIL_LIVE "false"
# Then later, when ready:
# netlify env:set EMAIL_LIVE "true"

# Email provider (pick one)
netlify env:set POSTMARK_TOKEN "..."
# OR
netlify env:set RESEND_TOKEN "..."

# OPTIONAL — Stripe transaction orchestration (sandbox first, then live)
# Without these set, /transactions runs in 'simulated' mode — no real money moves.
netlify env:set STRIPE_SECRET_KEY "sk_test_..."          # sk_live_... when live
netlify env:set STRIPE_PUBLISHABLE_KEY "pk_test_..."     # pk_live_... when live
netlify env:set STRIPE_WEBHOOK_SECRET "whsec_..."        # from Stripe → Webhooks
netlify env:set STRIPE_LIVE "false"                      # set to "true" only after sandbox testing
netlify env:set PLATFORM_FEE_BPS "800"                   # 8% platform fee
netlify env:set ESCROW_FEE_BPS "100"                     # 1% escrow fee

# OPTIONAL — DocuSign instead of in-app clickwrap signature
# netlify env:set CONTRACT_MODE "docusign"               # default: in-app
# netlify env:set DOCUSIGN_INTEGRATION_KEY "..."
# netlify env:set DOCUSIGN_USER_ID "..."
# netlify env:set DOCUSIGN_ACCOUNT_ID "..."

# OPTIONAL — Shippo for label + automated tracking
# netlify env:set SHIPPING_MODE "shippo"                 # default: manual
# netlify env:set SHIPPO_TOKEN "shippo_test_..."

# OPTIONAL — first-view webhook for Slack pings
netlify env:set SHARE_FIRSTVIEW_WEBHOOK_URL "https://hooks.slack.com/services/..."
netlify env:set SHARE_FIRSTVIEW_WEBHOOK_SECRET "$(openssl rand -hex 32)"

# OPTIONAL — observability
netlify env:set LOG_LEVEL "info"
netlify env:set LOG_FORMAT "json"
netlify env:set SENTRY_DSN "..."
netlify env:set LOG_TO_SENTRY "true"
```

To list everything you've set:

```bash
netlify env:list
```

To unset:

```bash
netlify env:unset EMAIL_LIVE
```

---

## Storage — switch from file to KV

The file backend uses `./data` (local) or `/tmp/...` (Vercel). On Netlify, **neither works** — Netlify Functions don't share `/tmp` between invocations and the deploy bundle is read-only.

You have two clean options:

### Option A: Upstash Redis (recommended — free tier is generous)

```bash
# 1. Sign up at https://upstash.com, create a Redis database
# 2. Copy the REST URL + REST TOKEN

npm install @upstash/redis

netlify env:set STORE_BACKEND "kv"
netlify env:set UPSTASH_REDIS_REST_URL "https://your-instance.upstash.io"
netlify env:set UPSTASH_REDIS_REST_TOKEN "your-token"
```

The KV adapter (`lib/store-backends/kv.ts`) auto-detects Upstash via dynamic import — no code changes needed.

### Option B: Netlify Blobs (if you want everything in-platform)

Netlify Blobs is a key-value store provided by Netlify itself. Not yet wired into our KV adapter, but you could add it:

1. Create `lib/store-backends/netlify-blobs.ts` implementing the same `StoreBackend` interface
2. Use `import { getStore } from "@netlify/blobs"` — auto-authenticates on Netlify
3. Wire it into the backend selector in `lib/store.ts`

For now, **Upstash is the path of least resistance.**

---

## Cron / scheduled functions

`netlify.toml` already configures two scheduled functions:

| Function | Schedule | What it does |
|---|---|---|
| `cron-pipeline` | `0 */6 * * *` | Every 6 hours: trigger an autonomous pipeline run |
| `cron-followups` | `30 9 * * *` | Daily 09:30 UTC: scan for stale drafts, generate followups |

These live in `netlify/functions/cron-*.mjs`. They're thin wrappers — they internally call `/api/cron/pipeline` and `/api/cron/followups` on the same site, with the `CRON_SECRET` Bearer header.

### Verify cron is wired

After deploy:

```bash
# Trigger manually
netlify functions:invoke cron-pipeline

# Or hit the endpoint directly (must include CRON_SECRET)
curl https://your-site.netlify.app/.netlify/functions/cron-pipeline
```

Watch the logs:

```bash
netlify functions:log cron-pipeline --tail
```

### Pause cron without redeploy

```bash
netlify env:set CRON_ENABLED "false"
# Cron still fires but the route returns { skipped: true } immediately
```

---

## Domain + HTTPS

Netlify provisions HTTPS automatically. To use a custom domain:

1. Netlify dashboard → site → Domain management → Add custom domain
2. Update DNS at your registrar:
   - Apex: `A 75.2.60.5` (Netlify's load balancer)
   - `www`: `CNAME your-site.netlify.app`
3. Update `NEXT_PUBLIC_APP_ORIGIN` to the custom domain

```bash
netlify env:set NEXT_PUBLIC_APP_ORIGIN "https://app.yourdomain.com"
```

---

## Branch deploys + previews

Netlify auto-deploys every push:
- Pushes to `main` → production at `https://your-site.netlify.app`
- Pushes to other branches → preview at `https://<branch-slug>--your-site.netlify.app`

Preview deploys get their own env (defined in dashboard or `netlify.toml`). For staging/testing real emails:

```bash
# Set staging-only env vars
netlify env:set EMAIL_LIVE "false" --context deploy-preview
netlify env:set EMAIL_TEST_RECIPIENT "Ericduolo4@gmail.com" --context deploy-preview
```

---

## Logs + observability

```bash
# Tail all function logs
netlify functions:log --tail

# Tail a specific function
netlify functions:log cron-pipeline --tail
```

The structured JSON logger (`lib/logger.ts`) emits `{ts, level, msg, ctx}` lines that Netlify's log search can filter.

For Sentry: install `@sentry/nextjs`, set `SENTRY_DSN`, set `LOG_TO_SENTRY=true`. Errors auto-bridge from the logger.

---

## Pre-launch checklist (Netlify-specific)

| Check | How |
|---|---|
| `netlify.toml` committed | `git status` |
| `STORE_BACKEND=kv` set | `netlify env:list` |
| Upstash creds set + `@upstash/redis` installed | `netlify env:list` shows the URL/token; `package.json` has `@upstash/redis` |
| `ADMIN_TOKEN` set | `netlify env:list` |
| `CRON_SECRET` set | `netlify env:list` |
| `ANTHROPIC_DAILY_BUDGET_USD` set | `netlify env:list` |
| Cron scheduled functions deploy | `netlify functions:list` shows `cron-pipeline` + `cron-followups` |
| Manual cron invocation works | `netlify functions:invoke cron-pipeline` returns `{ok:true}` |
| `/api/admin/health` requires Bearer token | curl test with + without `Authorization` header |
| `/signin` reachable | open `https://your-site.netlify.app/signin` |
| Sign in with `ADMIN_TOKEN` works, sets cookie | sign in via UI, then `/pipeline` loads |
| Email staged rollout: redirected sends arrive | run pipeline, verify email at `EMAIL_TEST_RECIPIENT` |
| Cron actually fires | wait 6h, check `/api/cron/status` shows recent runs |

---

## Differences from Vercel deploy (PRODUCTION.md)

If you've read PRODUCTION.md:

| Concern | Vercel | Netlify |
|---|---|---|
| Cron config | `vercel.json` `crons:` array | `netlify.toml` `[functions."name"]` + wrapper functions |
| Env vars | `vercel env add` | `netlify env:set` |
| Storage | `@vercel/kv` (free tier ok) | `@upstash/redis` (free tier ok) |
| Edge runtime | Native | Via `@netlify/plugin-nextjs` |
| Dashboard | vercel.com/dashboard | app.netlify.com |
| Function logs | `vercel logs` | `netlify functions:log` |

The application code is **100% the same**. PRODUCTION.md's content for auth, GDPR, webhooks, observability, agent prompts, etc. all applies unchanged.

---

## What I prepared for you in this checkpoint

- ✅ `netlify.toml` — build config + plugin + scheduled-function declarations + security headers
- ✅ `netlify/functions/cron-pipeline.mjs` — wrapper for /api/cron/pipeline (every 6h)
- ✅ `netlify/functions/cron-followups.mjs` — wrapper for /api/cron/followups (daily 9:30 UTC)
- ✅ This `NETLIFY.md` deploy guide

## What you need to do

1. **Push the repo to GitHub/GitLab** (Netlify connects via Git)
2. **Run `netlify init`** to connect your team `ericduolo4` to this project
3. **Set the env vars** listed above (especially `STORE_BACKEND=kv`, `ADMIN_TOKEN`, `ANTHROPIC_API_KEY`, `CRON_SECRET`)
4. **Install Upstash Redis** (`npm install @upstash/redis`) and add the URL/token env vars
5. **First deploy** — Netlify auto-builds via `@netlify/plugin-nextjs`
6. **Verify cron fires** — `netlify functions:invoke cron-pipeline`
7. **Sign in at** `/signin` with your `ADMIN_TOKEN`

That's it. Same architecture, same security boundary, same agents — just running on Netlify instead of Vercel.
