# Brand Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user syncs their product URL, AgentK fetches key pages, extracts a structured brand summary via LLM, stores it in Convex, and uses it to subtly embed the brand in replies when the post matches the ICP.

**Architecture:** Extension fetches homepage/about/pricing (plain text, regex-stripped), POSTs to a new `/syncBrand` Convex HTTP action which checks cache then calls the LLM. Reply generation reads the stored context by `[deviceId, brandUrl]` and conditionally augments the system prompt — ICP matching is handled inside the single existing LLM call, adding zero extra latency.

**Tech Stack:** Convex (schema, internalMutation, internalQuery, httpAction), OpenRouter (gemini-2.5-flash-lite), Chrome Extension MV3 (content.js, chrome.storage.local)

---

## File Map

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `brandContexts` table |
| `convex/brand.ts` | New — `upsertBrandContext` mutation + `getBrandContext` query |
| `convex/http.ts` | Add `POST /syncBrand` + `OPTIONS /syncBrand`; modify `POST /generateReply` |
| `chrome-extension/content.js` | Persist brandUrl/brandState; add deviceId to state; real sync logic; updated generateReply calls; error UI state |

---

## Task 1: Add `brandContexts` table to Convex schema

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add table definition**

Open `convex/schema.ts`. After the `extensionSessions` table closing paren, add:

```ts
  brandContexts: defineTable({
    deviceId:   v.string(),
    url:        v.string(),
    what:       v.string(),
    who:        v.string(),
    icp:        v.string(),
    painPoints: v.string(),  // JSON-stringified string[]
    features:   v.string(),
    pricing:    v.string(),
    replyHint:  v.string(),
    createdAt:  v.number(),
  }).index("by_device_url", ["deviceId", "url"]),
```

The full file should look like:

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

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
    deviceId:       v.string(),
    tweetId:        v.string(),
    url:            v.string(),
    text:           v.string(),
    name:           v.string(),
    handle:         v.string(),
    profilePicture: v.optional(v.string()),
    verified:       v.boolean(),
    followers:      v.number(),
    likes:          v.number(),
    reposts:        v.number(),
    replies:        v.number(),
    views:          v.number(),
    score:          v.number(),
    createdAt:      v.string(),
    fetchedAt:      v.number(),
  })
    .index("by_device",       ["deviceId"])
    .index("by_device_tweet", ["deviceId", "tweetId"]),

  extensionSessions: defineTable({
    token:     v.string(),
    userId:    v.id("users"),
    createdAt: v.number(),
  }).index("by_token", ["token"])
    .index("by_user",  ["userId"]),

  brandContexts: defineTable({
    deviceId:   v.string(),
    url:        v.string(),
    what:       v.string(),
    who:        v.string(),
    icp:        v.string(),
    painPoints: v.string(),
    features:   v.string(),
    pricing:    v.string(),
    replyHint:  v.string(),
    createdAt:  v.number(),
  }).index("by_device_url", ["deviceId", "url"]),
});
```

- [ ] **Step 2: Verify schema compiles**

```bash
cd d:\agentk && npx convex dev --once 2>&1 | head -20
```

Expected: no schema errors. If you see "schema validation failed", check for missing commas or wrong field types.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add brandContexts table to schema"
```

---

## Task 2: Create `convex/brand.ts` with internal mutation and query

**Files:**
- Create: `convex/brand.ts`

- [ ] **Step 1: Create the file**

```ts
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const getBrandContext = internalQuery({
  args: { deviceId: v.string(), url: v.string() },
  handler: async (ctx, { deviceId, url }) => {
    return await ctx.db
      .query("brandContexts")
      .withIndex("by_device_url", q => q.eq("deviceId", deviceId).eq("url", url))
      .unique();
  },
});

export const upsertBrandContext = internalMutation({
  args: {
    deviceId:   v.string(),
    url:        v.string(),
    what:       v.string(),
    who:        v.string(),
    icp:        v.string(),
    painPoints: v.string(),
    features:   v.string(),
    pricing:    v.string(),
    replyHint:  v.string(),
  },
  handler: async (ctx, args) => {
    // Delete existing record for this device+url before inserting fresh
    const existing = await ctx.db
      .query("brandContexts")
      .withIndex("by_device_url", q =>
        q.eq("deviceId", args.deviceId).eq("url", args.url)
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);

    await ctx.db.insert("brandContexts", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
```

