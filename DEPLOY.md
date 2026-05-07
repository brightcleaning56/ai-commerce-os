# Deploying AI Commerce OS to Vercel

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

## Step 4 — Promote to production

```bash
vercel --prod
```

Your live URL is now serving real Claude-backed agents. Open `/pipeline` and click **Run Pipeline** — Reddit + HN scrape + 3 Claude calls should complete in 5–10 seconds.

## Step 5 — (Optional) Custom domain

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
