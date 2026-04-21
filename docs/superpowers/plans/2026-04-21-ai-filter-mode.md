# AI Filter Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an experimental AI-powered feed filtering mode that uses Gemini (via OpenRouter) to match Reddit posts by semantic intent, isolated from production behind a `NEXT_PUBLIC_AI_MODE` env var.

**Architecture:** A new `convex/aiFilter.ts` file exposes a public query/mutation for settings and a public action `runAiFilter` that reads the user's candidate posts from `redditResults`, builds a Feynman-style prompt, calls OpenRouter, and returns matched postIds. The client holds results in local state and derives a `displayPosts` array to feed the existing canvas renderer.

**Tech Stack:** Convex (query / mutation / action), OpenRouter API (`google/gemini-2.5-flash-lite`), React `useMemo`, `useAction`, Next.js `NEXT_PUBLIC_AI_MODE` env var.

---

## File Map

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `aiModeSettings` table |
| `convex/aiFilter.ts` | Create — settings query/mutation + `runAiFilter` action |
| `components/dashboard/RedditFeed.tsx` | Add mode toggle, AI toolbar, reload button, AI feed rendering |

---

### Task 1: Schema — add aiModeSettings table

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add the table to schema.ts**

Open `convex/schema.ts`. After the `karmaCache` table (the last table before the closing `});`), add:

```ts
  aiModeSettings: defineTable({
    userId:     v.id("users"),
    intents:    v.array(v.string()),
    subreddits: v.array(v.string()),
  }).index("by_user", ["userId"]),
```

The file should end like:

```ts
  karmaCache: defineTable({
    author:    v.string(),
    karma:     v.number(),
    fetchedAt: v.number(),
  }).index("by_author", ["author"]),

  aiModeSettings: defineTable({
    userId:     v.id("users"),
    intents:    v.array(v.string()),
    subreddits: v.array(v.string()),
  }).index("by_user", ["userId"]),

});
```

- [ ] **Step 2: Verify schema deploys cleanly**

```bash
npx convex dev --once
```

Expected: no TypeScript errors, `aiModeSettings` appears in the Convex dashboard under Tables.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add aiModeSettings table to schema"
```

---

### Task 2: Convex backend — convex/aiFilter.ts

**Files:**
- Create: `convex/aiFilter.ts`

- [ ] **Step 1: Create the file**

Create `convex/aiFilter.ts` with this exact content:

```ts
import { action, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

const SIX_HOURS_SEC = 6 * 3600;

// Used by runAiFilter action — reads settings by userId
export const getAiSettingsInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) =>
    ctx.db
      .query("aiModeSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first(),
});

// Used by runAiFilter action — fetches candidate posts for the user
export const getRecentPostsForUser = internalQuery({
  args: { userId: v.id("users"), subreddits: v.array(v.string()) },
  handler: async (ctx, { userId, subreddits }) => {
    const cutoffSec = (Date.now() / 1000) - SIX_HOURS_SEC;
    const allowedSubs =
      subreddits.length > 0
        ? new Set(subreddits.map((s) => s.toLowerCase()))
        : null;
    const posts = await ctx.db
      .query("redditResults")
      .withIndex("by_user_created", (q) =>
        q.eq("userId", userId).gte("createdUtc", cutoffSec)
      )
      .collect();
    return allowedSubs
      ? posts.filter((p) => allowedSubs.has(p.subreddit.toLowerCase()))
      : posts;
  },
});