- [ ] **Step 2: Verify it compiles**

```bash
cd d:\agentk && npx convex dev --once 2>&1 | head -20
```

Expected: no errors. If you see "unknown function", check the import path `"./_generated/server"`.

- [ ] **Step 3: Commit**

```bash
git add convex/brand.ts
git commit -m "feat: add getBrandContext query and upsertBrandContext mutation"
```

---

## Task 3: Add `POST /syncBrand` to `convex/http.ts`

**Files:**
- Modify: `convex/http.ts`

- [ ] **Step 1: Add import for brand internals**

At the top of `convex/http.ts`, the `internal` import already covers all internal functions via `"./_generated/api"`. No new import needed — `internal.brand.getBrandContext` and `internal.brand.upsertBrandContext` will be available automatically after Task 2.

- [ ] **Step 2: Add the URL normalizer helper**

Add this helper function near the top of `http.ts`, after the `const http = httpRouter();` line:

```ts
function normalizeBrandUrl(raw: string): string {
  return raw
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')
    .toLowerCase()
    .split('/')[0]; // domain only, no path
}
```

- [ ] **Step 3: Add `/syncBrand` POST route**

Add this block after the `/* ── Reply Generation ── */` section (before the `/generateReply` route), or at the end before `export default http`:

```ts
/* ── Brand Context Sync ── */
http.route({
  path: "/syncBrand",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const { deviceId, url, pageTexts } = await request.json();

    if (!deviceId || !url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "invalid payload" }), {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    const normalizedUrl = normalizeBrandUrl(url);

    // Check cache
    const cached = await ctx.runQuery(internal.brand.getBrandContext, {
      deviceId,
      url: normalizedUrl,
    });
    if (cached) {
      return new Response(
        JSON.stringify({
          what:       cached.what,
          who:        cached.who,
          icp:        cached.icp,
          painPoints: cached.painPoints,
          features:   cached.features,
          pricing:    cached.pricing,
          replyHint:  cached.replyHint,
          cached:     true,
        }),
        { status: 200, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Build page text block
    const homepage = (pageTexts?.homepage ?? "").slice(0, 4000);
    const about    = (pageTexts?.about    ?? "").slice(0, 4000);
    const pricing  = (pageTexts?.pricing  ?? "").slice(0, 4000);

    if (!homepage && !about && !pricing) {
      return new Response(JSON.stringify({ error: "no page content" }), {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }), {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    const extractionPrompt = `You are analyzing website content for a product using the Feynman Technique.
Return ONLY valid JSON, no markdown, no explanation:

{
  "what": "One clear sentence: what does this product do",
  "who": "Who are the primary users (specific, not generic)",
  "icp": "The ideal customer: specific role, situation, and goals",
  "painPoints": ["specific pain 1", "specific pain 2", "specific pain 3"],
  "features": "Key features in 2-3 sentences",
  "pricing": "Pricing summary, or Not found",
  "replyHint": "One sentence: how to mention this product naturally in conversation without sounding promotional"
}

HOMEPAGE:
${homepage}

ABOUT:
${about}

PRICING:
${pricing}`;

    async function callLLM(): Promise<string> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://agentk.io",
            "X-Title": "AgentK",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [{ role: "user", content: extractionPrompt }],
            max_tokens: 400,
            temperature: 0.2,
          }),
        });
        if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
        const json = await res.json();
        return (json.choices?.[0]?.message?.content ?? "").trim();
      } finally {
        clearTimeout(timeout);
      }
    }

    function parseResult(raw: string) {
      // Strip markdown code fences if model wraps response
      const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      const painPoints = Array.isArray(parsed.painPoints)
        ? parsed.painPoints
        : [parsed.painPoints ?? ""];
      return {
        what:       String(parsed.what       ?? ""),
        who:        String(parsed.who        ?? ""),
        icp:        String(parsed.icp        ?? ""),
        painPoints: JSON.stringify(painPoints),
        features:   String(parsed.features   ?? ""),
        pricing:    String(parsed.pricing    ?? "Not found"),
        replyHint:  String(parsed.replyHint  ?? ""),
      };
    }

    let result;
    try {
      const raw = await callLLM();
      try {
        result = parseResult(raw);
      } catch {
        // Retry once on JSON parse failure
        const raw2 = await callLLM();
        result = parseResult(raw2);
      }
    } catch (err: any) {
      console.error("[agentK] syncBrand LLM error:", err.message);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    await ctx.runMutation(internal.brand.upsertBrandContext, {
      deviceId,
      url: normalizedUrl,
      ...result,
    });

    return new Response(
      JSON.stringify({ ...result, cached: false }),
      { status: 200, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }),
});

http.route({
  path: "/syncBrand",
  method: "OPTIONS",
  handler: httpAction(async () =>
    new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    })
  ),
});
```

