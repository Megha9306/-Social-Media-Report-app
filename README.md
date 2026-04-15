# Social Report Agent

A multi-platform social media analytics and reporting dashboard built for agencies. Tracks post performance across Instagram, LinkedIn, Facebook, Twitter/X, and YouTube — with automated scraping, competitor benchmarking, official API integration for impressions/reach/clicks, and one-click PowerPoint/PDF exports.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Platform Support](#platform-support)
- [Backend Deep-Dive](#backend-deep-dive)
- [Frontend Deep-Dive](#frontend-deep-dive)
- [Instagram & Facebook Connector](#instagram--facebook-connector)
- [LinkedIn Connector](#linkedin-connector)
- [Twitter/X Connector](#twitterx-connector)
- [YouTube Connector](#youtube-connector)
- [Official API Integration — How It Works](#official-api-integration--how-it-works)
- [Competitor Analysis](#competitor-analysis)
- [Database Schema](#database-schema)
- [Setup & Development](#setup--development)
- [Environment Variables Reference](#environment-variables-reference)
- [Deployment](#deployment)

---

## Overview

Social Report Agent automates the tedious parts of social media reporting. You add post URLs (or entire brand profile handles), the system scrapes public engagement data via [Apify](https://apify.com) actors, calculates engagement rates, and surfaces everything in filterable dashboards and exportable reports.

When official API credentials are connected (via OAuth), impressions, reach, and clicks are auto-populated after every scrape — no manual entry needed.

**What it solves:**
- Manually copying likes/comments/views from each platform into spreadsheets
- Comparing a client's content performance against competitors across all 5 platforms
- Generating presentation-ready reports per campaign, format, or content bucket
- Tracking private metrics (impressions, reach, clicks) that scraping cannot access

---

## Features

| Feature | Description |
|---------|-------------|
| **Post Management** | Add posts by URL (auto-detects platform & format), lock posts, bulk-import from a brand profile |
| **Automated Scraping** | Smart-scheduled scraping via Apify — fresh posts scraped every 4h, older posts every 7d |
| **Official API Metrics** | Connect Meta, LinkedIn, Twitter, YouTube accounts via OAuth → impressions/reach/clicks auto-populate after every scrape |
| **Manual Metrics** | Enter impressions, reach, clicks manually when no API account is connected |
| **Brand Profiles** | Add a social handle to bulk-scrape all posts within a date range |
| **Analytics Dashboard** | Month-over-month trends, format performance, content bucket analysis, top posts |
| **Competitor Analysis** | Compare followers, engagement rate, avg likes against 2–10 competitors across all 5 platforms |
| **AI Insights** | Automated natural language insights on analytics and competitor runs (rule-based, no external API needed) |
| **CSV Export** | Full post + metrics data export |
| **PDF Export** | Screenshot-quality PDF of the analytics dashboard |
| **PowerPoint Export** | Presentation-ready PPTX with charts, KPIs, and insights |
| **Real-time Status** | WebSocket-based live scrape progress updates |
| **Report Caching** | KV-backed caching for heavy report queries |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser / Client                         │
│                    Next.js 14 App (port 3000)                   │
│          Dashboard · Analytics · Competitor · Settings          │
└─────────────────────────┬───────────────────────────────────────┘
                          │  tRPC over HTTP + WebSocket (WS)
┌─────────────────────────▼───────────────────────────────────────┐
│              Cloudflare Worker  (port 8787)                     │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │  tRPC Router │  │ OAuth Routes │  │  Webhook Handler    │   │
│  │  posts       │  │ /api/auth/*  │  │  /api/webhook/apify │   │
│  │  scrape      │  │  meta        │  │                     │   │
│  │  reports     │  │  linkedin    │  └─────────────────────┘   │
│  │  competitor  │  │  twitter     │                             │
│  │  brands      │  │  youtube     │  ┌──────────────────────┐  │
│  │  settings    │  └──────────────┘  │   Durable Objects    │  │
│  │  accounts    │                    │  ScrapeStatusDO (WS) │  │
│  └──────┬───────┘                    │  SchedulerDO (cron)  │  │
│         │                            └──────────────────────┘  │
│  ┌──────▼────────────────────────────────────────────────────┐  │
│  │                      Services                             │  │
│  │  scheduler · metrics · cache · insights (rule-based)      │  │
│  │  oauth/  (meta · linkedin · twitter · youtube)           │  │
│  │  insights/ (meta-instagram · meta-facebook · linkedin    │  │
│  │             twitter · youtube)                           │  │
│  └──────┬────────────────────────────────────────────────────┘  │
│         │                                                        │
│  ┌──────▼────────────────────────────────────────────────────┐  │
│  │  ┌────────┐  ┌──────────┐  ┌─────────────┐               │  │
│  │  │  D1    │  │  KV      │  │  R2 Bucket  │               │  │
│  │  │ SQLite │  │  Cache   │  │  Exports    │               │  │
│  │  │        │  │  Settings│  │             │               │  │
│  │  └────────┘  └──────────┘  └─────────────┘               │  │
│  │  Queue (batch max 5)                                      │  │
│  └──────┬────────────────────────────────────────────────────┘  │
│         │                                                        │
│  ┌──────▼────────────────────────────────────────────────────┐  │
│  │                  Apify Scraper Actors                     │  │
│  │  instagram-scraper · linkedin-company/profile-posts       │  │
│  │  facebook-posts/pages-scraper · tweet-scraper             │  │
│  │  youtube-metadata-scraper-pro-v2                          │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Data flow:**
1. **Cron (every 30 min):** Worker fetches posts due for scraping → pushes batches of 5 to `scrape-batch-queue`
2. **Queue consumer:** Pulls batch → calls Apify actor → normalizes results → updates D1 → broadcasts WebSocket event
3. **API merge (non-blocking):** After each scrape, if an account is connected via OAuth, the insights provider fetches impressions/reach/clicks and merges them into the same DB row
4. **Apify webhook:** Optionally posts results directly back to `/api/webhook/apify` for faster turnaround
5. **Report queries:** Aggregated from D1; heavy results cached in KV with TTL

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 14.2.5 | React framework, routing, SSR |
| React | 18 | UI |
| TypeScript | — | Type safety |
| Tailwind CSS | — | Styling |
| tRPC React Query | — | Type-safe API client |
| TanStack Query | — | Data fetching & caching |
| Recharts | — | Analytics charts |
| pptxgenjs | — | PowerPoint generation |
| html2pdf.js | — | PDF export |
| Framer Motion | — | Animations |
| Radix UI | — | Accessible UI primitives |
| Sonner | — | Toast notifications |
| Lucide React | — | Icons |

### Backend

| Technology | Purpose |
|-----------|---------|
| Cloudflare Workers | Serverless edge runtime |
| TypeScript | Type safety |
| tRPC | End-to-end type-safe RPC |
| Zod | Schema validation |
| Cloudflare D1 | SQLite edge database |
| Cloudflare KV | Key-value cache, settings store, OAuth state |
| Cloudflare Queues | Async scrape job queue (max batch: 5) |
| Cloudflare Durable Objects | WebSocket hub + scheduler state |
| Cloudflare R2 | Report export storage |
| Apify | Social media scraping infrastructure |

---

## Platform Support

### Brand Post Tracking

| Platform | Scraping | Apify Actor | Likes | Comments | Views | Impressions | Reach | Clicks |
|----------|----------|-------------|-------|----------|-------|-------------|-------|--------|
| Instagram | Apify (authenticated) | `apify/instagram-scraper` | ✓ | ✓ | ✓ | API only | API only | API only |
| Facebook | Apify | `apify/facebook-posts-scraper` | ✓ | ✓ | ✓ | API only | API only | API only |
| LinkedIn | Apify | `harvestapi/linkedin-profile-posts` | ✓ | ✓ | ✓ | API only | — | API only |
| Twitter/X | Apify | `apidojo/tweet-scraper` | ✓ | ✓ | ✓ | API only | — | API only |
| YouTube | Apify | `beyondops/youtube-metadata-scraper-pro-v2` | ✓ | ✓ | ✓ | API only | — | — |

> **"API only"** means these metrics cannot be obtained by scraping — they require an official OAuth-connected account. The code for fetching them is fully implemented; only the API credentials need to be added. See [Official API Integration](#official-api-integration--how-it-works) below.

### Competitor Analysis

| Platform | Status | Notes |
|----------|--------|-------|
| Instagram | **Fully implemented** | Personal profiles + Business accounts |
| LinkedIn | **Fully implemented** | Personal profiles (`/in/`) + Company pages (`/company/`) |
| Twitter/X | **Fully implemented** | Handles `@handle`, `twitter.com/user`, `x.com/user` |
| Facebook | **Fully implemented** | Facebook page URLs (`facebook.com/pagename`) |
| YouTube | **Fully implemented** | `@handle`, `/channel/`, `/c/` URL formats |

---

## Backend Deep-Dive

### Entry Point

`worker/src/worker.ts` is the single Cloudflare Worker entry point. It handles:
- tRPC HTTP requests (all `/trpc/*` routes)
- OAuth initiation and callbacks (`/api/auth/{platform}/init`, `/api/auth/{platform}/callback`)
- Apify webhook callbacks (`/api/webhook/apify`)
- WebSocket upgrades for real-time scrape status
- Scheduled cron events (`*/30 * * * *` and end-of-month scrape)
- Queue batch consumption (brand posts, competitor profiles, profile scrapes)
- Token refresh cron for Twitter (2h) and YouTube (1h) tokens expiring within 7 days

### tRPC Routers

| Router | Key Procedures |
|--------|---------------|
| `posts` | `create`, `list`, `update`, `delete`, `updateManualMetrics`, `lock` |
| `scrape` | `triggerAll`, `triggerFailed`, `triggerDirect`, `scrapeInstagramProfile` |
| `reports` | `filtered`, `totals`, `analyticsMOM`, `deliveredSOW`, `bucketAnalysis`, `topPosts` |
| `competitor` | `startRun`, `listSets`, `getSet`, `deleteSet`, `getRunStatus`, `getRunResults`, `generateInsights` |
| `brands` | `create`, `list`, `delete`, `triggerProfileScrape` |
| `settings` | `getIgConnection`, `saveIgConnection`, `removeIgConnection`, `getOAuthCreds`, `saveOAuthCreds`, `removeOAuthCreds`, `getWorkerUrl` |
| `accounts` | `list`, `disconnect` |

### Scraping Pipeline

```
Cron trigger (*/30 * * * *)
  └─ scheduler.ts: fetch posts due for scrape
       └─ push batches → SCRAPE_QUEUE (max 5/batch, 3 retries, DLQ)
            └─ queue consumer: apify/provider.ts
                 └─ call Apify actor
                      └─ normalizer.ts: map to unified metric schema
                           └─ metrics.ts: compute engagement rates
                                └─ update D1 + broadcast WebSocket event
                                     └─ insights/index.ts: fetchAndMergeInsights()
                                          └─ if connected account exists → fetch
                                             impressions/reach/clicks via official API
                                             → update D1 with source='api'
```

**Smart scheduling intervals:**

| Post Age | Rescrape Interval |
|----------|------------------|
| < 48 hours (fresh) | Every 4 hours |
| 48h – 7 days (recent) | Every 24 hours |
| > 7 days (old) | Every 168 hours (weekly) |

### Apify Actors Used

| Platform | Actor | Use Case |
|----------|-------|---------|
| Instagram | `apify/instagram-scraper` | Brand posts + competitor profiles |
| LinkedIn (company) | `apimaestro/linkedin-company-posts` | Brand posts + competitor company pages |
| LinkedIn (personal) | `harvestapi/linkedin-profile-posts` | Brand posts + competitor personal profiles |
| Facebook (posts) | `apify/facebook-posts-scraper` | Brand post metrics |
| Facebook (pages) | `apify/facebook-pages-scraper` | Competitor profiles + brand pages |
| Twitter/X | `apidojo/tweet-scraper` | Brand posts + competitor profiles |
| YouTube | `beyondops/youtube-metadata-scraper-pro-v2` | Brand posts + competitor channels |

### OAuth Service Layer

`worker/src/services/oauth/` contains one provider module per platform:

| File | Platform | Token Lifetime | Refresh |
|------|----------|---------------|---------|
| `meta.ts` | Instagram + Facebook | 60 days | No — reconnect manually |
| `linkedin.ts` | LinkedIn | 60 days | No — reconnect manually |
| `twitter.ts` | Twitter/X | 2 hours | Yes (offline.access scope) |
| `youtube.ts` | YouTube | 1 hour | Yes (offline access) |
| `index.ts` | All | — | Factory + unified interface |

Twitter uses OAuth 2.0 with PKCE — the `code_verifier` is generated server-side and stored in KV with a 10-minute TTL keyed by `state`.

### Insights Providers

`worker/src/services/insights/` fetches official metrics after each scrape:

| File | Platform | Metrics fetched |
|------|----------|----------------|
| `meta-instagram.ts` | Instagram | impressions, reach, saves, profile_visits |
| `meta-facebook.ts` | Facebook | post_impressions, post_impressions_unique, post_clicks |
| `linkedin.ts` | LinkedIn | impressionCount, clickCount |
| `twitter.ts` | Twitter/X | impression_count, url_link_clicks |
| `youtube.ts` | YouTube | views (as impressions) |
| `index.ts` | All | `fetchAndMergeInsights()` dispatcher |

All provider calls are wrapped in try/catch — a token error or API failure never blocks or fails a scrape job.

### Durable Objects

| Object | Purpose |
|--------|---------|
| `ScrapeStatusDO` | Maintains WebSocket connections; broadcasts scrape progress events to all connected frontend clients |
| `SchedulerDO` | Manages persistent scheduled task state across Worker restarts |

### Cloudflare Bindings (`wrangler.toml`)

| Binding | Type | Purpose |
|---------|------|---------|
| `DB` | D1 | Primary database (`social-reports`) |
| `REPORT_CACHE` | KV | Report query cache + settings + OAuth state (PKCE verifiers) |
| `SCRAPE_QUEUE` | Queue | Async scrape job queue |
| `SCRAPE_STATUS` | Durable Object | WebSocket broadcast hub |
| `SCHEDULER` | Durable Object | Task scheduling state |
| `EXPORTS_BUCKET` | R2 | Exported report files |

---

## Frontend Deep-Dive

### Pages

| Route | Purpose |
|-------|---------|
| `/` | Main dashboard — brand list, posts table, summary KPI cards, filters |
| `/analysis` | Analytics — MOM trend charts, format breakdown, bucket analysis, top posts, PDF/PPT export |
| `/competitor-analysis` | Competitor benchmarking — handle input for all 5 platforms, scrape progress, side-by-side comparison charts, AI insights |
| `/settings` | Instagram credentials (for Apify scraping) + Official API account connections (OAuth) |
| `/api/export/csv` | Server-side CSV export route |

### Component Structure

```
components/
├── AddBrandModal.tsx          — Add brand/profile to workspace
├── AddPostModal.tsx           — Add post by URL or Instagram Story handle
├── BrandTable.tsx             — Brands list with scrape status indicators
├── ReportTable.tsx            — Post table with metrics, sorting, filtering
├── EditMetricsModal.tsx       — Manual metric entry (impressions, reach, clicks)
├── FilterBar.tsx              — Platform / date / brand / format filters
├── SummaryCards.tsx           — Aggregate KPI cards (reach, likes, comments, etc.)
├── ConnectedAccounts.tsx      — OAuth connect/disconnect UI for all 5 platforms
├── UsageLimitBanner.tsx       — Apify usage limit warnings
├── NavBar.tsx                 — Top navigation bar
├── analytics/
│   ├── MOMLineChart.tsx       — Month-over-month engagement trend
│   ├── MOMDualAxisChart.tsx   — Dual-axis MOM chart (engagement + reach)
│   ├── FormatBarChart.tsx     — Performance by post format (Reel/Static/Carousel…)
│   ├── BucketBarChart.tsx     — Performance by content bucket category
│   ├── PostCard.tsx           — Individual post display card
│   ├── ExportPDFButton.tsx    — html2pdf snapshot of dashboard
│   ├── ExportPPTButton.tsx    — pptxgenjs PowerPoint generation
│   └── ShareButton.tsx        — Shareable link generation
└── competitor/
    ├── HandleInput.tsx        — Competitor handle entry (all 5 platforms, auto-detected)
    ├── RunProgress.tsx        — Real-time scraping progress indicator
    ├── CompareBarChart.tsx    — Side-by-side KPI bar chart
    ├── EngagementTrend.tsx    — Engagement trend comparison across accounts
    ├── PostsCompareTable.tsx  — Per-post comparison table
    └── ExportPPTButton.tsx    — Competitor-specific PPT export
```

### Hooks & Context

| Hook / Context | Purpose |
|----------------|---------|
| `useFilters` | Manage post list filter state |
| `useScrapeStatus` | WebSocket listener for real-time scrape events |
| `useKeyboardShortcuts` | `Ctrl+N` (add post), `Ctrl+R` (trigger scrape) |
| `ScrapingLimitContext` | Track and surface Apify usage limits |

### Export Capabilities

| Format | Library | Contents |
|--------|---------|---------|
| CSV | Native fetch | All posts with full metric columns |
| PDF | html2pdf.js | SVG→PNG snapshot of analytics charts |
| PowerPoint | pptxgenjs | Charts, KPI tables, AI insights — formatted for client presentations |

---

## Official API Integration — How It Works

All code for the official API integration is **fully implemented and deployed**. The only step remaining is supplying the API credentials. Until credentials are provided, everything works exactly as before — impressions/reach/clicks are null after scraping and can be entered manually.

### Flow

```
User clicks "Connect" in Settings
  → GET /api/auth/{platform}/init
       → redirects to OAuth provider consent page
            → user approves
                 → GET /api/auth/{platform}/callback
                      → exchange code for tokens
                           → store in connected_accounts table
                                → redirect to /settings?connected={platform}

After each scrape job:
  → fetchAndMergeInsights(post, db)   [non-blocking, try/catch]
       → look up connected_accounts for this platform
            → call insights provider API
                 → update post_metrics with impressions/reach/clicks
                    (impressions_source = 'api')
```

### What gets unlocked per platform

| Platform | Connect via | Metrics auto-populated |
|----------|------------|----------------------|
| Instagram | Meta OAuth (same app as Facebook) | impressions, reach, saves, profile_visits |
| Facebook | Meta OAuth (same app as Instagram) | post_impressions, reach, post_clicks |
| LinkedIn | LinkedIn OAuth | impressionCount, clickCount |
| Twitter/X | Twitter OAuth 2.0 + PKCE | impression_count, url_link_clicks |
| YouTube | Google OAuth | views (as impressions) |

### Token management

| Platform | Token lifetime | Refresh |
|----------|--------------|---------|
| Instagram / Facebook | 60 days | No — user must reconnect |
| LinkedIn | 60 days | No — user must reconnect |
| Twitter/X | 2 hours | Yes — auto-refreshed by cron when < 7 days to expiry |
| YouTube | 1 hour | Yes — auto-refreshed by cron when < 7 days to expiry |

---

## Instagram & Facebook Connector

### Scraping (Current)

Instagram data is fetched via `apify/instagram-scraper` with optional username/password for authenticated access. Facebook posts use `apify/facebook-posts-scraper` and `apify/facebook-pages-scraper`.

> Instagram requires 2FA to be **disabled** for credential-based Apify scraping.

### Official API (Code ready — needs credentials)

Instagram and Facebook share a single **Meta App**. One OAuth flow connects both platforms simultaneously — `getMetaAccounts()` discovers all Facebook Pages and their linked Instagram Business accounts from the same token.

**Required scopes:** `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`

**Environment variables needed (`wrangler.toml` + secrets):**
```toml
META_APP_ID       = "your_meta_app_id"         # in [vars]
META_REDIRECT_URI = "https://your-worker.workers.dev/api/auth/meta/callback"  # in [vars]
```
```bash
wrangler secret put META_APP_SECRET
```

**Developer console:** [developers.facebook.com](https://developers.facebook.com) → Create App → Instagram Graph API + Pages API

---

## LinkedIn Connector

### Scraping (Current)

| URL Pattern | Actor |
|------------|-------|
| `linkedin.com/company/...` | `apimaestro/linkedin-company-posts` |
| `linkedin.com/in/...` | `harvestapi/linkedin-profile-posts` |

### Official API (Code ready — needs credentials)

Works for **Company Pages only** — the LinkedIn API does not expose analytics for personal profiles.

**Required scopes:** `r_organization_social`, `rw_organization_admin`, `profile`, `email`

**Environment variables needed:**
```toml
LINKEDIN_CLIENT_ID    = "your_linkedin_client_id"
LINKEDIN_REDIRECT_URI = "https://your-worker.workers.dev/api/auth/linkedin/callback"
```
```bash
wrangler secret put LINKEDIN_CLIENT_SECRET
```

**Developer console:** [linkedin.com/developers](https://linkedin.com/developers) → Create App

---

## Twitter/X Connector

### Scraping (Current)

Twitter/X posts are scraped via `apidojo/tweet-scraper`. Likes, retweets, replies, and views are available via scraping.

### Official API (Code ready — needs credentials)

Uses OAuth 2.0 with PKCE. The `non_public_metrics` tweet field requires a user-context token — this is exactly what the OAuth flow provides.

**Required scopes:** `tweet.read`, `users.read`, `offline.access`

**Environment variables needed:**
```toml
TWITTER_CLIENT_ID    = "your_twitter_client_id"
TWITTER_REDIRECT_URI = "https://your-worker.workers.dev/api/auth/twitter/callback"
```
```bash
wrangler secret put TWITTER_CLIENT_SECRET
```

**Developer console:** [developer.twitter.com](https://developer.twitter.com) → Create Project + App → OAuth 2.0 enabled

---

## YouTube Connector

### Scraping (Current)

YouTube videos are scraped via `beyondops/youtube-metadata-scraper-pro-v2`. View count, likes, and comments are available via scraping.

### Official API (Code ready — needs credentials)

Uses Google OAuth 2.0. The YouTube Analytics API (`youtubeanalytics.googleapis.com`) provides view breakdowns and engagement metrics per video.

**Required scopes:** `youtube.readonly`, `yt-analytics.readonly`

**Environment variables needed:**
```toml
GOOGLE_CLIENT_ID    = "your_google_client_id"
GOOGLE_REDIRECT_URI = "https://your-worker.workers.dev/api/auth/youtube/callback"
```
```bash
wrangler secret put GOOGLE_CLIENT_SECRET
```

**Developer console:** [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → YouTube Data API v3 + YouTube Analytics API → OAuth 2.0 credentials

---

## Competitor Analysis

Competitor analysis compares a client's account against 2–10 competitors on followers, average engagement, average likes, and per-post performance.

All 5 platforms are fully supported. Platform is auto-detected from the URL:

| Input | Detected platform |
|-------|-----------------|
| `@handle` or `instagram.com/...` | Instagram |
| `linkedin.com/company/...` or `linkedin.com/in/...` | LinkedIn |
| `twitter.com/...` or `x.com/...` | Twitter/X |
| `facebook.com/...` | Facebook |
| `youtube.com/...` or `youtu.be/...` | YouTube |

### Scraper architecture per platform

| Platform | Profile data source | Post data source |
|----------|--------------------|--------------------|
| Instagram | `apify/instagram-scraper` (profile mode) | same actor (posts mode) |
| LinkedIn | company: `apimaestro/linkedin-company-posts` | same |
|  | personal: `harvestapi/linkedin-profile-posts` | same |
| Twitter/X | `apidojo/tweet-scraper` — follower count from `author.followers_count` | same |
| Facebook | `apify/facebook-pages-scraper` — page metadata + embedded posts | falls back to `apify/facebook-posts-scraper` |
| YouTube | `beyondops/youtube-metadata-scraper-pro-v2` — subscriber count from first item | same |

---

## Database Schema

All tables live in Cloudflare D1 (SQLite). Migrations are applied by `npm run db:migrate:local` / `npm run db:migrate:remote`.

### Core Tables

| Table | Purpose |
|-------|---------|
| `posts` | Post metadata: URL, platform, format, status, lock state, scrape schedule |
| `post_metrics` | Current metrics: likes, comments, shares, saves, views, impressions, reach, clicks + source tracking |
| `metrics_snapshots` | Historical metric snapshots for month-over-month trend analysis |
| `brands` | Social profile handles linked to the workspace |
| `connected_accounts` | OAuth tokens for official API access (one row per connected platform account) |

### Metric Source Tracking

Each metric that can come from either scraping or official API tracks its origin:

```sql
impressions        INTEGER,
impressions_source TEXT DEFAULT 'manual',   -- 'manual' | 'api'
reach              INTEGER,
reach_source       TEXT DEFAULT 'manual',   -- 'manual' | 'api'
clicks             INTEGER,
clicks_source      TEXT DEFAULT 'manual',   -- 'manual' | 'api'
```

When an official API token is connected, `fetchAndMergeInsights()` updates these fields with `source = 'api'` after every scrape. Disconnecting an account does not reset existing API values — they stay at their last fetched value until manually cleared.

### connected_accounts Table

```sql
CREATE TABLE IF NOT EXISTS connected_accounts (
  id            TEXT PRIMARY KEY,
  platform      TEXT NOT NULL,          -- 'Instagram'|'Facebook'|'Twitter'|'LinkedIn'|'YouTube'
  account_id    TEXT NOT NULL,          -- platform's user/page/channel ID
  username      TEXT,                   -- display name shown in Settings UI
  access_token  TEXT NOT NULL,
  refresh_token TEXT,                   -- only Twitter and YouTube
  token_expiry  TEXT,                   -- ISO datetime; cron refreshes when < 7 days left
  extra         TEXT,                   -- JSON: platform-specific (page_id, ig_user_id, channel_id, etc.)
  connected_at  TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(platform, account_id)
);
```

### Competitor Tables

| Table | Purpose |
|-------|---------|
| `competitor_sets` | Named comparison groups (e.g. "Q1 2025 Benchmark") |
| `competitor_accounts` | Individual handles within a set |
| `competitor_runs` | Scrape execution records with status tracking |
| `competitor_account_runs` | Per-account results for each run (followers, avg metrics) |
| `competitor_posts` | Individual posts with metrics, content buckets, tags |

---

## Setup & Development

### Prerequisites

- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)
- Cloudflare account with Workers, D1, KV, Queues, Durable Objects, R2 enabled
- [Apify](https://apify.com) account and API token

### 1. Install Dependencies

```bash
npm install
```

This installs dependencies for both the worker and app workspaces.

### 2. Configure Cloudflare Resources

Create the required resources if they don't exist:

```bash
# D1 database
wrangler d1 create social-reports

# KV namespace
wrangler kv namespace create REPORT_CACHE

# Queue
wrangler queues create scrape-batch-queue
wrangler queues create scrape-dlq

# R2 bucket
wrangler r2 bucket create report-exports
```

Update the IDs returned into `wrangler.toml`.

### 3. Set Secrets

```bash
# Required
wrangler secret put APIFY_TOKEN
wrangler secret put API_KEY
wrangler secret put WEBHOOK_SECRET

# OAuth secrets — set these when API credentials are available
# (credentials can also be entered via the Settings UI without touching the backend)
wrangler secret put META_APP_SECRET
wrangler secret put LINKEDIN_CLIENT_SECRET
wrangler secret put TWITTER_CLIENT_SECRET
wrangler secret put GOOGLE_CLIENT_SECRET
```

### 4. Configure Local Environment

Create `worker/.dev.vars`:
```ini
APIFY_TOKEN=your_apify_token
API_KEY=your_api_key
WEBHOOK_SECRET=your_webhook_secret
APP_URL=http://localhost:3000

# Add these when API credentials are available:
# META_APP_ID=...
# META_APP_SECRET=...
# META_REDIRECT_URI=http://127.0.0.1:8787/api/auth/meta/callback
# LINKEDIN_CLIENT_ID=...
# LINKEDIN_CLIENT_SECRET=...
# LINKEDIN_REDIRECT_URI=http://127.0.0.1:8787/api/auth/linkedin/callback
# TWITTER_CLIENT_ID=...
# TWITTER_CLIENT_SECRET=...
# TWITTER_REDIRECT_URI=http://127.0.0.1:8787/api/auth/twitter/callback
# GOOGLE_CLIENT_ID=...
# GOOGLE_CLIENT_SECRET=...
# GOOGLE_REDIRECT_URI=http://127.0.0.1:8787/api/auth/youtube/callback
```

Create `app/.env.local`:
```ini
NEXT_PUBLIC_WORKER_URL=http://127.0.0.1:8787
NEXT_PUBLIC_API_KEY=your_api_key
```

### 5. Run Database Migrations

```bash
npm run db:migrate:local
```

This creates all tables including `connected_accounts`, and any missing columns (idempotent — safe to run multiple times).

### 6. Start Development Servers

```bash
npm run dev
```

This starts both the Cloudflare Worker on `http://127.0.0.1:8787` and the Next.js app on `http://localhost:3000` concurrently.

### 7. Tunnel Setup (for Apify Webhooks)

Apify needs a public URL to POST scrape results back to the Worker. Use the included tunnel script:

```bash
# macOS / Linux
./start-tunnel.sh

# Windows (PowerShell)
./start-tunnel.ps1
```

This creates a Cloudflare tunnel and automatically updates `WORKER_URL` in the Worker environment.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both worker and app in development |
| `npm run dev:worker` | Start Cloudflare Worker only (`wrangler dev`) |
| `npm run dev:app` | Start Next.js app only |
| `npm run build:app` | Build Next.js for production |
| `npm run deploy:worker` | Deploy Worker to Cloudflare |
| `npm run db:migrate:local` | Apply DB migrations to local D1 |
| `npm run db:migrate:remote` | Apply DB migrations to remote D1 |

---

## Environment Variables Reference

### Worker (`wrangler.toml` vars + `.dev.vars` / `wrangler secret`)

| Variable | Type | Description |
|----------|------|-------------|
| `APIFY_TOKEN` | Secret | Apify API token for running actors |
| `API_KEY` | Secret | Shared secret for authenticating frontend → Worker tRPC requests |
| `WEBHOOK_SECRET` | Secret | Used to verify Apify webhook callback signatures |
| `APP_URL` | Var | Frontend URL — used to redirect back after OAuth (e.g. `https://your-app.vercel.app`) |
| `WORKER_URL` | Var | Public Worker URL (updated by tunnel script) |
| `SMART_SCHEDULE_FRESH_HOURS` | Var | Rescrape interval for posts < 48h old (default: `4`) |
| `SMART_SCHEDULE_RECENT_HOURS` | Var | Rescrape interval for posts 48h–7d old (default: `24`) |
| `SMART_SCHEDULE_OLD_HOURS` | Var | Rescrape interval for posts > 7d old (default: `168`) |
| `META_APP_ID` | Var | Meta App ID (Instagram + Facebook OAuth) |
| `META_APP_SECRET` | Secret | Meta App Secret |
| `META_REDIRECT_URI` | Var | `https://your-worker.workers.dev/api/auth/meta/callback` |
| `LINKEDIN_CLIENT_ID` | Var | LinkedIn App Client ID |
| `LINKEDIN_CLIENT_SECRET` | Secret | LinkedIn App Client Secret |
| `LINKEDIN_REDIRECT_URI` | Var | `https://your-worker.workers.dev/api/auth/linkedin/callback` |
| `TWITTER_CLIENT_ID` | Var | Twitter OAuth 2.0 Client ID |
| `TWITTER_CLIENT_SECRET` | Secret | Twitter OAuth 2.0 Client Secret |
| `TWITTER_REDIRECT_URI` | Var | `https://your-worker.workers.dev/api/auth/twitter/callback` |
| `GOOGLE_CLIENT_ID` | Var | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Secret | Google OAuth 2.0 Client Secret |
| `GOOGLE_REDIRECT_URI` | Var | `https://your-worker.workers.dev/api/auth/youtube/callback` |

### App (`app/.env.local`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_WORKER_URL` | Worker URL (e.g. `http://127.0.0.1:8787` for local) |
| `NEXT_PUBLIC_API_KEY` | API key for authenticating frontend → Worker requests |

---

## Deployment

### Deploy Worker

```bash
npm run db:migrate:remote   # apply migrations to production D1
npm run deploy:worker        # deploy to Cloudflare Workers
```

### Deploy Frontend

The Next.js app can be deployed to Cloudflare Pages, Vercel, or any Node.js-compatible host.

```bash
cd app
npm run build
```

Update `NEXT_PUBLIC_WORKER_URL` in your hosting platform's environment variables to point to the production Worker URL.

### Activating Official API Integration

Credentials are entered through the **Settings UI** — no backend access or `wrangler.toml` edits required.

1. Run `npm run db:migrate:remote` (idempotent — creates `connected_accounts` table if not present)
2. Navigate to `/settings` → **Official API Connections** section
3. Click **Configure** next to a platform
4. Paste the **App ID / Client ID** and **App Secret / Client Secret** from the platform's developer console
5. Copy the displayed **Redirect URI** and register it in the developer console for that platform
6. Click **Save Credentials** → the **Connect** button appears
7. Click **Connect** → authorize in the OAuth popup → redirected back to `/settings?connected={platform}`

From that point forward, impressions/reach/clicks populate automatically after every scrape with no manual entry required.

> Credentials are stored encrypted in Cloudflare KV. The secret is never returned to the frontend after saving.
