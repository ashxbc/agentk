# Reddit Feed Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the AgentK Chrome extension's Reddit feed to live Reddit data — fetching posts/comments matching user keywords across selected subreddits, storing them in Convex, and rendering them into the existing scattered card layout.

**Architecture:** content.js fetches Reddit's public JSON API directly from the browser (no proxy needed), filters results in-browser, then upserts to Convex via plain `fetch()` HTTP actions (no SDK). chrome.storage.local persists deviceId, lastFetchAt, and settings across sessions. Convex handles deduplication and 24h TTL cleanup.

**Tech Stack:** Vanilla JS (content.js, no bundler), Convex (TypeScript backend, `npx convex` CLI), Reddit public JSON API (no auth), chrome.storage.local

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `convex/schema.ts` | Create | redditResults table definition + indexes |
| `convex/reddit.ts` | Create | getResults query |
| `convex/http.ts` | Create | upsertResults HTTP action + router |
| `convex/crons.ts` | Create | Hourly TTL cleanup job |
| `chrome-extension/content.js` | Modify | Storage init, fetchPipeline, filterResults, renderFromConvex, autocomplete, empty states |

---

## Task 1: Convex Project Setup

**Files:**
- Create: `convex/schema.ts`
- Run: `npx convex dev` in `d:\agentk`

- [ ] **Step 1: Install Convex in the Next.js project**

```bash
cd d:/agentk
npm install convex
```

Expected: convex added to package.json

- [ ] **Step 2: Initialize Convex project**

```bash
npx convex dev
```

Follow the prompts: create a new project, log in if needed. This creates `convex/` directory and `convex.json` / `.env.local` with your deployment URL.

After init, stop the dev watcher (Ctrl+C) — you'll restart it after writing functions.

- [ ] **Step 3: Write the schema**

Create `convex/schema.ts`:

```ts
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
    .index("by_device", ["deviceId"])
    .index("by_device_post", ["deviceId", "postId"]),
});
```

- [ ] **Step 4: Deploy schema**

```bash
npx convex dev
```

Expected output: `✓ schema pushed` — leave running for the next tasks.

- [ ] **Step 5: Commit**

```bash
git init  # if not already a git repo
git add convex/schema.ts convex.json package.json package-lock.json
git commit -m "feat: init convex project with redditResults schema"
```

---

## Task 2: Convex Query — getResults

**Files:**
- Create: `convex/reddit.ts`

- [ ] **Step 1: Write the query**

Create `convex/reddit.ts`:

```ts
import { query } from "./_generated/server";
import { v } from "convex/values";

export const getResults = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    return await ctx.db
      .query("redditResults")
      .withIndex("by_device", q => q.eq("deviceId", deviceId))
      .collect();
  },
});
```

- [ ] **Step 2: Verify Convex picks it up**

The running `npx convex dev` watcher should output:
```
✓ Convex functions ready
```
If it errors, check the TypeScript — common issue is import path (`"./_generated/server"` must be exact).

- [ ] **Step 3: Commit**

```bash
git add convex/reddit.ts
git commit -m "feat: add getResults convex query for reddit feed"
```

---

## Task 3: Convex HTTP Action — upsertResults

**Files:**
- Create: `convex/http.ts`

- [ ] **Step 1: Write the HTTP action**

Create `convex/http.ts`:

```ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/upsertResults",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const { deviceId, posts } = await request.json();

    if (!deviceId || !Array.isArray(posts)) {
      return new Response(JSON.stringify({ error: "invalid payload" }), { status: 400 });
    }

    for (const post of posts) {
      const existing = await ctx.db
        .query("redditResults")
        .withIndex("by_device_post", q =>
          q.eq("deviceId", deviceId).eq("postId", post.postId)
        )
        .first();

      if (!existing) {
        await ctx.db.insert("redditResults", {
          deviceId,
          postId:      post.postId,
          type:        post.type,
          title:       post.title ?? undefined,
          body:        post.body,
          author:      post.author,
          subreddit:   post.subreddit,
          url:         post.url,
          ups:         post.ups,
          numComments: post.numComments,
          createdUtc:  post.createdUtc,
          fetchedAt:   Date.now(),
        });
      }
    }

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

export default http;
```

> **Note on CORS:** The Chrome extension's content.js runs in a page origin context. The `Access-Control-Allow-Origin: *` header on the Convex HTTP action is required, otherwise the browser will block the response.