- [ ] **Step 4: Verify it compiles**

```bash
cd d:\agentk && npx convex dev --once 2>&1 | head -30
```

Expected: no errors. If `internal.brand` is not found, ensure `convex/brand.ts` from Task 2 exists.

- [ ] **Step 5: Commit**

```bash
git add convex/http.ts
git commit -m "feat: add /syncBrand HTTP action with LLM extraction and caching"
```

---

## Task 4: Modify `POST /generateReply` to inject brand context

**Files:**
- Modify: `convex/http.ts` (the existing `/generateReply` handler)

- [ ] **Step 1: Update the handler**

Find the existing `/generateReply` POST handler in `convex/http.ts`. Replace the handler body with:

```ts
handler: httpAction(async (ctx, request) => {
    const { tweetText, deviceId, brandUrl } = await request.json();

    if (!tweetText || typeof tweetText !== "string") {
      return new Response(JSON.stringify({ error: "invalid payload" }), {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }), {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // Look up brand context if provided
    let brandBlock = "";
    if (deviceId && brandUrl && typeof brandUrl === "string") {
      const normalizedUrl = brandUrl
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .replace(/\/+$/, '')
        .toLowerCase()
        .split('/')[0];
      const brand = await ctx.runQuery(internal.brand.getBrandContext, {
        deviceId,
        url: normalizedUrl,
      });
      if (brand) {
        const painPoints = (() => {
          try { return (JSON.parse(brand.painPoints) as string[]).join(", "); }
          catch { return brand.painPoints; }
        })();
        brandBlock = `

OPTIONAL BRAND EMBED:
The user has a product. Embed it ONLY if the post author clearly fits this profile.

Product: ${brand.what}
ICP: ${brand.icp}
Pain points: ${painPoints}
How to mention it: ${brand.replyHint}

Rules:
- If the post clearly matches the ICP and one of their pain points, mention the product in one natural phrase (max 5 words).
- Do not pitch. Do not be promotional. Sound like someone who happens to know a tool.
- If the post does not match, reply completely normally and do not mention the product at all.`;
      }
    }

    const systemPrompt = `You write replies to social media posts. Your goal is to spark genuine engagement — not to agree, not to fight, but to make people think or respond.

Style rules:
- Use minimal punctuation. No periods at the end. Commas only when truly needed. No exclamation marks.
- Never write in perfect structured sentences. Let it feel slightly off, like a real person typing fast.
- No polished phrasing, no transitions like "however" or "that said", no em dashes.
- Lowercase is fine. Contractions are good. Subtle typos are okay.

Tone rules:
- Be friendly but mildly contrarian — push back on the premise, offer a different angle, or ask a question that challenges the assumption.
- Do not validate or simply agree. Do not lecture. Do not moralize.
- Never sound like an ad, a bot, or someone trying too hard.
- The reply should feel like it came from someone who actually read the post and had a quick genuine reaction.

Banned words and phrases — never use these under any circumstances:
lol, lmao, lmfao, omg, fr, frfr, ngl, tbh, tho, bruh, bro, fam, no cap, facts, slay, lowkey, highkey, bussin, goated, mid, based, cope, valid, periodt, deadass, bet, sheesh, sus, vibe, vibes, hits different, real talk, on god, sending me, i'm dead, istg, imo, idk, smh, rn, irl, af, asf, literally (used as filler), like (used as filler).

