# X Feed Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace static mock `X_POSTS` data with real tweets from twitterapi.io, proxied through a Convex HTTP action, cached in a `twitterResults` table, and rendered as a scrollable scattered card layout.

**Architecture:** The Chrome extension calls `POST /fetchXResults` on the Convex HTTP action site URL, which builds the search query, fetches from twitterapi.io using a server-side API key, filters + ranks the results, and upserts them into `twitterResults`. The extension then reads from the `getXResults` query to render cards. A 12h TTL in `chrome.storage.local` prevents redundant fetches; a 24h cleanup cron removes stale DB records.

**Tech Stack:** Convex (internalMutation, query, httpAction, cronJobs), twitterapi.io REST API, Chrome Extension Manifest V3 (vanilla JS IIFE, Shadow DOM, chrome.storage.local)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `convex/schema.ts` | Modify | Add `twitterResults` table + indexes |
| `convex/twitter.ts` | Create | `upsertXResults`, `deleteExpiredXResults`, `getXResults` |
| `convex/http.ts` | Modify | Add `POST /fetchXResults` + `OPTIONS /fetchXResults` |
| `convex/crons.ts` | Modify | Add hourly X cleanup cron |
| `chrome-extension/content.js` | Modify | All client-side X feed logic |

---

## Task 1: Set Convex env var

**Files:**
- No file changes — CLI command only

- [ ] **Step 1: Set the API key in Convex**

```bash
cd d:/agentk
npx convex env set TWITTER_API_KEY new1_dee0fbf176584d6392f5bdbda38190cc
```

Expected output: `Set TWITTER_API_KEY`

- [ ] **Step 2: Verify it was set**

```bash
npx convex env list
```

Expected: `TWITTER_API_KEY` appears in the list.

---

## Task 2: Add `twitterResults` table to schema

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Read the Convex guidelines first**

```
convex/_generated/ai/guidelines.md
```

- [ ] **Step 2: Update schema.ts**

Replace the entire file content with:

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  redditResults: defineTable({
    deviceId:    v.string(),
    postId:      v.string(),
    type:        v.string(),
    title:       v.optional(v.string()),
    body:        v.string(),
    author:      v.string(),
    subreddit:   v.string(),
    url:         v.string(),
    ups:         v.number(),
    numComments: v.number(),
    createdUtc:  v.number(),
    fetchedAt:   v.number(),
  })
    .index("by_device",      ["deviceId"])
    .index("by_device_post", ["deviceId", "postId"]),

  twitterResults: defineTable({
    deviceId:  v.string(),
    tweetId:   v.string(),
    url:       v.string(),
    text:      v.string(),
    name:      v.string(),
    handle:    v.string(),
    verified:  v.boolean(),
    followers: v.number(),
    likes:     v.number(),
    reposts:   v.number(),
    replies:   v.number(),
    views:     v.number(),
    score:     v.number(),
    createdAt: v.string(),
    fetchedAt: v.number(),
  })
    .index("by_device",       ["deviceId"])
    .index("by_device_tweet", ["deviceId", "tweetId"]),
});
```

---

## Task 3: Create `convex/twitter.ts`

**Files:**
- Create: `convex/twitter.ts`

- [ ] **Step 1: Create the file**

```typescript
import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsertXResults = internalMutation({
  args: {
    deviceId: v.string(),
    tweets: v.array(v.object({
      tweetId:   v.string(),
      url:       v.string(),
      text:      v.string(),
      name:      v.string(),
      handle:    v.string(),
      verified:  v.boolean(),
      followers: v.number(),
      likes:     v.number(),
      reposts:   v.number(),
      replies:   v.number(),
      views:     v.number(),
      score:     v.number(),
      createdAt: v.string(),
    })),
  },
  handler: async (ctx, { deviceId, tweets }) => {
    for (const tweet of tweets) {
      const existing = await ctx.db
        .query("twitterResults")
        .withIndex("by_device_tweet", q =>
          q.eq("deviceId", deviceId).eq("tweetId", tweet.tweetId)
        )
        .first();
      if (!existing) {
        await ctx.db.insert("twitterResults", {
          deviceId,
          ...tweet,
          fetchedAt: Date.now(),
        });
      }
    }
  },
});

export const deleteExpiredXResults = internalMutation({
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const expired = await ctx.db
      .query("twitterResults")
      .filter(q => q.lt(q.field("fetchedAt"), cutoff))
      .collect();
    for (const doc of expired) {
      await ctx.db.delete(doc._id);
    }
  },
});