// Client reads AI settings
export const getAiSettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return ctx.db
      .query("aiModeSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

// Client saves AI settings
export const setAiSettings = mutation({
  args: {
    intents:    v.array(v.string()),
    subreddits: v.array(v.string()),
  },
  handler: async (ctx, { intents, subreddits }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const existing = await ctx.db
      .query("aiModeSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { intents, subreddits });
    } else {
      await ctx.db.insert("aiModeSettings", { userId, intents, subreddits });
    }
  },
});

// Client triggers AI filtering — returns matched postIds
export const runAiFilter = action({
  args: {},
  handler: async (ctx): Promise<{ postIds: string[]; error: boolean }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { postIds: [], error: true };

    const settings = await ctx.runQuery(
      internal.aiFilter.getAiSettingsInternal,
      { userId }
    );
    if (!settings || settings.intents.filter(Boolean).length === 0) {
      return { postIds: [], error: false };
    }

    const posts = await ctx.runQuery(
      internal.aiFilter.getRecentPostsForUser,
      { userId, subreddits: settings.subreddits }
    );
    if (posts.length === 0) return { postIds: [], error: false };

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.warn("[runAiFilter] OPENROUTER_API_KEY not set");
      return { postIds: [], error: true };
    }

    const intentsList = settings.intents
      .filter(Boolean)
      .map((i, n) => `${n + 1}. ${i}`)
      .join("\n");

    const candidates = posts.slice(0, 200);
    const titleLines = candidates
      .map((p) => `${p.postId}: ${p.title ?? p.body.slice(0, 80)}`)
      .join("\n");

    const prompt =
      `You are a relevance filter. The user wants to find posts matching these intents:\n${intentsList}\n\n` +
      `Below are Reddit post titles with their IDs. Return a JSON array of IDs for posts that genuinely ` +
      `match the user's intent — reduce each post to its core meaning, do not rely on keyword overlap alone.\n\n` +
      `${titleLines}\n\nReturn ONLY a JSON array of matching IDs, no explanation.`;

    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        console.warn(`[runAiFilter] OpenRouter HTTP ${res.status}`);
        return { postIds: [], error: true };
      }

      const json = await res.json();
      const text: string = json?.choices?.[0]?.message?.content ?? "";
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) {
        console.warn("[runAiFilter] Cannot parse response:", text.slice(0, 200));
        return { postIds: [], error: true };
      }

      const postIds: string[] = JSON.parse(match[0]);
      return { postIds, error: false };
    } catch (e) {
      console.warn("[runAiFilter] error:", e);
      return { postIds: [], error: true };
    }
  },
});
```

- [ ] **Step 2: Verify it compiles**

```bash
npx convex dev --once
```

Expected: no TypeScript errors, `aiFilter` functions visible in Convex dashboard.

- [ ] **Step 3: Add OPENROUTER_API_KEY to Convex env**

Read the key from your `.env.local` file, then:

```bash
npx convex env set OPENROUTER_API_KEY <your-key>
```

Expected: "Successfully set environment variable OPENROUTER_API_KEY"

- [ ] **Step 4: Commit**

```bash
git add convex/aiFilter.ts
git commit -m "feat: add aiFilter Convex backend (settings + runAiFilter action)"
```

---

### Task 3: UI — mode toggle + AI state in RedditFeed.tsx

**Files:**
- Modify: `components/dashboard/RedditFeed.tsx`

- [ ] **Step 1: Add useMemo to React imports**

Find line 3:
```ts
import { useEffect, useRef, useState, useCallback } from "react";
```

Replace with:
```ts
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
```

- [ ] **Step 2: Add AI mode Convex imports**

Find line 6:
```ts
import { api } from "@/convex/_generated/api";
```

Replace with:
```ts
import { api } from "@/convex/_generated/api";

const AI_MODE_ENABLED = process.env.NEXT_PUBLIC_AI_MODE === "true";
```

- [ ] **Step 3: Add AI state variables after the existing state declarations**

Find this block (around line 600):
```ts
  const [activeModal, setActiveModal] = useState<ModalType>(null);
```

Add these declarations immediately BEFORE that line:
```ts
  // AI mode state
  const [feedMode, setFeedMode]       = useState<"normal" | "ai">("normal");
  const [aiIntents, setAiIntents]     = useState<string[]>(["", "", ""]);
  const [aiSubreddits, setAiSubreddits] = useState<string[]>([]);
  const [aiSubInput, setAiSubInput]   = useState("");
  const [aiResults, setAiResults]     = useState<string[] | null>(null);
  const [aiLoading, setAiLoading]     = useState(false);
  const [aiError, setAiError]         = useState(false);
  const aiSettings                    = useQuery(api.aiFilter.getAiSettings);
  const setAiSettingsMutation         = useMutation(api.aiFilter.setAiSettings);
  const runAiFilterAction             = useAction(api.aiFilter.runAiFilter);
