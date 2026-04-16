---
title: Dashboard Migration — Reddit-Only Web Dashboard
date: 2026-04-14
status: approved
---

# Dashboard Migration — Reddit-Only Web Dashboard

## Overview

Major product shift: remove all X (Twitter) logic, remove reply generation, deprecate the browser extension, and migrate the Reddit feed experience into a standalone web dashboard at `/dashboard`. The landing page, auth, and billing systems remain untouched.

---

## What Gets Deleted

| Target | What |
|---|---|
| `chrome-extension/` | Entire folder — extension deprecated |
| `convex/twitter.ts` | X data logic — upsert, fetch, cleanup |
| `convex/schema.ts` | `twitterResults` and `extensionSessions` tables |
| `convex/crons.ts` | X cleanup cron (`deleteExpiredXResults`) |
| `convex/http.ts` | `/fetchXResults`, `/generateReply`, `/logoutExtension` routes |
| `components/ExtensionPopup.tsx` | Replaced by dashboard components |
| `components/Settings.tsx` | Extension-specific settings component |
| `convex/brand.ts` | Brand context logic (reply generation dependency) |
| `convex/extensionAuth.ts` | Extension session management |

Reddit upsert route (`/upsertResults`) and brand sync are removed since the extension was their only caller.

---

## What Gets Added

| Target | What |
|---|---|
| `app/dashboard/page.tsx` | Main dashboard page — auth-gated |
| `app/dashboard/layout.tsx` | Dashboard layout wrapper |
| `components/dashboard/NavBar.tsx` | Horizontal nav bar |
| `components/dashboard/RedditFeed.tsx` | Feed cards with progressive pagination |
| `components/dashboard/SettingsPanel.tsx` | Settings modal/slide-in |
| `convex/userSettings.ts` | Per-user settings stored in Convex |
| `convex/http.ts` | `/fetchRedditPosts` HTTP action — server-side Reddit fetch |
| `middleware.ts` | Redirect unauthenticated users from `/dashboard` to `/` |

---

## Architecture

### Data Flow

```
User opens /dashboard
  → Convex query: load userSettings (keywords, subreddits, filters)
  → Convex HTTP action: /fetchRedditPosts
      → Fetch Reddit JSON API by keyword + subreddit
      → Store results in redditResults (per userId, not deviceId)
      → Return posts to frontend
  → RedditFeed renders cards
  → On settings change → re-fetch
```

### Reddit Data Source

Reddit's public `.json` API — no API key required.

- Keyword search: `https://www.reddit.com/search.json?q={keyword}&sort=new&limit=25`
- Subreddit feed: `https://www.reddit.com/r/{subreddit}/new.json?limit=25`

Required header: `User-Agent: agentk/1.0` to avoid rate limiting.

Fetch is triggered:
1. On dashboard load (if last fetch > 30 min ago)
2. On manual reload button click
3. On settings save (keywords or subreddits changed)

Results stored in `redditResults` table keyed by `userId` (not `deviceId`).

---

## Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│ agentK logo          [Reddit icon] [Settings icon]          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│              Reddit feed cards (progressive)                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

- **NavBar**: horizontal bar, logo at far left, Reddit icon + Settings icon centered
- **Reddit icon**: indicates active tab (only Reddit exists — acts as home/reload trigger)
- **Settings icon**: opens SettingsPanel
- **Feed**: same card UI as the extension — subreddit badge, author, age, title, vote count, comments, share. Click opens Reddit URL in new tab.
- **Progressive pagination**: batches of 8 cards, Intersection Observer loads next batch on scroll

---

## NavBar Component

```
Logo (left)          [Reddit icon] [Settings icon] (center)
```

- Logo: links to `/` (landing page)
- Reddit icon: active state indicator, click triggers manual reload
- Settings icon: toggles SettingsPanel open/closed
- Background: `#FDF7EF` (design.md cream), bottom border `rgba(0,0,0,0.06)`
- Height: 56px