export const getXResults = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const results = await ctx.db
      .query("twitterResults")
      .withIndex("by_device", q => q.eq("deviceId", deviceId))
      .collect();
    return results.sort((a, b) => b.score - a.score);
  },
});
```

---

## Task 4: Update `convex/http.ts` — add `/fetchXResults`

**Files:**
- Modify: `convex/http.ts`

- [ ] **Step 1: Replace the full file**

```typescript
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

/* ── Reddit ── */
http.route({
  path: "/upsertResults",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const { deviceId, posts } = await request.json();

    if (!deviceId || !Array.isArray(posts)) {
      return new Response(JSON.stringify({ error: "invalid payload" }), {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    await ctx.runMutation(internal.reddit.upsertResults, { deviceId, posts });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }),
});

http.route({
  path: "/upsertResults",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

/* ── X (Twitter) ── */
http.route({
  path: "/fetchXResults",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const { deviceId, keywords, excluded, verifiedOnly, ratioFilter } = body;

    if (!deviceId || !Array.isArray(keywords) || keywords.length === 0) {
      return new Response(JSON.stringify({ error: "invalid payload" }), {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    const apiKey = process.env.TWITTER_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "TWITTER_API_KEY not configured" }), {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // Build query
    const since = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const kwPart = (keywords as string[]).length === 1
      ? `"${(keywords as string[])[0]}"`
      : `(${(keywords as string[]).map(k => `"${k}"`).join(" OR ")})`;
    const exPart = (excluded as string[] ?? []).map(e => `-"${e}"`).join(" ");
    const verPart = verifiedOnly ? "filter:verified" : "";
    const query = [kwPart, exPart, `-filter:replies -filter:retweets lang:en since:${since}`, verPart]
      .filter(Boolean).join(" ");

    console.log("[agentK] X query:", query);

    // Fetch from twitterapi.io
    let rawTweets: any[] = [];
    try {
      const url = new URL("https://api.twitterapi.io/twitter/tweet/advanced_search");
      url.searchParams.set("query", query);
      url.searchParams.set("queryType", "Latest");
      url.searchParams.set("cursor", "");
      const res = await fetch(url.toString(), { headers: { "x-api-key": apiKey } });
      if (!res.ok) throw new Error(`twitterapi.io responded ${res.status}`);
      const json = await res.json();
      rawTweets = json.tweets ?? [];
      console.log("[agentK] X raw tweets:", rawTweets.length);
    } catch (err: any) {
      console.error("[agentK] X fetch error:", err.message);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // Filter
    const filtered = rawTweets.filter((t: any) => {
      if (t.isReply || t.inReplyToUsername) return false;
      if (ratioFilter && (t.author?.followers ?? 0) < 500) return false;
      return true;
    });

    // Rank + cap at 20
    const scored = filtered.map((t: any) => ({
      tweetId:   String(t.id),
      url:       t.url ?? "",
      text:      t.text ?? "",
      name:      t.author?.displayName ?? t.author?.username ?? "",
      handle:    t.author?.username ?? "",
      verified:  t.author?.isVerified ?? false,
      followers: t.author?.followers ?? 0,
      likes:     t.likeCount ?? 0,
      reposts:   t.retweetCount ?? 0,
      replies:   t.replyCount ?? 0,
      views:     t.viewCount ?? 0,
      score:     (t.likeCount ?? 0)
               + (t.retweetCount ?? 0) * 2
               + (t.replyCount ?? 0) * 0.5
               + Math.log10(Math.max(1, t.viewCount ?? 0)) * 10,
      createdAt: t.createdAt ?? "",
    }));
    scored.sort((a: any, b: any) => b.score - a.score);
    const top20 = scored.slice(0, 20);

    // Upsert into Convex
    await ctx.runMutation(internal.twitter.upsertXResults, { deviceId, tweets: top20 });

    return new Response(JSON.stringify({ ok: true, count: top20.length }), {
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }),
});

http.route({
  path: "/fetchXResults",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

export default http;
```

---

## Task 5: Update `convex/crons.ts` — add X cleanup

**Files:**
- Modify: `convex/crons.ts`

- [ ] **Step 1: Replace the full file**

```typescript
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup-expired-reddit-results",
  { hours: 1 },
  internal.reddit.deleteExpiredResults
);

crons.interval(
  "cleanup-expired-x-results",
  { hours: 1 },
  internal.twitter.deleteExpiredXResults
);

export default crons;
```

---

## Task 6: Deploy Convex

**Files:**
- No file changes — CLI command only

- [ ] **Step 1: Push all Convex changes**

```bash
cd d:/agentk
npx convex dev --once
```

Expected output: `✔ Convex functions ready!` (no TypeScript errors)

- [ ] **Step 2: Verify the new HTTP route exists**

```bash
curl -s -X OPTIONS https://savory-lynx-906.convex.site/fetchXResults -i | head -5
```

Expected: `HTTP/2 204` with CORS headers.

---

## Task 7: content.js — module-level X feed state

**Files:**
- Modify: `chrome-extension/content.js` (top of file, after `redditRenderGen` line)

- [ ] **Step 1: Add X feed state variables after the Reddit feed state block**

Find this block:
```js
  /* ─── Reddit feed progressive state ─── */
  let redditFeedPosts = [];
  let redditFeedOffset = 0;
  let redditRenderGen = 0;   // incremented each render; stale observer callbacks bail out
  const REDDIT_BATCH = 8;
```

Add immediately after it:
```js
  /* ─── X feed progressive state ─── */
  let xFeedPosts   = [];
  let xFeedOffset  = 0;
  let xRenderGen   = 0;
  const X_BATCH       = 10;
  const X_BAND_HEIGHT = 440;
  const X_BAND_SCATTER = [
    [4,  6, -2, 1], [30, 3,  1, 2], [57,  5, -1, 1], [76, 2,  2, 3],
    [16,42,  2, 2], [44,36, -2, 1], [68, 38,  1, 2], [2, 62, -1, 3],
    [38,62,  2, 1], [64,58, -2, 2],
  ];
```

---

## Task 8: content.js — `xCardHTML` and `appendXBatch`

**Files:**
- Modify: `chrome-extension/content.js` (insert before `renderFromConvex` function)

- [ ] **Step 1: Add `xCardHTML(t)` helper**

Insert this function immediately before the `renderFromConvex` function:

```js
  function xCardHTML(t) {
    const initials = t.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';
    const palette = ['#1a1a2e','#0f3460','#7b2d8b','#1a6b3c','#8b1a1a','#2d5a8b','#5a2d82','#1a3a6b','#1a6b5a','#6b1a3a'];
    const color = palette[t.handle.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length];
    const textEsc = t.text.replace(/</g, '&lt;').replace(/\n/g, ' ');
    const ago = formatAge(Math.floor(new Date(t.createdAt).getTime() / 1000));
    return `<div class="x-card" data-url="${t.url}">
      <div class="x-card-header">
        <div class="x-avatar" style="background:${color}">${initials}</div>
        <div class="x-card-meta">
          <div class="x-card-name" style="display:flex;align-items:center;gap:3px">
            ${t.name}
            ${t.verified ? `<svg viewBox="0 0 22 22" width="12" height="12" fill="#1d9bf0"><path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/></svg>` : ''}
          </div>
          <div class="x-card-handle">@${t.handle} · ${ago}</div>
        </div>
      </div>
      <div class="x-card-text">${textEsc}</div>
      <div class="x-card-footer">
        <div class="x-card-stats">
          <span class="x-card-stat">
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            ${formatCount(t.likes)}
          </span>
          <span class="x-card-stat">
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            ${formatCount(t.replies)}
          </span>
        </div>
      </div>
    </div>`;
  }
```

- [ ] **Step 2: Add `appendXBatch(inner, gen)` helper**

Insert immediately after `xCardHTML`:

```js
  function appendXBatch(inner, gen) {
    if (gen !== xRenderGen) return;
    const batch = xFeedPosts.slice(xFeedOffset, xFeedOffset + X_BATCH);
    if (!batch.length) return;

    const batchIndex = xFeedOffset / X_BATCH;
    const bandTop    = batchIndex * X_BAND_HEIGHT;

    batch.forEach((t, i) => {
      const [lp, tp, rot, z] = X_BAND_SCATTER[i] || [Math.random() * 65, Math.random() * 70, 0, 1];
      const topPx = bandTop + (tp / 100) * X_BAND_HEIGHT;
      const el = document.createElement('div');
      el.innerHTML = xCardHTML(t);
      const card = el.firstElementChild;
      card.style.left   = `${lp}%`;
      card.style.top    = `${topPx}px`;
      card.style.zIndex = z;
      card.style.setProperty('--tx', '0px');
      card.style.setProperty('--ty', '0px');
      card.style.setProperty('--rot', `${rot}deg`);
      card.style.transform = `translate(0,0) rotate(${rot}deg)`;
      card.addEventListener('click', () => window.open(card.dataset.url, '_blank'));
      inner.appendChild(card);
    });

    xFeedOffset += batch.length;
    inner.style.height = `${bandTop + X_BAND_HEIGHT + 60}px`;

    const old = inner.querySelector('.x-sentinel');
    if (old) old.remove();

    if (xFeedOffset < xFeedPosts.length) {
      const sentinel = document.createElement('div');
      sentinel.className = 'x-sentinel';
      sentinel.style.cssText = `position:absolute;left:50%;bottom:0;transform:translateX(-50%);padding:16px;`;
      sentinel.innerHTML = `<svg class="spin" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#DF849D" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`;
      inner.appendChild(sentinel);

      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          observer.disconnect();
          appendXBatch(inner, gen);
        }
      }, { root: inner.closest('.x-canvas'), threshold: 0.1 });

      observer.observe(sentinel);
    }
  }
```

---

## Task 9: content.js — `fetchXPipeline` and `renderFromXStorage`

**Files:**
- Modify: `chrome-extension/content.js` (insert after `appendXBatch`, before `renderFromConvex`)

- [ ] **Step 1: Add `fetchXPipeline()`**

```js
  async function fetchXPipeline() {
    const stored = await new Promise(resolve =>
      chrome.storage.local.get(['deviceId'], resolve)
    );
    const deviceId = stored.deviceId;
    if (!deviceId || !state.keywords.length) {
      console.warn('[agentK] X fetch aborted — no deviceId or keywords');
      return;
    }

    console.log('[agentK] fetchXPipeline — keywords:', state.keywords);
    try {
      const res = await fetch(`${CONVEX_SITE_URL}/fetchXResults`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          keywords:     state.keywords,
          excluded:     state.excluded,
          verifiedOnly: state.xVerified,
          ratioFilter:  state.xRatio,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn('[agentK] X fetch failed:', err.error || res.status);
        return;
      }
      chrome.storage.local.set({ xLastFetchAt: Date.now() });
      console.log('[agentK] fetchXPipeline complete');
    } catch (err) {
      console.warn('[agentK] fetchXPipeline error:', err.message);
    }
  }
```

- [ ] **Step 2: Add `renderFromXStorage(shadow)`**

Insert immediately after `fetchXPipeline`:

```js
  async function renderFromXStorage(shadow) {
    const stored = await new Promise(resolve =>
      chrome.storage.local.get(['deviceId'], resolve)
    );
    const deviceId = stored.deviceId;
    if (!deviceId) return;

    let tweets = [];
    try {
      const res = await fetch(`${CONVEX_CLOUD_URL}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'twitter:getXResults', args: { deviceId }, format: 'json' }),
      });
      const json = await res.json();
      console.log('[agentK] X Convex response:', json);
      tweets = json?.value ?? [];
    } catch (err) {
      console.warn('[agentK] X Convex read failed:', err.message);
      return;
    }

    console.log('[agentK] X tweets from Convex:', tweets.length);

    const canvas = shadow.querySelector('.x-canvas');
    if (!canvas) { console.warn('[agentK] .x-canvas not found'); return; }

    if (!tweets.length) {
      canvas.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;height:100%;">
        <p style="font-size:14px;font-weight:600;color:#62584F;">No tweets found</p>
        <p style="font-size:12px;color:#B2A28C;text-align:center;max-width:220px;">No matching tweets in the past 24h for your keywords.</p>
      </div>`;
      return;
    }

    const gen = ++xRenderGen;
    const seenUrls = new Set();
    xFeedPosts = tweets
      .filter(t => { if (seenUrls.has(t.url)) return false; seenUrls.add(t.url); return true; })
      .map(t => ({
        url:       t.url,
        text:      t.text,
        name:      t.name,
        handle:    t.handle,
        verified:  t.verified,
        likes:     t.likes,
        replies:   t.replies,
        reposts:   t.reposts,
        views:     t.views,
        createdAt: t.createdAt,
      }));
    xFeedOffset = 0;
    canvas.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'x-inner';
    canvas.appendChild(inner);
    appendXBatch(inner, gen);
  }
```

---

## Task 10: content.js — update `xFeedHTML`, remove `X_POSTS`

**Files:**
- Modify: `chrome-extension/content.js`

- [ ] **Step 1: Delete the `X_POSTS` constant**

Find and remove the entire block from:
```js
  /* ── X Feed Data ── */
  const X_POSTS = [
```
through the closing `];` (the full array declaration, ~34 lines).

- [ ] **Step 2: Replace `xFeedHTML()`**

Find:
```js
  function xFeedHTML() {
    // Pre-computed scattered positions: [left%, top%, rotation-deg, z-index]
    const positions = [
```
and replace the entire `xFeedHTML` function with:

```js
  function xFeedHTML() {
    if (!state.keywords.length) {
      return `<div class="x-canvas" style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;">
        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#C4B9AA" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <p style="font-size:14px;font-weight:600;color:#62584F;">No keywords set</p>
        <p style="font-size:12px;color:#B2A28C;text-align:center;max-width:220px;">Go to Settings and add target keywords to start finding buying intent on X.</p>
      </div>`;
    }
    return `<div class="x-canvas" style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;">
      <svg class="spin" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#DF849D" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
      <p style="font-size:13px;color:#B2A28C;">Fetching from X…</p>
    </div>`;
  }
```

---

## Task 11: content.js — update `bindTabSwitching` for X tab

**Files:**
- Modify: `chrome-extension/content.js`

- [ ] **Step 1: Add X tab handler inside `bindTabSwitching`**

Find this block inside `bindTabSwitching`:
```js
        if (activeTab === 'reddit') {
```

Add a new `if` block immediately before it:
```js
        if (activeTab === 'x') {
          if (!state.keywords.length) return;
          const stored = await new Promise(resolve =>
            chrome.storage.local.get(['xLastFetchAt'], resolve)
          );
          const shouldFetch = (Date.now() - (stored.xLastFetchAt || 0)) > 12 * 60 * 60 * 1000;
          if (shouldFetch) await fetchXPipeline();
          await renderFromXStorage(shadow);
          return;
        }
```

---

## Task 12: content.js — trigger X pipeline on `mount()`

**Files:**
- Modify: `chrome-extension/content.js`

- [ ] **Step 1: Add X pipeline trigger in `mount()`**

Find this line inside `mount()`:
```js
    renderInternal(root, shadow);
    document.addEventListener("keydown", onKeyDown);
```

Replace with:
```js
    renderInternal(root, shadow);
    document.addEventListener("keydown", onKeyDown);

    // Trigger X pipeline on initial open if X tab is active and keywords exist
    if (activeTab === 'x' && state.keywords.length) {
      const stored = await new Promise(resolve =>
        chrome.storage.local.get(['xLastFetchAt'], resolve)
      );
      const shouldFetch = (Date.now() - (stored.xLastFetchAt || 0)) > 12 * 60 * 60 * 1000;
      if (shouldFetch) await fetchXPipeline();
      renderFromXStorage(shadow);
    }
```

---

## Task 13: content.js — CSS: make `.x-canvas` scrollable, add `.x-inner`

**Files:**
- Modify: `chrome-extension/content.js` (CSS string)

- [ ] **Step 1: Update `.x-canvas` rule**

Find:
```css
    .x-canvas {
      position: relative; width: 100%; height: 100%;
      overflow: hidden; background: #FDF7EF;
    }
```

Replace with:
```css
    .x-canvas {
      position: relative; width: 100%; height: 100%;
      overflow-y: auto; overflow-x: hidden;
      background: #FDF7EF; scrollbar-width: none;
    }
    .x-canvas::-webkit-scrollbar { display: none; }
    .x-inner { position: relative; width: 100%; }
```

---

## Task 14: End-to-end verification

- [ ] **Step 1: Reload the extension**

Go to `chrome://extensions` → find agentK → click the reload icon.

- [ ] **Step 2: Open the extension and check the console**

Open any page, open agentK. Open DevTools → Console. Expected first log:
```
[agentK] fetchXPipeline — keywords: ["AI SaaS", "B2B"]
```

- [ ] **Step 3: Verify Convex receives the request**

In Convex dashboard (`https://dashboard.convex.dev`) → Logs tab → look for:
```
[agentK] X query: ("AI SaaS" OR "B2B") -filter:replies ...
[agentK] X raw tweets: <N>
```

- [ ] **Step 4: Verify tweets appear in the X tab**

After ~3-5s the spinner should be replaced by scattered tweet cards. Click a card — it should open the real tweet URL in a new tab.

- [ ] **Step 5: Verify 12h cache works**

Close and reopen the extension. The console should show:
```
[agentK] X tweets from Convex: <N>
```
with NO `fetchXPipeline` log (cache is warm, no re-fetch triggered).

- [ ] **Step 6: Verify scroll loads more**

If more than 10 tweets were found, scroll down in the X canvas — a second band of cards should appear.