```

- [ ] **Step 4: Load AI settings from Convex on mount**

Find the `saveSettings` function definition (around line 649):
```ts
  async function saveSettings(patch: {
```

Add this useEffect immediately BEFORE `saveSettings`:
```ts
  useEffect(() => {
    if (!aiSettings) return;
    const loaded = aiSettings.intents.length > 0
      ? [...aiSettings.intents, "", "", ""].slice(0, 3)
      : ["", "", ""];
    setAiIntents(loaded);
    setAiSubreddits(aiSettings.subreddits);
  }, [aiSettings]);

  async function saveAiSettings(intents: string[], subs: string[]) {
    await setAiSettingsMutation({ intents: intents.filter(Boolean), subreddits: subs });
  }
```

- [ ] **Step 5: Add displayPosts derived variable**

Find (around line 851):
```ts
  const hasKeywords    = keywords.length > 0;
  const hasSubreddits  = subreddits.length > 0;
```

Add immediately BEFORE those two lines:
```ts
  const displayPosts = useMemo(() => {
    if (feedMode === "ai" && aiResults !== null) {
      const ids = new Set(aiResults);
      return posts.filter((p) => ids.has(p.postId));
    }
    return posts;
  }, [feedMode, aiResults, posts]);
```

- [ ] **Step 6: Replace `posts` with `displayPosts` inside appendBatch**

`appendBatch` is the `useCallback` starting around line 675. Inside it, find two uses of `posts`:

First, find:
```ts
      const batch = posts.slice(offset.current, offset.current + BATCH);
```
Replace with:
```ts
      const batch = displayPosts.slice(offset.current, offset.current + BATCH);
```

Second, find:
```ts
      if (offset.current < posts.length) {
```
Replace with:
```ts
      if (offset.current < displayPosts.length) {
```

Third, find the dependency array at the end of the useCallback:
```ts
    [posts],
```
Replace with:
```ts
    [displayPosts],
```

- [ ] **Step 7: Replace `posts` with `displayPosts` in the re-render useEffect**

Find (around line 841):
```ts
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    renderGen.current++;
    offset.current = 0;
    inner.innerHTML = "";
    inner.style.height = "0";
    if (posts.length > 0) appendBatch(renderGen.current);
  }, [posts, appendBatch]);
```

Replace with:
```ts
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    renderGen.current++;
    offset.current = 0;
    inner.innerHTML = "";
    inner.style.height = "0";
    if (displayPosts.length > 0) appendBatch(renderGen.current);
  }, [displayPosts, appendBatch]);