- [ ] **Step 2: Verify watcher accepts it**

Convex dev watcher should show:
```
✓ Convex functions ready
```

- [ ] **Step 3: Note your Convex HTTP URL**

Open `.env.local` (created by `npx convex dev`) and find:
```
NEXT_PUBLIC_CONVEX_URL=https://your-deployment-name.convex.cloud
```

The HTTP actions base URL is that same value. Save it — you'll hardcode it into content.js in Task 5.

- [ ] **Step 4: Commit**

```bash
git add convex/http.ts
git commit -m "feat: add upsertResults http action with CORS headers"
```

---

## Task 4: Convex Cron — TTL Cleanup

**Files:**
- Create: `convex/crons.ts`

- [ ] **Step 1: Write the hourly cleanup job**

Create `convex/crons.ts`:

```ts
import { cronJobs } from "convex/server";
import { internalMutation } from "./_generated/server";

const crons = cronJobs();

export const deleteExpiredResults = internalMutation({
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const expired = await ctx.db
      .query("redditResults")
      .filter(q => q.lt(q.field("fetchedAt"), cutoff))
      .collect();

    for (const doc of expired) {
      await ctx.db.delete(doc._id);
    }
  },
});

crons.hourly(
  "cleanup-expired-reddit-results",
  { minuteOfHour: 0 },
  "crons:deleteExpiredResults"
);

export default crons;
```

- [ ] **Step 2: Verify**

Convex dev watcher should accept without errors.

- [ ] **Step 3: Commit**

```bash
git add convex/crons.ts
git commit -m "feat: add hourly TTL cleanup cron for reddit results"
```

---

## Task 5: chrome.storage Init + Settings Sync

**Files:**
- Modify: `chrome-extension/content.js`

This task adds persistent storage. All state mutations already call `rerenderUI()` — we piggyback `syncStorage()` onto that same call.

- [ ] **Step 1: Add the Convex URL constant and storage helpers after the `state` object**

In `content.js`, after the `state = { ... }` block (around line 19), add:

```js
  /* ─── Convex Config ─── */
  const CONVEX_URL = 'https://your-deployment-name.convex.cloud'; // replace with your actual URL from .env.local

  /* ─── Storage ─── */
  function initStorage() {
    chrome.storage.local.get(['deviceId', 'lastFetchAt', 'settings'], (stored) => {
      if (!stored.deviceId) {
        chrome.storage.local.set({ deviceId: crypto.randomUUID() });
      }
      if (!stored.lastFetchAt) {
        chrome.storage.local.set({ lastFetchAt: 0 });
      }
      if (stored.settings) {
        state.keywords    = stored.settings.keywords    ?? state.keywords;
        state.excluded    = stored.settings.excluded    ?? state.excluded;
        state.subreddits  = stored.settings.subreddits  ?? state.subreddits;
        state.minUpvotes  = stored.settings.minUpvotes  ?? state.minUpvotes;
        state.minComments = stored.settings.minComments ?? state.minComments;
      }
    });
  }

  function syncStorage() {
    chrome.storage.local.set({
      settings: {
        keywords:    state.keywords,
        excluded:    state.excluded,
        subreddits:  state.subreddits,
        minUpvotes:  state.minUpvotes,
        minComments: state.minComments,
      }
    });
  }
```

- [ ] **Step 2: Call initStorage() in mount()**

Find the `mount()` function (around line 368). Add `initStorage()` as the first call inside it, before `renderInternal`:

```js
  function mount() {
    if (host?.isConnected) return;
    unmount();
    initStorage(); // ← add this line

    host = document.createElement("div");
    // ... rest of mount unchanged
```

- [ ] **Step 3: Call syncStorage() inside rerenderUI()**

Find `rerenderUI()` (around line 699). Add `syncStorage()` at the top:

```js
  function rerenderUI() {
    syncStorage(); // ← add this line
    const shadow = host.shadowRoot;
    const section = shadow.getElementById('section-settings');
    const scrollTop = section ? section.scrollTop : 0;
    const root = shadow.getElementById('agentk-root');
    renderInternal(root, shadow);
    const sectionAfter = shadow.getElementById('section-settings');
    if (sectionAfter) sectionAfter.scrollTop = scrollTop;
  }
```

- [ ] **Step 4: Add `storage` permission to manifest**

In `chrome-extension/manifest.json`, update the permissions array:

```json
"permissions": ["activeTab", "scripting", "storage"]
```

