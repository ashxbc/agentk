# X (Twitter) Feed Backend — Design Spec
**Date:** 2026-04-05
**Status:** Approved

---

## Overview

Replace the static mock `X_POSTS` array in the AgentK Chrome extension with real tweets fetched via twitterapi.io. The API key lives in Convex as an environment variable. The extension calls a Convex HTTP action that builds the query, fetches, filters, ranks, and stores results. The extension then reads from Convex to render a scrollable, scattered card layout — consistent with the Reddit feed.

---

## Data Flow

```
content.js                    Convex                        twitterapi.io
──────────                    ──────                        ─────────────
fetchXPipeline()
  │
  └─POST /fetchXResults ──▶  httpAction
       {deviceId,              buildXQuery()
        keywords,              GET /advanced_search ──────▶  twitterapi.io
        excluded,              filterTweets()         ◀───── [{tweet} × ≤20]
        verifiedOnly,          rankTweets()
        ratioFilter}           upsertXResults()
                          ◀── {ok: true}

renderFromXStorage(shadow)
  │
  └─POST /api/query ──────▶  getXResults({deviceId})
  ◀── [{tweet} × ≤20]         .withIndex("by_device")

  appendXBatch(inner, gen)
  IntersectionObserver        [hourly cron]
  → next band of 10            deleteExpiredXResults()
                               cutoff = now − 24h
```

---

## Query Construction

Built server-side in the Convex HTTP action.

**Format:**
```
("keyword one" OR "keyword two") -"exclude" -filter:replies -filter:retweets lang:en since:YYYY-MM-DD [filter:verified]
```

**Rules:**
- Each keyword is wrapped in double quotes for exact phrase matching
- Multiple keywords joined with `OR` inside parentheses
- Each exclude keyword prefixed with `-` and quoted
- Always append: `-filter:replies -filter:retweets lang:en`
- `since:` date = yesterday (`new Date(Date.now() - 86400000).toISOString().split('T')[0]`)
- `filter:verified` appended only if `verifiedOnly === true`
- `queryType` always `"Latest"` — freshest results
- `cursor` always `""` — first page only (20 tweets max per API response)

---

## Fetch

**Endpoint:** `GET https://api.twitterapi.io/twitter/tweet/advanced_search`

**Headers:** `x-api-key: process.env.TWITTER_API_KEY`

**Params:** `query`, `queryType=Latest`, `cursor=`

**Response shape used:**
```ts
{
  tweets: [{
    id: string,
    url: string,
    text: string,
    createdAt: string,          // ISO 8601
    retweetCount: number,
    replyCount: number,
    likeCount: number,
    viewCount: number,
    isReply: boolean,
    inReplyToUsername: string | null,
    author: {
      username: string,
      displayName: string,
      followers: number,
      isVerified: boolean,
    }
  }]
}
```

---

## Filter (server-side)

Applied after fetch, before ranking:

1. **Exclude replies** — `tweet.isReply !== true && !tweet.inReplyToUsername` (belt-and-suspenders on top of `-filter:replies` query operator)
2. **Ratio filter** (if `ratioFilter === true`) — require `author.followers >= 500`; low-follower accounts are treated as spam/bots since `following` count is not in the API response

---

## Rank (server-side)

Score each tweet, sort descending, cap at 20:

```ts
score = likeCount + retweetCount * 2 + replyCount * 0.5 + Math.log10(Math.max(1, viewCount)) * 10
```

Engagement signals:
- Retweets weighted 2× (strong signal of value)
- Replies weighted 0.5× (engagement but noisy)
- View count log-scaled (prevents viral outliers dominating)

---

## Storage

### Schema — `twitterResults` table

```ts
twitterResults: defineTable({
  deviceId:    v.string(),
  tweetId:     v.string(),
  url:         v.string(),
  text:        v.string(),
  name:        v.string(),
  handle:      v.string(),
  verified:    v.boolean(),
  followers:   v.number(),
  likes:       v.number(),
  reposts:     v.number(),
  replies:     v.number(),
  views:       v.number(),
  score:       v.number(),
  createdAt:   v.string(),
  fetchedAt:   v.number(),
})
.index("by_device",       ["deviceId"])
.index("by_device_tweet", ["deviceId", "tweetId"])
```

### Upsert logic

Same pattern as Reddit: check `by_device_tweet` index before inserting — skip if record already exists.

### TTL cleanup

Hourly cron: delete all `twitterResults` where `fetchedAt < Date.now() - 24h`. Reuses existing cron infrastructure in `convex/crons.ts`.

---

## Convex Files

