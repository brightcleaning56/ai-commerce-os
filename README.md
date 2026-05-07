# AI Commerce OS

Autonomous AI commerce agent network — finds trending products, matches buyers, and drafts personalized outreach end-to-end. Built with Next.js 14, Tailwind, and Anthropic Claude.

## What's in the box

- **34 pages** across public marketing, the authed app, and admin
- **3 working AI agents** wired to real Claude API calls (Trend Hunter, Buyer Discovery, Outreach) with deterministic fallbacks if no API key is set
- **Real signal scraping** from Reddit (6 subs) + Hacker News (Show HN launches) feeding the Trend Hunter
- **Auto-pipeline** at `/pipeline` chains all 3 agents in one click
- **⌘K command palette** (Ctrl+K on Windows) with global search across pages, products, buyers, suppliers, and actions
- **CSV exports** from Reports, Audit Logs, System Logs, Quote Builder, Invoices
- **Persistent client state** for settings, branding, watchlist, installed agents, integrations, risk actions, tasks, and global kill-switch (all `localStorage`)

## Quick start (local)

```bash
npm install
cp .env.local.example .env.local      # then paste your ANTHROPIC_API_KEY
npm run dev                            # http://localhost:3000
```

The app works without an API key — agents fall back to deterministic stubs that still demonstrate the architecture. Set `ANTHROPIC_API_KEY` for live Claude calls.

## Deploy to Vercel

See [DEPLOY.md](./DEPLOY.md) for the full walkthrough. Short version:

```bash
npm i -g vercel       # if needed
vercel                # follow prompts
vercel env add ANTHROPIC_API_KEY production
vercel --prod
```

## Architecture

```
Trend Hunter  →  Buyer Discovery  →  Outreach
(Haiku 4.5)      (Haiku 4.5)         (Sonnet 4.6)
     ↓                ↓                    ↓
  scrapes        takes product       takes buyer
  Reddit + HN    suggests buyers     drafts email,
                                     LinkedIn, SMS
     ↓                ↓                    ↓
              JSON store (./data in dev, /tmp on Vercel)
```

Storage is JSON-file-backed via `lib/store.ts`. On Vercel it writes to `/tmp` (per-instance, ephemeral). Drop in Vercel KV or Postgres when you're ready to make it durable cross-instance.

## Key paths

| Surface | What it does |
|---|---|
| `/welcome` | Public landing page |
| `/signup` | 5-step onboarding wizard |
| `/login` | Sign-in |
| `/` | Authed dashboard (Command Center) |
| `/pipeline` | One-click auto-chain of all 3 agents |
| `/products` | Trend Hunter output, with "Run Trend Scan" |
| `/signals` | Live Reddit + HN scrape |
| `/buyers` | Buyer Discovery output |
| `/outreach` | Drafts queue + campaign manager |
| `/agent-runs` | Every agent execution with status, tokens, cost |
| `/admin` | Super admin console + global kill-switch |

## Env vars

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | optional | Live Claude calls. Without it, agents use deterministic fallbacks. |
| `ANTHROPIC_MODEL_CHEAP` | optional | Override cheap-tier model (default `claude-haiku-4-5`) |
| `ANTHROPIC_MODEL_SMART` | optional | Override smart-tier model (default `claude-sonnet-4-6`) |

## Project layout

```
app/
  (marketing)/   public landing, signup, login
  (app)/         authed app (sidebar layout)
  api/           server routes (agents + data)
components/      shared UI (Sidebar, TopBar, Drawer, Toast, CommandPalette)
lib/
  agents/        Trend Hunter, Buyer Discovery, Outreach
  scrapers/      Reddit + HN
  anthropic.ts   SDK client
  store.ts       JSON-file persistence (mem-mirrored)
  csv.ts         download helper
data/            local persistence (gitignored)
```
