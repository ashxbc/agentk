# Reddit Feed Backend — Design Spec
**Date:** 2026-04-04
**Status:** Approved

---

## 1. Summary

Build the backend logic for the AgentK Chrome extension's Reddit feed. The system fetches Reddit posts and comments matching user-defined keywords across selected subreddits, filters them, and stores results in Convex for fast retrieval and deduplication. Everything runs inside `content.js` — no new extension files, no server dependency beyond Convex.

---

## 2. Architecture

```
chrome.storage.local
  └── deviceId          — generated once (crypto.randomUUID), stable per device
  └── settings          — { keywords, excluded, subreddits, minUpvotes, minComments }
  └── lastFetchAt       — Unix timestamp of last successful fetch

content.js
  └── on Reddit tab open:
        if (now - lastFetchAt > 12h) → run fetchPipeline()
        else → read from Convex and render

fetchPipeline()
  ├── fan out N×M fetch calls to Reddit public JSON API
  ├── filter results in-browser
  └── POST clean results to Convex via HTTP action

Convex
  ├── Table: redditResults
  ├── HTTP Action: upsertResults
  ├── Query: getResults
  └── Scheduled Job: TTL cleanup (hourly)
```

---

## 3. Data Flow

### Step 1 — Settings Read
On Reddit tab open, content.js reads from `chrome.storage.local`:
- `deviceId` — create with `crypto.randomUUID()` if not present
- `settings.keywords` — target keywords array
- `settings.excluded` — exclude keywords array (may be empty)
- `settings.subreddits` — selected subreddits array (max 5)
- `settings.minUpvotes` — number or null
- `settings.minComments` — number or null
- `lastFetchAt` — timestamp or 0

### Step 2 — Cache Check
```js
const shouldFetch = (Date.now() - lastFetchAt) > 12 * 60 * 60 * 1000;
if (!shouldFetch) return renderFromConvex(deviceId);
```

### Step 3 — Query Fan-Out
For every (keyword, subreddit) pair, fire one fetch:
```
GET https://www.reddit.com/r/{subreddit}/search.json
  ?q={keyword}
  &restrict_sr=1
  &sort=new
  &t=day
  &limit=100
  &type=link,comment
```
- **Total queries:** keywords.length × subreddits.length
- **Parallelism:** `Promise.allSettled()` — all queries fire simultaneously, failures don't block others
- **Rate limiting:** Reddit public API is generous for read-only; no auth required

### Step 4 — In-Browser Filtering

For each result from every query:

**24-hour filter:**
```js
const age = Date.now() / 1000 - post.created_utc;
if (age > 86400) discard;
```

**Keyword match:**
- Post (`t3`): keyword must appear in `title` OR `selftext`
- Comment (`t2`): keyword must appear in `body`
- Match is case-insensitive substring

**Exclude keyword filter:**
- If any exclude keyword appears in the matched fields → discard

**Min upvotes / min comments (only if set):**
```js
if (minUpvotes && post.ups < minUpvotes) discard;
if (minComments && post.num_comments < minComments) discard;
```

### Step 5 — Dedup + Store
Send filtered results to Convex HTTP action:
```js
fetch(`${CONVEX_HTTP_URL}/upsertResults`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ deviceId, posts: filteredResults })
});
```
Convex upserts by `postId` — if a post already exists for this device, it's skipped.

### Step 6 — Render
Query Convex for all non-expired results for this `deviceId` and render into the scattered card layout.

---

## 4. Convex Schema

```ts
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  redditResults: defineTable({
    deviceId:    v.string(),
    postId:      v.string(),       // Reddit fullname e.g. "t3_abc123"
    type:        v.string(),       // "post" | "comment"
    title:       v.optional(v.string()),
    body:        v.string(),
    author:      v.string(),
    subreddit:   v.string(),
    url:         v.string(),
    ups:         v.number(),
    numComments: v.number(),
    createdUtc:  v.number(),       // Reddit's created_utc
    fetchedAt:   v.number(),       // Date.now() when stored
  })
  .index("by_device", ["deviceId"])
  .index("by_device_post", ["deviceId", "postId"]),  // dedup index
});
```