### `convex/twitter.ts` (new)
- `upsertXResults` — `internalMutation`: upserts tweet records
- `deleteExpiredXResults` — `internalMutation`: TTL cleanup
- `getXResults` — `query`: returns all tweets for a deviceId ordered by `score` descending

### `convex/http.ts` (updated)
- Add `POST /fetchXResults` — builds query, calls twitterapi.io, filters, ranks, calls `upsertXResults`
- Add `OPTIONS /fetchXResults` — CORS preflight

### `convex/crons.ts` (updated)
- Add `crons.interval("cleanup-expired-x-results", { hours: 1 }, internal.twitter.deleteExpiredXResults)`

### `convex/schema.ts` (updated)
- Add `twitterResults` table definition

---

## content.js Changes

### Removed
- `X_POSTS` constant (mock data array)

### New functions

**`fetchXPipeline()`**
- Reads `deviceId` from `chrome.storage.local`
- Guards: returns early if no keywords
- POSTs to `${CONVEX_SITE_URL}/fetchXResults`
- On success: sets `xLastFetchAt` in `chrome.storage.local`

**`renderFromXStorage(shadow)`**
- POSTs to `${CONVEX_CLOUD_URL}/api/query` with `{ path: 'twitter:getXResults', args: { deviceId } }`
- Maps results to card data objects
- Resets `xFeedPosts`, `xFeedOffset`, `xRenderGen`
- Creates `.x-inner`, calls `appendXBatch(inner, gen)`

**`appendXBatch(inner, gen)`**
- Same pattern as `appendRedditBatch` — gen guard, absolute positioned cards, `BAND_SCATTER` positions, `IntersectionObserver` sentinel
- 10 cards per band, `X_BAND_HEIGHT = 440px`

**`xCardHTML(t)`**
- Renders individual tweet card using existing `.x-card` CSS classes
- Shows: avatar initials + color, display name, verified badge, handle, relative time, tweet text, likes + reply counts, click → `window.open(t.url, '_blank')`

### Updated functions

**`xFeedHTML()`**
- If no keywords: show "No keywords set" empty state
- If keywords set: show loading spinner (same pattern as `redditFeedHTML`)
- No more static mock cards

**`bindTabSwitching()`**
- Add X tab handler: read `xLastFetchAt` from storage, fetch if stale (> 12h), always call `renderFromXStorage`

**`mount()`**
- After `initStorage()` + `renderInternal()`, if `activeTab === 'x'` and keywords exist: trigger `fetchXPipeline` if stale, then `renderFromXStorage`

### New module-level state
```js
let xFeedPosts   = [];
let xFeedOffset  = 0;
let xRenderGen   = 0;
const X_BATCH    = 10;
const X_BAND_HEIGHT = 440;
const X_BAND_SCATTER = [
  [4,  6, -2, 1], [30, 3,  1, 2], [57,  5, -1, 1], [76, 2,  2, 3],
  [16,42,  2, 2], [44,36, -2, 1], [68, 38,  1, 2], [2, 62, -1, 3],
  [38,62,  2, 1], [64,58, -2, 2],
];
```

### CSS updates
```css
.x-canvas {
  position: relative; width: 100%; height: 100%;
  overflow-y: auto; overflow-x: hidden;   /* was overflow: hidden */
  background: #FDF7EF; scrollbar-width: none;
}
.x-canvas::-webkit-scrollbar { display: none; }
.x-inner { position: relative; width: 100%; }
```

---

## Env Setup

Before deploying, set the key in Convex:
```bash
npx convex env set TWITTER_API_KEY new1_dee0fbf176584d6392f5bdbda38190cc
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| No keywords configured | `xFeedHTML()` shows "No keywords set" empty state |
| API key not set in Convex env | HTTP action returns 500; content.js logs warning, shows "No results" |
| twitterapi.io returns non-200 | HTTP action logs + returns `{error}` 502; extension shows "No results" |
| No tweets pass filter/rank | `renderFromXStorage` shows "No tweets found in the past 24h" empty state |
| Convex query fails | `renderFromXStorage` logs warning, canvas unchanged |
| Stale observer fires | `gen !== xRenderGen` guard discards the call |

---

## Deployment Checklist

1. `npx convex env set TWITTER_API_KEY <key>`
2. Update `convex/schema.ts` — add `twitterResults` table
3. Create `convex/twitter.ts`
4. Update `convex/http.ts` — add `/fetchXResults` routes
5. Update `convex/crons.ts` — add X cleanup cron
6. `npx convex deploy`
7. Update `content.js` — all changes above
8. Reload extension, add keywords, open X tab, verify real tweets appear
