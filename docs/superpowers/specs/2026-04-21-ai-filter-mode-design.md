# AI Filter Mode Design

## Overview

An experimental AI-powered filtering mode for the Reddit feed that uses Gemini (via OpenRouter) to match posts by semantic intent rather than keyword matching. Strictly isolated from production via an environment variable gate.

---

## Isolation

- Rendered only when `NEXT_PUBLIC_AI_MODE=true` is set in the environment
- Set in `.env.local` for local dev only — never set in Vercel production
- Mode toggle and all AI UI are invisible in production builds

---

## UI

### Mode Toggle

- Two icon buttons centered at the top of the feed: **Normal** | **AI**
- Renders only when `NEXT_PUBLIC_AI_MODE === "true"`
- Default mode is Normal; toggling to AI switches the right toolbar and feed view

### AI Mode Toolbar (replaces normal right toolbar)

Vertical column on the right side of the feed, same structural position as the current 3-button toolbar. Contains two controls:

**Intent control**
- Up to 3 intent query inputs, each max 60 characters
- Add/remove intent fields inline (no modal)
- Saved to Convex on blur

**Subreddit control**
- Reuses the exact existing `SubredditInput` component from normal mode
- Same autocomplete dropdown behavior
- Saved to Convex on change

### Reload Button

- Small icon button in the top-right corner of the feed
- Triggers the `runAiFilter` Convex action manually
- Shows a loading spinner while the action runs

---

## Data Model

### New table: `aiModeSettings`

```ts
aiModeSettings: defineTable({
  userId:     v.id("users"),
  intents:    v.array(v.string()),   // up to 3, max 60 chars each
  subreddits: v.array(v.string()),
}).index("by_user", ["userId"])
```

- One document per user (upsert on save)
- No TTL — persists until user clears
- No changes to existing `userSettings`, `redditResults`, or any other production table

---

## Backend

### Convex action: `runAiFilter`

Located in a new file: `convex/aiFilter.ts`

**Flow:**
1. Read caller's `aiModeSettings` (intents + subreddits)
2. Query `redditResults` for this user — posts within last 6 hours, matching selected subreddits
3. Extract post titles (+ postIds)
4. Build a single Gemini prompt: intents as the user's goals, titles as candidates
5. POST to OpenRouter (`google/gemini-2.5-flash-lite`) with the prompt
6. Parse Gemini's response: a JSON array of matched postIds
7. Return matched postIds to the client

**Prompt design (Feynman-style):**
```
You are a relevance filter. The user wants to find posts matching these intents:
<intents>

Below are Reddit post titles with their IDs. Return a JSON array of IDs for posts 
that genuinely match the user's intent — reduce each post to its core meaning, 
do not rely on keyword overlap alone.

<titles as "ID: title" lines>

Return ONLY a JSON array of matching IDs, no explanation.
```

**Batching:**
- Max 200 titles per Gemini call (fits within token limits and Convex action 10s timeout)
- If user has more than 200 candidate posts, take the 200 most recent

**Error handling:**
- If OpenRouter returns non-200: return empty array, log warning
- If Gemini response cannot be parsed as JSON: return empty array, log warning
- Client shows "AI filter unavailable" toast on empty array with error flag

### Environment variable

`OPENROUTER_API_KEY` must be set in Convex environment:
```bash
npx convex env set OPENROUTER_API_KEY <key-from-.env.local>
```

---

## Feed Rendering in AI Mode

- Client holds `aiResults: string[] | null` in local state (postIds returned by action)
- When `aiResults` is populated: feed renders only those posts, in recency order
- When `aiResults` is null (action not yet run): feed shows empty state "Run the filter to see AI-matched posts"
- Normal mode feed (`getResults` query) is completely unaffected

---

## File Map

| File | Change |
|------|--------|
| `convex/aiFilter.ts` | New — `runAiFilter` action, `getAiSettings` query, `setAiSettings` mutation |
| `convex/schema.ts` | Add `aiModeSettings` table definition |
| `components/dashboard/RedditFeed.tsx` | Add mode toggle, AI toolbar, reload button, AI results rendering |

No changes to: `convex/reddit.ts`, `convex/crons.ts`, `proxy/server.js`, any production query/mutation.

---

## Out of Scope

- Automatic triggering on intent change (manual reload only)
- AI mode on mobile (desktop dashboard only)
- Persisting AI filter results to DB
- Any production exposure