- [ ] **Step 5: Reload and verify**

Load the extension in Chrome (`chrome://extensions` → reload). Open the popup, add a keyword, close and reopen. The keyword should still be there (loaded from storage).

Open DevTools on any page → Application → Storage → Local Storage → Extension ID → verify `settings` key exists with your keyword.

- [ ] **Step 6: Commit**

```bash
git add chrome-extension/content.js chrome-extension/manifest.json
git commit -m "feat: add chrome.storage persistence for settings and deviceId"
```

---

## Task 6: filterResults() Helper

**Files:**
- Modify: `chrome-extension/content.js`

Add this pure function before `fetchPipeline` (which comes in Task 7). It takes raw Reddit API items and returns only those that pass all filters.

- [ ] **Step 1: Add filterResults() after the syncStorage() function**

```js
  function filterResults(items, keyword, settings) {
    const now = Date.now() / 1000;
    const kwLower = keyword.toLowerCase();
    const exLower = (settings.excluded || []).map(e => e.toLowerCase());

    return items.filter(item => {
      const d = item.data;

      // 24h filter
      if (now - d.created_utc > 86400) return false;

      // Determine searchable text based on type
      const isComment = item.kind === 't1';
      const searchText = isComment
        ? (d.body || '').toLowerCase()
        : ((d.title || '') + ' ' + (d.selftext || '')).toLowerCase();

      // Keyword must appear
      if (!searchText.includes(kwLower)) return false;

      // Exclude keywords must not appear
      if (exLower.some(ex => searchText.includes(ex))) return false;

      // Min upvotes (only if set)
      if (settings.minUpvotes && d.ups < settings.minUpvotes) return false;

      // Min comments (only if set, posts only — comments don't have num_comments)
      if (!isComment && settings.minComments && d.num_comments < settings.minComments) return false;

      return true;
    });
  }
```

- [ ] **Step 2: Commit**

```bash
git add chrome-extension/content.js
git commit -m "feat: add filterResults helper for reddit post/comment filtering"
```

---

## Task 7: fetchPipeline() + renderFromConvex()

**Files:**
- Modify: `chrome-extension/content.js`

The core fetch logic. Add both functions after `filterResults()`.

- [ ] **Step 1: Add fetchPipeline()**

```js
  async function fetchPipeline() {
    const stored = await new Promise(resolve =>
      chrome.storage.local.get(['deviceId', 'settings'], resolve)
    );

    const deviceId = stored.deviceId;
    const settings = stored.settings || {};
    const keywords   = settings.keywords   || [];
    const subreddits = settings.subreddits || [];

    if (!keywords.length || !subreddits.length) return;

    // Build all (keyword, subreddit) pairs
    const pairs = [];
    for (const kw of keywords) {
      for (const sub of subreddits) {
        pairs.push({ kw, sub });
      }
    }

    // Fan out all queries simultaneously
    const results = await Promise.allSettled(
      pairs.map(({ kw, sub }) =>
        fetch(
          `https://www.reddit.com/r/${encodeURIComponent(sub)}/search.json` +
          `?q=${encodeURIComponent(kw)}&restrict_sr=1&sort=new&t=day&limit=100&type=link,comment`,
          { headers: { 'Accept': 'application/json' } }
        )
        .then(r => {
          if (!r.ok) throw new Error(`Reddit ${r.status} for ${sub}/${kw}`);
          return r.json();
        })
        .then(json => ({ kw, sub, items: json?.data?.children || [] }))
        .catch(err => { console.warn('[agentK]', err.message); return { kw, sub, items: [] }; })
      )
    );

    // Collect and filter
    const filtered = [];
    const seen = new Set();

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const { kw, items } = result.value;
      const passing = filterResults(items, kw, settings);

      for (const item of passing) {
        const d = item.data;
        const postId = d.name; // e.g. "t3_abc123" or "t1_xyz"
        if (seen.has(postId)) continue;
        seen.add(postId);

        const isComment = item.kind === 't1';
        filtered.push({
          postId,
          type:        isComment ? 'comment' : 'post',
          title:       isComment ? undefined : d.title,
          body:        isComment ? d.body : (d.selftext || ''),
          author:      d.author,
          subreddit:   d.subreddit,
          url:         isComment
            ? `https://reddit.com${d.permalink}`
            : `https://reddit.com${d.permalink}`,
          ups:         d.ups,
          numComments: d.num_comments || 0,
          createdUtc:  d.created_utc,
        });
      }
    }

    if (!filtered.length) return;

    // Push to Convex
    try {
      await fetch(`${CONVEX_URL}/upsertResults`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, posts: filtered }),
      });
    } catch (err) {
      console.warn('[agentK] Convex upsert failed:', err.message);
    }

    // Mark fetch time
    chrome.storage.local.set({ lastFetchAt: Date.now() });
  }
