# Deploying AVYN Commerce to Vercel

Production-ready. Follow the steps below to get a public URL.

## Prerequisites

- A [Vercel account](https://vercel.com/signup) (Hobby tier works for the demo; agents fit in 30s timeouts)
- The Vercel CLI: `npm i -g vercel`
- An [Anthropic API key](https://console.anthropic.com) (optional — agents fall back to stubs without one)

## Step 1 — Sanity check the build locally

From the repo root:

```bash
npm install
npm run build
```

You should see all 34 pages build cleanly and the API routes register as dynamic functions. If it errors, fix that before deploying.

## Step 2 — First deploy

```bash
vercel
```

The CLI will ask:
- **Set up and deploy?** Yes
- **Which scope?** Your personal account or team
- **Link to existing project?** No (first time)
- **Project name?** `ai-commerce-os` (or whatever you want)
- **Directory?** `./` (default — already correct)
- **Override settings?** No

A preview deploy URL will be printed. Visit it; without env vars, every agent will use the deterministic fallback. The flow still works end-to-end.

## Step 3 — Add the Anthropic API key

```bash
vercel env add ANTHROPIC_API_KEY
```

When prompted:
- **Value:** paste your key (`sk-ant-...`)
- **Environments:** select Production, Preview, and Development

Optional model overrides (defaults are good):

```bash
vercel env add ANTHROPIC_MODEL_CHEAP    # claude-haiku-4-5
vercel env add ANTHROPIC_MODEL_SMART    # claude-sonnet-4-6
```

## Step 4 — Add the cron secret (auto-pipeline)

The auto-pipeline runs every 6 hours via Vercel cron. To prevent unauthenticated abuse, set a secret:

```bash
# Generate one
openssl rand -hex 32

# Set it in Vercel
vercel env add CRON_SECRET production
```

Vercel automatically sends `Authorization: Bearer ${CRON_SECRET}` with every cron-triggered request. The route checks the header and rejects unauthorized calls.

To pause cron without redeploying:

```bash
vercel env add CRON_ENABLED production    # value: false
```

To re-enable, change it back to `true` (or remove it).

## Step 5 — (Optional) Real email delivery

Drafts approved in `/approvals` can fire actual emails through Postmark or Resend. Without a provider, sends are simulated locally — useful for demos.

```bash
# Pick one provider:
vercel env add POSTMARK_TOKEN production       # https://postmarkapp.com
# or:
vercel env add RESEND_TOKEN production          # https://resend.com

# Required:
vercel env add EMAIL_FROM production            # e.g. outreach@yourdomain.com
vercel env add EMAIL_FROM_NAME production       # e.g. "AVYN Wholesale"

# Strongly recommended for staging:
vercel env add EMAIL_TEST_RECIPIENT production  # e.g. you@yourdomain.com — every send redirects here

# Required to actually deliver to real buyer addresses:
vercel env add EMAIL_LIVE production            # value: true
```

**Safety logic** (in `lib/email.ts`):

1. No token → simulated send, no network call
2. Token + `EMAIL_TEST_RECIPIENT` set → real send via provider, but always to the test address
3. Token + `EMAIL_LIVE=true` → real send to actual buyer email

The default for `EMAIL_LIVE` is off, so a fresh deploy will never accidentally email the fake/sample buyer addresses that the agents generate. To go live, you must explicitly set `EMAIL_LIVE=true`.

## Step 6 — (Optional) Inbound replies → autonomous negotiation

When a real buyer replies to a sent email, Postmark can forward it to a webhook that auto-fires the Negotiation Agent. This closes the loop — replies turn into counter-offers without anyone touching the UI.

### Set up the inbound stream

1. In Postmark: **Servers → your server → Inbound stream → Settings**
2. Postmark will give you an inbound forwarding address (e.g. `1a2b3c@inbound.postmarkapp.com`). To receive replies, you need recipients to send to this address — typically you do this by setting up a custom domain inbound MX record (see Postmark's [domain inbound docs](https://postmarkapp.com/manual#inbound-domain)).
3. Set the inbound webhook URL to: `https://YOUR-DOMAIN/api/webhooks/postmark/inbound`
4. Enable **Basic Auth** in Postmark and set a username + password.

### Mirror the credentials in Vercel

```bash
vercel env add POSTMARK_INBOUND_USER production
vercel env add POSTMARK_INBOUND_PASSWORD production
vercel --prod
```

The webhook validates `Authorization: Basic …` against these env vars. Without them, requests are accepted unauthenticated — useful for local ngrok testing but unsafe in production.

### How matching works

The route runs `lib/inbound.ts` which tries (most → least confident):

1. **`In-Reply-To` header** matches a stored `messageId` on a draft → strong match
2. **From-address + normalized subject** matches the original outbound → solid match
3. **From-address only** when there's exactly one (or most-recent) draft sent to that address

Once matched, the buyer's quoted-reply chain is stripped, the cleaned text is fed to the Negotiation Agent, and a counter-offer lands in the draft thread automatically.

### Test locally without Postmark

Click **Simulate inbound reply** on any sent draft in `/outreach` — it hits `/api/inbound/test`, runs the same matcher + Negotiation Agent on a sample reply, and updates the thread.

## Step 7 — Promote to production

```bash
vercel --prod
```

Your live URL is now serving real Claude-backed agents. Open `/pipeline` and:
- Click **Run Pipeline** for a manual run — Reddit + HN scrape + 4 Claude calls in ~5–10s
- The **Auto-pipeline** card shows the next scheduled cron fire and the last run's results
- Vercel cron will fire `/api/cron/pipeline` automatically on the schedule defined in `vercel.json` (default `0 */6 * * *` = every 6 hours UTC)

## Step 8 — (Optional) Custom domain

```bash
vercel domains add yourdomain.com
vercel alias set <preview-url> yourdomain.com
```

Or do it via the Vercel dashboard: **Project → Settings → Domains**.

## What happens when you click "Run Pipeline" on production

```
Browser POSTs /api/agents/pipeline
   ↓
Vercel serverless function (max 60s) starts
   ↓
Trend Hunter Agent:
   - Scrapes 6 subreddits + Hacker News in parallel (~700ms)
   - Calls Claude Haiku 4.5 with structured-output tool
   - Persists products to /tmp/ai-commerce-os/products.json
   ↓
Buyer Discovery Agent:
   - Takes top product, calls Haiku 4.5
   - Persists buyers to /tmp/ai-commerce-os/discovered-buyers.json
   ↓
Outreach Agent (per top buyer):
   - Calls Sonnet 4.6 with structured-output tool
   - Persists drafts to /tmp/ai-commerce-os/drafts.json
   ↓
Returns full pipeline result
   ↓
Browser updates state, drafts queue refreshes
```

## Storage on Vercel — the trade-off

The default storage is JSON files in `/tmp`. This is **per-lambda-instance and ephemeral** — meaning:

- ✅ Persists for the duration of a warm function (good for "click Run, then click View" within a session)
- ❌ Cold starts wipe `/tmp`
- ❌ Different lambda instances have different `/tmp` (a user might see different data on different requests)

For a working public demo this is fine. For real production, swap in durable storage:

### Option A — Vercel KV (Redis)

```bash
vercel kv create
vercel link
vercel env pull .env.local
```

Then in `lib/store.ts`, replace the `readJSON`/`writeJSON` helpers with `kv.get()` / `kv.set()` calls. Each of the five collections (`products`, `agent-runs`, `signals`, `discovered-buyers`, `drafts`) becomes one KV key.

### Option B — Postgres (Vercel Postgres / Neon / Supabase)

Add `pg` or `@vercel/postgres`, define five tables matching the type shapes in `lib/store.ts`, replace the read/write helpers. Schema migration is straightforward — every type already has explicit fields.

## Function timeouts

`vercel.json` sets `maxDuration` per route:

| Route | Timeout |
|---|---|
| `/api/agents/pipeline` | 60s (chains 3 agents) |
| `/api/agents/trend-hunter` | 30s |
| `/api/agents/buyer-discovery` | 30s |
| `/api/agents/outreach` | 30s |
| `/api/signals/scrape` | 30s |

On Vercel Hobby, max is 10s by default — these settings require Pro. If you're on Hobby:

1. Lower the values to 10 in `vercel.json`, OR
2. The agent runs may time out on cold scrapes; warm runs usually fit. The fallback path (no API key) finishes in <1s and works fine on Hobby.

## Common gotchas

- **"Module not found: @anthropic-ai/sdk"** — run `npm install` and recommit; Vercel installs from `package.json`.
- **Reddit returns 403** — Reddit occasionally blocks Vercel IPs. The scraper falls back gracefully (signals just don't appear). HN never has this issue.
- **Costs** — Claude Haiku 4.5 runs ~$0.0001 per agent call, Sonnet 4.6 ~$0.005. A full pipeline cycle costs about $0.005–0.01.

## Cleanup

To tear down:

```bash
vercel remove ai-commerce-os --yes
```
