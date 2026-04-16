# Brand Context — Design Spec
**Date:** 2026-04-07
**Status:** Approved

---

## Overview

When a user enters their product domain and clicks Sync, AgentK fetches key pages, runs a Feynman-style LLM breakdown, and stores a structured brand context in Convex. Subsequent reply generation checks whether the post author matches the ICP — if yes, the reply subtly embeds the brand; if no, it replies normally.

---

## Architecture

**Flow: Sync**
1. User enters domain URL in Settings → clicks Sync
2. Extension (content.js) fetches homepage, `/about`, `/pricing` — strips HTML to plain text
3. Extension POSTs `{ deviceId, url, pageTexts }` to Convex `/syncBrand`
4. Convex checks `brandContexts.by_device_url` — cache hit returns existing context instantly
5. Cache miss: Convex calls LLM (gemini-2.5-flash-lite via OpenRouter) with extraction prompt
6. LLM returns structured JSON → stored in `brandContexts` table
7. Extension receives context → sets `brandState: 'done'` → shows completion message

**Flow: Reply Generation**
1. User clicks AgentK icon on X or Reddit
2. Extension includes `{ tweetText, deviceId, brandUrl }` in `/generateReply` request
3. Convex looks up brand context by `[deviceId, brandUrl]`
4. If found: system prompt is augmented with ICP + brand embed instructions
5. Single LLM call handles both ICP matching and reply generation
6. If not found: normal reply, no change to existing behaviour

---

## Data Model

New table in `convex/schema.ts`:

```ts
brandContexts: defineTable({
  deviceId:   v.string(),
  url:        v.string(),   // normalized domain e.g. "acmecorp.com"
  what:       v.string(),   // what the product does (one sentence)
  who:        v.string(),   // who it serves
  icp:        v.string(),   // ideal customer profile description
  painPoints: v.string(),   // JSON-stringified string[]
  features:   v.string(),   // features summary
  pricing:    v.string(),   // pricing info or "Not found"
  replyHint:  v.string(),   // how to mention naturally in a reply
  createdAt:  v.number(),
}).index("by_device_url", ["deviceId", "url"])
```

Cache key: `[deviceId, normalizedUrl]`. Re-sync deletes the existing record and creates a fresh one.

---

## Convex Backend Changes

### New: `POST /syncBrand`

**Request:** `{ deviceId: string, url: string, pageTexts: { homepage?: string, about?: string, pricing?: string } }`

**Logic:**
1. Normalize URL (strip `https://`, `www.`, trailing slashes, lowercase)
2. Query `brandContexts.by_device_url` — if found, return `{ ...context, cached: true }`
3. Combine page texts into a single prompt (cap at 12,000 chars total)
4. Call LLM with Feynman extraction prompt (see below)
5. Parse JSON response — if invalid, retry once, then return 502
6. Insert into `brandContexts`, return `{ ...context, cached: false }`

**Extraction prompt:**
```
You are analyzing website content for a product using the Feynman Technique.
Return ONLY valid JSON, no other text:

{
  "what": "One clear sentence: what does this product do",
  "who": "Who are the primary users (specific, not generic)",
  "icp": "The ideal customer: specific role, situation, and goals",
  "painPoints": ["specific pain 1", "specific pain 2", "specific pain 3"],
  "features": "Key features in 2-3 sentences",
  "pricing": "Pricing summary, or Not found",
  "replyHint": "One sentence: how to mention this product naturally without sounding promotional"
}

HOMEPAGE:
{homepage}

ABOUT:
{about}

PRICING:
{pricing}
```

**Error:** If all page texts are empty, return `400 { error: "no page content" }`.

---

### Modified: `POST /generateReply`

**Request:** `{ tweetText: string, deviceId?: string, brandUrl?: string }`

**Logic:**
1. If `deviceId` and `brandUrl` provided: query `brandContexts.by_device_url`
2. If brand context found: append brand block to system prompt (see below)
3. Generate reply as normal — single LLM call, ICP detection is handled by the model

**Brand block appended to system prompt:**
```
OPTIONAL BRAND EMBED:
The user has a product. Embed it ONLY if the post author clearly fits this profile.

Product: {what}
ICP: {icp}
Pain points: {painPoints}
How to mention it: {replyHint}

Rules:
- If the post clearly matches the ICP and one of their pain points, mention the product in one natural phrase (max 5 words).
- Do not pitch. Do not be promotional. Sound like someone who happens to know a tool.
- If the post does not match, reply completely normally and do not mention the product at all.
```

---

## Extension Changes (content.js)

### Brand Sync Handler

Replace the current fake `setTimeout` stub in `bindSettingsEvents`:

```
syncBtn.click →
  1. Read brandInput.value, normalize URL
  2. Set brandState: 'syncing', rerenderUI()
  3. Fetch homepage, /about, /pricing with 8s timeout each (Promise.allSettled)
  4. Strip HTML: remove all tags, collapse whitespace, cap each page at 4,000 chars
  5. POST to /syncBrand with { deviceId, url, pageTexts }
  6. On success: store { brandUrl, brandContext } in chrome.storage.local
               set state.brandState = 'done', rerenderUI()
  7. On error: set state.brandState = 'error', rerenderUI()
```

### State Changes

Add `brandState: 'error'` alongside existing `idle | loading | done`.

Add `brandContext: null | object` to in-memory state (populated after sync, restored from chrome.storage on init).

### Settings UI States

| State | Input | Button | Message |
|-------|-------|--------|---------|
| `idle` | editable | "Sync" | "Let agentK read your product domain." |
| `syncing` | readonly | "Analyzing… ⟳" (disabled) | — |
| `done` | readonly + pencil | "Synced ✓" | "agentK has a PhD in your product and is ready to cook." |
| `error` | editable | "Retry" | "Could not reach your domain. Check the URL and try again." |

### generateReply Calls (X + Reddit)

Both `mountXReplyAssistant` and `mountRedditReplyAssistant` pass brand context when available:

```js
body: JSON.stringify({
  tweetText: commentText,
  deviceId: stored.deviceId,          // always present
  brandUrl: state.brandUrl || undefined, // only if synced
})
```

---

## HTML Extraction (in-extension)

Simple regex-based stripping (no DOM parser needed in a content script context):

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

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| All page fetches fail (timeout / 403) | Return 400 "no page content" → extension shows error state |
| Some pages fail, some succeed | Continue with available text |
| LLM returns invalid JSON | Retry once; if still invalid, return 502 |
| LLM timeout (30s) | Return 502, extension shows error state |
| Brand context not found at reply time | Generate normal reply silently |
| Re-sync same URL | Delete existing record, fetch and analyze fresh |

---

## Files Changed

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `brandContexts` table |
| `convex/http.ts` | Add `POST /syncBrand` + `OPTIONS /syncBrand`; modify `POST /generateReply` |
| `convex/brand.ts` | New internal mutation `upsertBrandContext` + query `getBrandContext` |
| `chrome-extension/content.js` | Replace sync stub; update generateReply calls; add error state UI |

---

## Out of Scope

- Multi-URL support (one brand per user)
- Manual editing of extracted brand context
- Brand context expiry / scheduled re-analysis
- Sharing brand context across devices