---

## 5. Convex Functions

### HTTP Action — `upsertResults`
```ts
// convex/http.ts
export const upsertResults = httpAction(async (ctx, request) => {
  const { deviceId, posts } = await request.json();

  for (const post of posts) {
    const existing = await ctx.db
      .query("redditResults")
      .withIndex("by_device_post", q =>
        q.eq("deviceId", deviceId).eq("postId", post.postId)
      )
      .first();

    if (!existing) {
      await ctx.db.insert("redditResults", { deviceId, ...post, fetchedAt: Date.now() });
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
```

### Query — `getResults`
```ts
// convex/reddit.ts
export const getResults = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    return await ctx.db
      .query("redditResults")
      .withIndex("by_device", q => q.eq("deviceId", deviceId))
      .collect();
  }
});
```

### Scheduled Job — TTL Cleanup
```ts
// convex/crons.ts
crons.hourly("cleanup-expired-reddit-results", { minuteOfHour: 0 }, async (ctx) => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const expired = await ctx.db
    .query("redditResults")
    .filter(q => q.lt(q.field("fetchedAt"), cutoff))
    .collect();

  for (const doc of expired) {
    await ctx.db.delete(doc._id);
  }
});
```

---

## 6. Subreddit Autocomplete

**Trigger:** User types 2+ characters in the "Add Subreddit" input.

**Endpoint:**
```
GET https://www.reddit.com/subreddits/search.json?q={query}&limit=8
```

**Implementation:**
- Debounce 300ms after keystroke
- Render dropdown of `data.children[].data.display_name` below the input
- On select: add to `state.subreddits` (max 5), clear input, hide dropdown
- On blur (100ms delay): hide dropdown
- If subreddits.length >= 5: disable input, show "Max 5 subreddits" hint

---

## 7. chrome.storage Structure

```js
// Written on first install / settings change
chrome.storage.local.set({
  deviceId: crypto.randomUUID(),   // written once, never overwritten
  lastFetchAt: 0,                  // updated after each successful fetchPipeline()
  settings: {
    keywords:    [],   // synced from state.keywords on every change
    excluded:    [],   // synced from state.excluded
    subreddits:  [],   // synced from state.subreddits
    minUpvotes:  null, // null = no filter
    minComments: null,
  }
});
```

Settings are written to `chrome.storage.local` on every state mutation (same place `rerenderUI` is called).

---

## 8. Error Handling

| Failure | Behaviour |
|---|---|
| Reddit API returns non-200 | Log, skip that (keyword, subreddit) pair, continue others |
| Reddit rate limit (429) | Skip silently, do not update `lastFetchAt` (retry next open) |
| Convex upsert fails | Log error, still render whatever was already in Convex |
| No subreddits set | Skip fetchPipeline entirely, show "Add subreddits in Settings" empty state |
| No keywords set | Same — skip fetch, show empty state prompt |
| Autocomplete fetch fails | Hide dropdown silently, user can still type manually |

---

## 9. Constraints & Limits

- Max subreddits: 5
- Max keywords: 10 (already enforced in UI)
- Max results per query: 100 (Reddit API `limit=100`)
- Total max results before filter: 10 keywords × 5 subreddits × 100 = 5,000 (in practice far fewer after 24h + keyword filter)
- Fetch cadence: every 12 hours per device
- TTL: 24 hours (Convex scheduled cleanup, hourly)
- No auth required — Reddit public JSON API, anonymous reads

---

## 10. File Changes

| File | Change |
|---|---|
| `chrome-extension/content.js` | Add `fetchPipeline()`, `renderFromConvex()`, subreddit autocomplete, `chrome.storage` sync |
| `convex/schema.ts` | New file — `redditResults` table |
| `convex/reddit.ts` | New file — `getResults` query |
| `convex/http.ts` | New file — `upsertResults` HTTP action |
| `convex/crons.ts` | New file — hourly TTL cleanup |
| `chrome-extension/manifest.json` | No changes needed (already has `<all_urls>` host permission) |