Hard limits:
- 20–28 words. Not more.
- Return only the reply. No quotes, no labels, no explanation.${brandBlock}`;

    const userMessage = `Post: "${tweetText.trim()}"\n\nGenerate a reply:`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      let res: Response;
      try {
        res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://agentk.io",
            "X-Title": "AgentK",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user",   content: userMessage  },
            ],
            max_tokens: 80,
            temperature: 0.75,
          }),
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!res.ok) {
        const errText = await res.text();
        console.error("[agentK] OpenRouter error:", errText);
        throw new Error(`OpenRouter responded ${res.status}: ${errText.slice(0, 120)}`);
      }

      const json = await res.json();
      const reply = (json.choices?.[0]?.message?.content ?? "").trim();
      if (!reply) throw new Error("Empty response from model");

      return new Response(JSON.stringify({ reply }), {
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    } catch (err: any) {
      console.error("[agentK] generateReply error:", err.message);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
```

- [ ] **Step 2: Verify it compiles**

```bash
cd d:\agentk && npx convex dev --once 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add convex/http.ts
git commit -m "feat: inject brand context into generateReply when ICP matches"
```

---

## Task 5: Extension — persist brandUrl/brandState and add deviceId to state

**Files:**
- Modify: `chrome-extension/content.js`

- [ ] **Step 1: Add `deviceId` and `brandContext` to state object**

Find the `state` object near the top of `content.js` (around line 28). Add two fields:

```js
  const state = {
    keywords: ['AI SaaS', 'B2B'],
    excluded: ['Crypto'],
    xVerified: true,
    xRatio: false,
    subreddits: [],
    minUpvotes: 50,
    minComments: 10,
    brandUrl: '',
    brandState: 'idle', // idle | syncing | done | error
    deviceId: '',       // populated by initStorage
    brandContext: null, // populated after sync
  };
```

- [ ] **Step 2: Hydrate `deviceId`, `brandUrl`, and `brandState` in `initStorage`**

Find `initStorage()` (around line 45). Update the `chrome.storage.local.get` call to also read `brandUrl` and `brandState`, and populate `state.deviceId`:

```js
  function initStorage() {
    return new Promise(resolve => {
      chrome.storage.local.get(['deviceId', 'lastFetchAt', 'settings'], (stored) => {
        if (!stored.deviceId) {
          const newId = crypto.randomUUID();
          chrome.storage.local.set({ deviceId: newId });
          state.deviceId = newId;
        } else {
          state.deviceId = stored.deviceId;
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
          state.brandUrl    = stored.settings.brandUrl    ?? '';
          state.brandState  = stored.settings.brandState  ?? 'idle';
        }
        resolve();
      });
    });
  }
```

- [ ] **Step 3: Persist `brandUrl` and `brandState` in `syncStorage`**

Find `syncStorage()` (around line 66). Add the two brand fields:

```js
  function syncStorage() {
    chrome.storage.local.set({
      settings: {
        keywords:    state.keywords,
        excluded:    state.excluded,
        subreddits:  state.subreddits,
        minUpvotes:  state.minUpvotes,
        minComments: state.minComments,
        brandUrl:    state.brandUrl,
        brandState:  state.brandState,
      }
    });
  }
```

- [ ] **Step 4: Commit**

```bash
git add chrome-extension/content.js
git commit -m "feat: persist brandUrl/brandState and hydrate deviceId into state"
```

---

## Task 6: Extension — real brand sync logic + error UI state

**Files:**
- Modify: `chrome-extension/content.js`

- [ ] **Step 1: Add `extractPageText` helper**

Find the IIFE opening `(() => {` at line 1 of `content.js`. Add this helper function near the top, after the `state` object and before `initStorage`:

```js
  function extractPageText(html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);
  }
```

- [ ] **Step 2: Add `syncBrand` async function**

Add this function directly before `bindSettingsEvents`:

```js
  async function syncBrand(url) {
    const normalizedUrl = url
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/+$/, '')
      .toLowerCase()
      .split('/')[0];

    const origin = `https://${normalizedUrl}`;
    const paths = ['', '/about', '/pricing'];
    const labels = ['homepage', 'about', 'pricing'];

    async function fetchWithTimeout(u) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(u, { signal: ctrl.signal });
        const html = await res.text();
        return extractPageText(html);
      } catch {
        return '';
      } finally {
        clearTimeout(t);
      }
    }

    const results = await Promise.allSettled(
      paths.map(p => fetchWithTimeout(origin + p))
    );

    const pageTexts = {};
    results.forEach((r, i) => {
      pageTexts[labels[i]] = r.status === 'fulfilled' ? r.value : '';
    });

    const res = await fetch(`${CONVEX_SITE_URL}/syncBrand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: state.deviceId,
        url: normalizedUrl,
        pageTexts,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    return await res.json();
  }
```

- [ ] **Step 3: Replace fake sync stub in `bindSettingsEvents`**

Find this block in `bindSettingsEvents` (around line 1602):

```js
    /* Brand */
    const brandInput = shadow.getElementById('brand-url-input');
    const syncBtn = shadow.getElementById('brand-sync-btn');
    if (syncBtn) syncBtn.addEventListener('click', () => {
      state.brandUrl = brandInput.value.trim();
      state.brandState = 'loading';
      rerenderUI();
      setTimeout(() => { state.brandState = 'done'; rerenderUI(); }, 2200);
    });
    shadow.querySelectorAll('[data-action="brand-reset"]').forEach(btn => {
      btn.addEventListener('click', () => { state.brandState = 'idle'; state.brandUrl = ''; rerenderUI(); });
    });
```

Replace it with:

```js
    /* Brand */
    const brandInput = shadow.getElementById('brand-url-input');
    const syncBtn = shadow.getElementById('brand-sync-btn');
    if (syncBtn) syncBtn.addEventListener('click', async () => {
      const url = brandInput.value.trim();
      if (!url) return;
      state.brandUrl = url;
      state.brandState = 'syncing';
      rerenderUI();
      syncStorage();
      try {
        const context = await syncBrand(url);
        state.brandContext = context;
        state.brandState = 'done';
      } catch (err) {
        console.error('[agentK] syncBrand failed:', err.message);
        state.brandState = 'error';
      }
      rerenderUI();
      syncStorage();
    });
    shadow.querySelectorAll('[data-action="brand-reset"]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.brandState = 'idle';
        state.brandUrl = '';
        state.brandContext = null;
        rerenderUI();
        syncStorage();
      });
    });
```

- [ ] **Step 4: Update Settings UI — add error state and fix messages**

Find the `brandSectionContent` template string (around line 986). The button section currently handles `loading` state — update it to handle `syncing` and `error`:

Find:
```js
        ${state.brandState === 'done' ? `
          <div class="brand-synced-btn">
            <svg viewBox="0 0 14 14" width="10" height="10" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="2,7 5.5,11 12,3"/>
            </svg>
            Synced
          </div>
        ` : `
          <button class="brand-sync-btn" id="brand-sync-btn" ${state.brandState === 'loading' ? 'disabled' : ''}>
            ${state.brandState === 'loading' ? 'Syncing…' : 'Sync'}
          </button>
        `}
```

Replace with:
```js
        ${state.brandState === 'done' ? `
          <div class="brand-synced-btn">
            <svg viewBox="0 0 14 14" width="10" height="10" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="2,7 5.5,11 12,3"/>
            </svg>
            Synced
          </div>
        ` : `
          <button class="brand-sync-btn" id="brand-sync-btn" ${state.brandState === 'syncing' ? 'disabled' : ''}>
            ${state.brandState === 'syncing' ? 'Analyzing… ↻' : state.brandState === 'error' ? 'Retry' : 'Sync'}
          </button>
        `}
```

Also update the readonly condition on the input — find:
```js
            ${state.brandState === 'done' ? 'readonly' : ''}
```
Replace with:
```js
            ${(state.brandState === 'done' || state.brandState === 'syncing') ? 'readonly' : ''}
```

- [ ] **Step 5: Update field hint text**

Find (around line 1100):
```js
        <p class="field-hint">${state.brandState === 'done' ? `agentK has a PhD in your product and is ready to embarrass your competitors.` : `Let agentK read your product domain.`}</p>
```

Replace with:
```js
        <p class="field-hint">${
          state.brandState === 'done'  ? `agentK has a PhD in your product and is ready to cook.` :
          state.brandState === 'error' ? `Could not reach your domain. Check the URL and try again.` :
          `Let agentK read your product domain.`
        }</p>
```

- [ ] **Step 6: Commit**

```bash
git add chrome-extension/content.js
git commit -m "feat: real brand sync logic with error state and updated UI messages"
```

---

## Task 7: Extension — pass `deviceId` and `brandUrl` in generateReply calls

**Files:**
- Modify: `chrome-extension/content.js`

- [ ] **Step 1: Update X reply `generateReply` function**

Find the X assistant's `generateReply` function (inside `mountXReplyAssistant`, around line 2126):

```js
    async function generateReply(tweetText) {
      showLoading();
      try {
        const res = await fetch(`${CONVEX_SITE_URL}/generateReply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tweetText }),
        });