```

- [ ] **Step 8: Replace `posts` with `displayPosts` in empty-state checks**

Find (around line 887):
```ts
        ) : loading && posts.length === 0 ? (
```
Replace with:
```ts
        ) : loading && displayPosts.length === 0 && feedMode === "normal" ? (
```

Find:
```ts
        ) : !loading && posts.length === 0 ? (
```
Replace with:
```ts
        ) : !loading && displayPosts.length === 0 && feedMode === "normal" ? (
```

- [ ] **Step 9: Add the mode toggle above the canvas**

Find (around line 864):
```ts
      {/* Canvas */}
      <div
        ref={canvasRef}
```

Add this block immediately BEFORE that comment:
```tsx
      {/* AI Mode Toggle — only when NEXT_PUBLIC_AI_MODE=true */}
      {AI_MODE_ENABLED && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "4px", padding: "6px 0 2px", flexShrink: 0 }}>
          <button
            onClick={() => { setFeedMode("normal"); setAiResults(null); setAiError(false); }}
            style={{
              padding: "3px 12px",
              borderRadius: "20px",
              border: "1px solid",
              borderColor: feedMode === "normal" ? "#DF849D" : "rgba(0,0,0,0.1)",
              background: feedMode === "normal" ? "#DF849D" : "transparent",
              color: feedMode === "normal" ? "#fff" : "#B2A28C",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Normal
          </button>
          <button
            onClick={() => setFeedMode("ai")}
            style={{
              padding: "3px 12px",
              borderRadius: "20px",
              border: "1px solid",
              borderColor: feedMode === "ai" ? "#DF849D" : "rgba(0,0,0,0.1)",
              background: feedMode === "ai" ? "#DF849D" : "transparent",
              color: feedMode === "ai" ? "#fff" : "#B2A28C",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            AI
          </button>
        </div>
      )}
```

- [ ] **Step 10: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors. If you see "Property 'aiFilter' does not exist on type", run `npx convex dev --once` first to regenerate `_generated/api.ts`.

- [ ] **Step 11: Commit**

```bash
git add components/dashboard/RedditFeed.tsx
git commit -m "feat: add AI mode toggle and displayPosts derivation to RedditFeed"
```

---

### Task 4: UI — AI toolbar in RedditFeed.tsx

**Files:**
- Modify: `components/dashboard/RedditFeed.tsx`

- [ ] **Step 1: Gate the existing normal toolbar behind feedMode**

Find the normal toolkit div that starts with:
```tsx
      {/* Feed Toolkit */}
      <div
        data-tour="toolbar"
        style={{
          position: "absolute",
          right: "12px",
          top: "50%",
```

Wrap its opening and closing tags in `{feedMode === "normal" && (` ... `)}`. The full wrapper:

```tsx
      {/* Feed Toolkit */}
      {feedMode === "normal" && (
      <div
        data-tour="toolbar"
        style={{
          position: "absolute",
          right: "12px",
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          zIndex: 20,
          background: "#fff",
          borderRadius: "12px",
          padding: "5px",
          border: "1px solid rgba(0,0,0,0.07)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ... existing 3 buttons unchanged ... */}
      </div>
      )}
```

(Only add the `{feedMode === "normal" && (` before the div and `)}` after the closing `</div>` — do not change anything inside.)

- [ ] **Step 2: Add the AI toolbar after the normal toolbar block**

Immediately after the `)}` that closes the normal toolkit conditional, add:

```tsx
      {/* AI Toolbar */}
      {feedMode === "ai" && (
        <div
          style={{
            position: "absolute",
            right: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            zIndex: 20,
            background: "#fff",
            borderRadius: "14px",
            padding: "12px 10px",
            border: "1px solid rgba(0,0,0,0.07)",
            width: "168px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Intent inputs */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "9px", fontWeight: 700, color: "#B2A28C", textTransform: "uppercase", letterSpacing: "0.5px" }}>Intent</span>
            {aiIntents.map((intent, idx) => (
              <div key={idx} style={{ position: "relative" }}>
                <input
                  value={intent}
                  maxLength={60}
                  placeholder={`Intent ${idx + 1}…`}
                  onChange={(e) => {
                    const next = [...aiIntents];
                    next[idx] = e.target.value;
                    setAiIntents(next);
                  }}
                  onBlur={() => saveAiSettings(aiIntents, aiSubreddits)}
                  style={{
                    width: "100%",
                    padding: "5px 8px",
                    borderRadius: "8px",
                    border: "1px solid rgba(0,0,0,0.1)",
                    fontSize: "11px",
                    color: "#191918",
                    background: "#FAFAF8",
                    outline: "none",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                  }}
                />
              </div>
            ))}
          </div>

          {/* Subreddit input */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "9px", fontWeight: 700, color: "#B2A28C", textTransform: "uppercase", letterSpacing: "0.5px" }}>Subreddits</span>
            <SubredditInput
              value={aiSubInput}
              onChange={setAiSubInput}
              onAdd={(sub) => {
                if (aiSubreddits.includes(sub)) return;
                const next = [...aiSubreddits, sub];
                setAiSubreddits(next);
                setAiSubInput("");
                saveAiSettings(aiIntents, next);
              }}
              disabled={aiSubreddits.length >= 5}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {aiSubreddits.map((s) => (
                <Pill
                  key={s}
                  label={s}
                  color="rgba(223,132,157,0.12)"
                  textColor="#DF849D"
                  onRemove={() => {
                    const next = aiSubreddits.filter((x) => x !== s);
                    setAiSubreddits(next);
                    saveAiSettings(aiIntents, next);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Start dev server and verify toolbar renders**

```bash
# In .env.local make sure NEXT_PUBLIC_AI_MODE=true is set
npm run dev
```

Open the dashboard. You should see Normal | AI toggle at the top. Clicking AI should replace the 3-button toolbar with the intent + subreddit toolbar.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/RedditFeed.tsx
git commit -m "feat: add AI mode toolbar with intent inputs and subreddit control"
```

---

### Task 5: UI — reload button + AI feed rendering in RedditFeed.tsx

**Files:**
- Modify: `components/dashboard/RedditFeed.tsx`

- [ ] **Step 1: Add reload button inside the canvas div**

Inside the canvas div, immediately after the overlay block (`{activeModal && (...)}`), add the reload button:

```tsx
      {/* AI reload button */}
      {feedMode === "ai" && (
        <button
          onClick={async () => {
            setAiLoading(true);
            setAiError(false);
            try {
              const result = await runAiFilterAction({});
              setAiResults(result.postIds);
              if (result.error) setAiError(true);
            } catch {
              setAiError(true);
            } finally {
              setAiLoading(false);
            }
          }}
          disabled={aiLoading}
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            zIndex: 25,
            width: "28px",
            height: "28px",
            borderRadius: "8px",
            border: "1px solid rgba(0,0,0,0.08)",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: aiLoading ? "not-allowed" : "pointer",
            color: aiError ? "#E04444" : "#DF849D",
          }}
          title="Run AI filter"
        >
          {aiLoading ? (
            <svg style={{ animation: "spin .6s linear infinite" }} viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          )}
        </button>
      )}
```

- [ ] **Step 2: Add AI mode empty states**

Find the existing empty state block that renders when `!loading && displayPosts.length === 0 && feedMode === "normal"`. After its closing `)` (before the `: (` that starts the scattered cards), add AI mode empty states:

```tsx
        ) : feedMode === "ai" && aiResults === null ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px" }}>
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#C4B9AA" strokeWidth="1.5">
              <circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/>
            </svg>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "#62584F" }}>AI mode active</p>
            <p style={{ fontSize: "12px", color: "#B2A28C", textAlign: "center", maxWidth: "220px" }}>
              Set your intents and press the reload button to find matching posts.
            </p>
          </div>
        ) : feedMode === "ai" && !aiLoading && displayPosts.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px" }}>
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#C4B9AA" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "#62584F" }}>No matches found</p>
            <p style={{ fontSize: "12px", color: "#B2A28C", textAlign: "center", maxWidth: "220px" }}>
              {aiError ? "AI filter unavailable. Check your API key." : "Try different intents or broaden your subreddits."}
            </p>
          </div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: End-to-end test**

Make sure `.env.local` has `NEXT_PUBLIC_AI_MODE=true` and `OPENROUTER_API_KEY` is set in Convex (`npx convex env list` to confirm). Then:

```bash
npm run dev
```

1. Open dashboard, verify Normal/AI toggle is visible
2. Click AI — toolbar switches to intent + subreddit inputs
3. Type an intent (e.g. "people looking for SaaS tools") and blur — no error
4. Click the reload button — spinner appears, then disappears
5. If posts match: feed shows only matched posts
6. If no posts match: "No matches found" empty state
7. Switch back to Normal — original feed returns, no regression

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/RedditFeed.tsx
git commit -m "feat: add AI reload button and AI feed rendering to RedditFeed"
```

---

## Post-implementation checklist

- [ ] `NEXT_PUBLIC_AI_MODE` is NOT set in Vercel environment variables (confirm in Vercel dashboard)
- [ ] `OPENROUTER_API_KEY` IS set in Convex environment (`npx convex env list`)
- [ ] Normal mode feed is unaffected when `NEXT_PUBLIC_AI_MODE` is not set