---

## SettingsPanel

Slide-in panel or modal (same feel as extension sidebar settings).

Fields:
- **Keywords** — pill input, add/remove (e.g. "AI SaaS", "B2B")
- **Excluded terms** — pill input
- **Subreddits** — pill input with autocomplete (same as extension)
- **Min upvotes** — number input, default 0
- **Min comments** — number input, default 0

On save: writes to `userSettings` in Convex, triggers re-fetch.

---

## Convex Changes

### Schema additions

```ts
userSettings: defineTable({
  userId:      v.id("users"),
  keywords:    v.array(v.string()),
  excluded:    v.array(v.string()),
  subreddits:  v.array(v.string()),
  minUpvotes:  v.number(),
  minComments: v.number(),
  lastFetchAt: v.number(),
}).index("by_user", ["userId"]),
```

`redditResults` table: change `deviceId: v.string()` → `userId: v.id("users")`. Update indexes accordingly.

### Schema deletions

- `twitterResults` table — removed
- `extensionSessions` table — removed
- `brandContexts` table — removed

### New HTTP action: `/fetchRedditPosts`

- Auth: requires valid Convex session (user must be logged in)
- Reads `userSettings` for the user
- Fetches Reddit JSON API for each keyword + subreddit combination
- Deduplicates by postId
- Filters by minUpvotes, minComments
- Upserts into `redditResults` keyed by userId
- Updates `lastFetchAt` in `userSettings`

### Deleted HTTP actions

- `/upsertResults` — extension-only
- `/fetchXResults` — X-only
- `/generateReply` — reply generation
- `/logoutExtension` — extension-only
- `/extensionUser` — extension-only
- `/extensionBilling` — extension-only
- `/syncBrand` — reply generation dependency

---

## Auth & Routing

### Middleware

`middleware.ts` protects `/dashboard`:
- Unauthenticated → redirect to `/?login=1` (opens auth modal)
- Authenticated → allow through

### Post-login redirect

After successful login on landing page, redirect to `/dashboard`. This replaces the current flow where auth just closes the modal.

---

## Billing

Plan gating simplifies:
- **Free**: limited keywords (2), Reddit only, no advanced filters
- **Pro/Ultra**: unlimited keywords, all filters, priority refresh

X-related gating and reply generation gating are removed entirely. Pricing page copy updated to remove X/reply mentions.

---

## Design Tokens (from design.md)

| Token | Value |
|---|---|
| Background | `#FDF7EF` |
| Text primary | `#191918` |
| Text muted | `#B2A28C` |
| Accent | `#DF849D` |
| Gradient | `linear-gradient(135deg, #FF9A8B, #DF849D)` |
| Border radius | 4px (buttons), 12px (cards) |
| Nav height | 56px |

---

## Files Changed Summary

**Deleted:**
- `chrome-extension/` (entire directory)
- `convex/twitter.ts`
- `convex/extensionAuth.ts`
- `convex/brand.ts`
- `components/ExtensionPopup.tsx`
- `components/Settings.tsx`
- `components/AuthBridge.tsx` (extension session bridge — no longer needed)

**Modified:**
- `convex/schema.ts` — remove twitterResults, extensionSessions, brandContexts; add userSettings; update redditResults to use userId
- `convex/reddit.ts` — update to use userId instead of deviceId
- `convex/http.ts` — remove X/reply/extension routes; add /fetchRedditPosts
- `convex/crons.ts` — remove X cleanup cron
- `middleware.ts` — add /dashboard protection
- `components/Pricing.tsx` — remove X/reply feature mentions
- `app/page.tsx` — post-login redirect to /dashboard

**Added:**
- `app/dashboard/page.tsx`
- `app/dashboard/layout.tsx`
- `components/dashboard/NavBar.tsx`
- `components/dashboard/RedditFeed.tsx`
- `components/dashboard/SettingsPanel.tsx`
- `convex/userSettings.ts`