```

- [ ] **Step 2: Add renderFromConvex()**

```js
  async function renderFromConvex(shadow) {
    const stored = await new Promise(resolve =>
      chrome.storage.local.get(['deviceId'], resolve)
    );
    const deviceId = stored.deviceId;
    if (!deviceId) return;

    let posts = [];
    try {
      const res = await fetch(`${CONVEX_URL}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'reddit:getResults',
          args: { deviceId },
          format: 'json',
        }),
      });
      const json = await res.json();
      posts = json?.value ?? [];
    } catch (err) {
      console.warn('[agentK] Convex read failed:', err.message);
      return;
    }

    if (!posts.length) return;

    // Map Convex results to the shape redditFeedHTML() expects
    const mapped = posts.slice(0, 10).map(p => ({
      sub:      `r/${p.subreddit}`,
      user:     `u/${p.author}`,
      age:      formatAge(p.createdUtc),
      votes:    formatCount(p.ups),
      comments: formatCount(p.numComments),
      title:    p.title || p.body.slice(0, 120),
      snippet:  p.body.slice(0, 200),
      url:      p.url,
    }));

    const canvas = shadow.querySelector('.reddit-canvas');
    if (!canvas) return;

    // Re-render cards with live data using existing scattered positions
    const positions = [
      [4,   5,  -2, 1], [28,  2,   1, 2], [55,  4,  -1, 1], [76,  1,   2, 3],
      [14, 40,   2, 2], [42, 34,  -2, 1], [67, 37,   1, 2], [2,  60,  -1, 3],
      [36, 60,   2, 1], [63, 57,  -2, 2],
    ];

    canvas.innerHTML = mapped.map((p, i) => {
      const [lp, tp, rot, z] = positions[i] || [Math.random()*70, Math.random()*60, 0, 1];
      return `<div class="reddit-card" style="left:${lp}%;top:${tp}%;transform:translate(0,0) rotate(${rot}deg);--tx:0px;--ty:0px;--rot:${rot}deg;z-index:${z}" data-url="${p.url}">
        <div class="reddit-body">
          <div class="reddit-meta"><b>${p.sub}</b> · ${p.user} · ${p.age}</div>
          <div class="reddit-title">${p.title.replace(/</g,'&lt;')}</div>
        </div>
        <div class="reddit-actions">
          <div class="reddit-vote-group">
            <button class="reddit-vote-btn" aria-label="upvote">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
            <span class="reddit-vote-count">${p.votes}</span>
            <button class="reddit-vote-btn down" aria-label="downvote">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
          <button class="reddit-action-btn">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            ${p.comments}
          </button>
          <button class="reddit-action-btn">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            Share
          </button>
        </div>
      </div>`;
    }).join('');

    // Make cards clickable
    canvas.querySelectorAll('.reddit-card[data-url]').forEach(card => {
      card.addEventListener('click', () => window.open(card.dataset.url, '_blank'));
    });
  }

  function formatAge(createdUtc) {
    const diff = Math.floor(Date.now() / 1000 - createdUtc);
    if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  }

  function formatCount(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }
```

- [ ] **Step 3: Commit**

```bash
git add chrome-extension/content.js
git commit -m "feat: add fetchPipeline and renderFromConvex for live reddit data"
```

---

## Task 8: Reddit Tab Trigger

**Files:**
- Modify: `chrome-extension/content.js`

Hook the Reddit tab switch to check the 12h cache and run fetchPipeline or renderFromConvex.

- [ ] **Step 1: Replace the tab switching handler in bindTabSwitching()**

Find `bindTabSwitching()` (around line 622). The current implementation just calls `renderInternal`. Replace it:

```js
  function bindTabSwitching(root, shadow) {
    shadow.querySelectorAll(".nav-item").forEach(btn => {
      btn.addEventListener("click", async () => {
        activeTab = btn.getAttribute("data-tab");
        renderInternal(root, shadow);

        if (activeTab === 'reddit') {
          const stored = await new Promise(resolve =>
            chrome.storage.local.get(['lastFetchAt', 'settings'], resolve)
          );
          const settings = stored.settings || {};
          const hasKeywords   = (settings.keywords   || []).length > 0;
          const hasSubreddits = (settings.subreddits || []).length > 0;

          if (!hasKeywords || !hasSubreddits) return; // empty state shown by redditFeedHTML

          const shouldFetch = (Date.now() - (stored.lastFetchAt || 0)) > 12 * 60 * 60 * 1000;
          if (shouldFetch) {
            await fetchPipeline();
          }
          await renderFromConvex(shadow);
        }
      });
    });
  }
```

- [ ] **Step 2: Commit**

```bash
git add chrome-extension/content.js
git commit -m "feat: trigger reddit fetch on tab switch with 12h cache check"
```

---

## Task 9: Empty States

**Files:**
- Modify: `chrome-extension/content.js`

When no keywords or subreddits are configured, show a helpful prompt instead of the scattered cards.

- [ ] **Step 1: Update redditFeedHTML() to show an empty state**

Find `redditFeedHTML()` in content.js. It currently starts with `function redditFeedHTML() {`. Replace the top of the function to add an early return for empty state:

```js
  function redditFeedHTML() {
    const hasKeywords   = state.keywords.length > 0;
    const hasSubreddits = state.subreddits.length > 0;

    if (!hasKeywords || !hasSubreddits) {
      const missing = !hasKeywords && !hasSubreddits
        ? 'keywords and subreddits'
        : !hasKeywords ? 'target keywords' : 'subreddits';
      return `<div class="reddit-canvas" style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;">
        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#C4B9AA" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <p style="font-size:14px;font-weight:600;color:#62584F;text-align:center;">No ${missing} set</p>
        <p style="font-size:12px;color:#B2A28C;text-align:center;max-width:220px;">Go to Settings and add ${missing} to start finding buying intent on Reddit.</p>
      </div>`;
    }

    // … rest of the existing redditFeedHTML() function unchanged
```

- [ ] **Step 2: Commit**

```bash
git add chrome-extension/content.js
git commit -m "feat: add empty state for reddit feed when no keywords or subreddits set"
```

---

## Task 10: Subreddit Autocomplete

**Files:**
- Modify: `chrome-extension/content.js`

Add debounced dropdown suggestions to the "Add Subreddit" input in Settings.

- [ ] **Step 1: Add autocomplete CSS**

In the `CSS` template literal in content.js, add these rules after the `.sub-add-btn` rule:

```css
    .sub-autocomplete {
      position: absolute; top: 100%; left: 0; right: 0; z-index: 100;
      background: #fff; border: 1px solid rgba(0,0,0,0.08);
      border-radius: 8px; overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      margin-top: 4px;
    }
    .sub-autocomplete-item {
      padding: 8px 12px; font-size: 13px; color: #191918; cursor: pointer;
      transition: background 0.15s;
    }
    .sub-autocomplete-item:hover { background: #FDF7EF; }
    .sub-input-wrap { position: relative; flex: 1; }
```

- [ ] **Step 2: Add autocomplete logic to bindSettingsEvents()**

Find the Reddit section in `bindSettingsEvents()` where `subInput` and `subBtn` are set up (around line 664). Add the autocomplete wiring after the existing subreddit event bindings:

```js
    // Subreddit autocomplete
    let subDebounce = null;

    function showAutocomplete(items) {
      // Remove any existing dropdown
      const existing = shadow.querySelector('.sub-autocomplete');
      if (existing) existing.remove();
      if (!items.length) return;

      const dropdown = document.createElement('div');
      dropdown.className = 'sub-autocomplete';
      items.forEach(name => {
        const item = document.createElement('div');
        item.className = 'sub-autocomplete-item';
        item.textContent = `r/${name}`;
        item.addEventListener('mousedown', (e) => {
          e.preventDefault(); // prevent blur firing first
          if (state.subreddits.length >= 5) return;
          if (!state.subreddits.includes(name)) {
            state.subreddits.push(name);
            rerenderUI();
          }
        });
        dropdown.appendChild(item);
      });

      const wrap = subInput?.closest('.sub-input-wrap');
      if (wrap) wrap.appendChild(dropdown);
    }

    if (subInput) {
      subInput.addEventListener('input', () => {
        clearTimeout(subDebounce);
        const val = subInput.value.trim();
        if (val.length < 2) {
          const ex = shadow.querySelector('.sub-autocomplete');
          if (ex) ex.remove();
          return;
        }
        if (state.subreddits.length >= 5) return;
        subDebounce = setTimeout(async () => {
          try {
            const res = await fetch(
              `https://www.reddit.com/subreddits/search.json?q=${encodeURIComponent(val)}&limit=8`,
              { headers: { 'Accept': 'application/json' } }
            );
            const json = await res.json();
            const names = (json?.data?.children || [])
              .map(c => c.data.display_name)
              .filter(n => !state.subreddits.includes(n));
            showAutocomplete(names);
          } catch {
            // silent fail — user can still type manually
          }
        }, 300);
      });

      subInput.addEventListener('blur', () => {
        setTimeout(() => {
          const ex = shadow.querySelector('.sub-autocomplete');
          if (ex) ex.remove();
        }, 150);
      });
    }