```

Replace `body: JSON.stringify({ tweetText }),` with:

```js
          body: JSON.stringify({
            tweetText,
            deviceId: state.deviceId || undefined,
            brandUrl: state.brandUrl || undefined,
          }),
```

- [ ] **Step 2: Update Reddit reply `generateReply` function**

Find the Reddit assistant's `generateReply` function (inside `mountRedditReplyAssistant`, around line 2363):

```js
    async function generateReply(commentText) {
      showLoading();
      try {
        const res = await fetch(`${CONVEX_SITE_URL}/generateReply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tweetText: commentText }),
        });
```

Replace `body: JSON.stringify({ tweetText: commentText }),` with:

```js
          body: JSON.stringify({
            tweetText: commentText,
            deviceId: state.deviceId || undefined,
            brandUrl: state.brandUrl || undefined,
          }),
```

- [ ] **Step 3: Commit**

```bash
git add chrome-extension/content.js
git commit -m "feat: pass deviceId and brandUrl in generateReply for brand context injection"
```

---

## Task 8: Manual smoke test

No automated tests exist in this repo — verify manually.

- [ ] **Step 1: Deploy Convex**

```bash
cd d:\agentk && npx convex dev
```

Leave running. Confirm no errors in the console.

- [ ] **Step 2: Test /syncBrand endpoint**

Open browser DevTools console on any page with the extension loaded. Run:

```js
fetch('https://savory-lynx-906.convex.site/syncBrand', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    deviceId: 'test-device-123',
    url: 'agentk.io',
    pageTexts: {
      homepage: 'AgentK helps founders find buying intent on Reddit and X. Monitors keywords. Generates replies.',
      about: 'Built for indie hackers and SaaS founders who want organic growth without paid ads.',
      pricing: 'Free during early access. Paid tiers planned.'
    }
  })
}).then(r => r.json()).then(console.log);
```

Expected: JSON with `what`, `who`, `icp`, `painPoints`, `features`, `pricing`, `replyHint`, `cached: false`.

Run it again — expected: same JSON with `cached: true`.

- [ ] **Step 3: Reload extension and test brand sync UI**

1. Open the extension → Settings tab → Brand Context section
2. Enter `agentk.io` → click Sync
3. Expected: button shows "Analyzing… ↻" (disabled), input becomes readonly
4. After ~10s: shows "Synced ✓" and message "agentK has a PhD in your product and is ready to cook."
5. Close and reopen extension — expected: still shows "Synced ✓" (state persisted)
6. Click pencil icon → expected: resets to idle, input clears

- [ ] **Step 4: Test error state**

Enter a nonexistent domain (e.g. `thisisnotarealdomain12345.xyz`) → click Sync.
Expected: button shows "Retry" and message "Could not reach your domain. Check the URL and try again."

- [ ] **Step 5: Test brand embed in reply**

With `agentk.io` synced, go to X or Reddit and find a post from someone describing a problem that matches AgentK's ICP (e.g. "struggling to get users for my SaaS"). Click the AgentK icon. Expected: reply subtly mentions AgentK or a related concept naturally. Try a clearly unrelated post (e.g. recipe discussion) — expected: reply makes no mention of the product.

- [ ] **Step 6: Final commit if any fixups were needed**

```bash
git add -A
git commit -m "fix: brand context smoke test fixups"
```