```

- [ ] **Step 3: Disable input when at max 5**

Find the subreddit input HTML in `settingsHTML()` (around line 331):

```js
<div class="sub-input-wrap"><span class="sub-prefix">r/</span><input id="sub-input" placeholder="startup" autocomplete="off"/></div>
<button class="sub-add-btn" id="sub-add-btn">Add</button>
```

Replace with:

```js
<div class="sub-input-wrap"><span class="sub-prefix">r/</span><input id="sub-input" placeholder="startup" autocomplete="off" ${subs.length >= 5 ? 'disabled' : ''}/></div>
<button class="sub-add-btn" id="sub-add-btn" ${subs.length >= 5 ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>Add</button>
```

Also add the max hint below the input. Find where the sub-tags div is rendered and add below it:

```js
${subs.length >= 5 ? `<p style="font-size:11px;color:#B2A28C;margin-top:4px;">Max 5 subreddits reached</p>` : ''}
```

- [ ] **Step 4: Test autocomplete**

Reload extension. Open Settings, type "sa" in the subreddit input. A dropdown should appear after 300ms with suggestions like `r/SaaS`, `r/sales`, etc. Click one — it should be added as a pill. Add 5 total — input should disable.

- [ ] **Step 5: Commit**

```bash
git add chrome-extension/content.js
git commit -m "feat: add subreddit autocomplete with 2-char trigger and 5 max cap"
```

---

## Task 11: Deploy Convex to Production

- [ ] **Step 1: Deploy**

```bash
cd d:/agentk
npx convex deploy
```

Expected: outputs a production deployment URL like `https://your-name.convex.cloud`.

- [ ] **Step 2: Update CONVEX_URL in content.js**

Replace the `CONVEX_URL` constant value with the production URL from the deploy output.

- [ ] **Step 3: Reload extension and do an end-to-end test**

1. Open extension → Settings
2. Add 1 keyword (e.g. "AI SaaS") and 1 subreddit (e.g. "SaaS")
3. Click the Reddit tab
4. Wait ~5 seconds for the fetch to complete
5. Cards should update from static mock data to real Reddit posts
6. Open DevTools Network tab — confirm calls to `reddit.com` and `convex.cloud`
7. Close and reopen extension — confirm cards load instantly from Convex (no re-fetch within 12h)

- [ ] **Step 4: Final commit**

```bash
git add chrome-extension/content.js
git commit -m "feat: wire production convex URL for reddit feed backend"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Reddit public JSON API fan-out (Task 7)
- ✅ N×M keyword×subreddit queries with Promise.allSettled (Task 7)
- ✅ 24h filter, keyword match (post title/body, comment body), exclude keywords, min upvotes/comments (Task 6)
- ✅ Convex schema with indexes (Task 1)
- ✅ upsertResults HTTP action with dedup by postId (Task 3)
- ✅ getResults query by deviceId (Task 2)
- ✅ Hourly TTL cleanup (Task 4)
- ✅ deviceId generated once, persisted in chrome.storage (Task 5)
- ✅ lastFetchAt checked, 12h cache gate (Task 8)
- ✅ Settings synced to chrome.storage on every mutation (Task 5)
- ✅ Subreddit autocomplete, 2-char trigger, 300ms debounce, max 5 (Task 10)
- ✅ Empty states for missing keywords/subreddits (Task 9)
- ✅ CORS headers on HTTP action (Task 3)
- ✅ Error handling: failed queries skipped, Convex failure falls back to existing data (Task 7)
