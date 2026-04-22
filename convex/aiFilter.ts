import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

const MAX_MATCHED_IDS = 500;

const SIX_HOURS_SEC = 6 * 3600;

export const getAiSettingsInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) =>
    ctx.db
      .query("aiModeSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first(),
});

export const getRecentPostsForUser = internalQuery({
  args: { userId: v.id("users"), subreddits: v.array(v.string()) },
  handler: async (ctx, { userId, subreddits }) => {
    // AI mode is strictly scoped to user's AI subreddits. Empty list → no candidates.
    if (subreddits.length === 0) return [];
    const cutoffSec = (Date.now() / 1000) - SIX_HOURS_SEC;
    const allowedSubs = new Set(subreddits.map((s) => s.toLowerCase()));
    // Read from the isolated AI table only — no leakage from normal-flow posts.
    const posts = await ctx.db
      .query("redditResultsAi")
      .withIndex("by_user_created", (q) =>
        q.eq("userId", userId).gte("createdUtc", cutoffSec)
      )
      .collect();
    return posts.filter((p) => allowedSubs.has(p.subreddit.toLowerCase()));
  },
});

// Client query: every AI-candidate post for this user in the last 6h.
// No subreddit filter — the client intersects with aiSettings.matchedPostIds
// so results stay stable even when the user edits subreddits mid-cycle.
// The isolated redditResultsAi table already guarantees no normal-flow leakage.
export const getAiCandidatePosts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const cutoffSec = (Date.now() / 1000) - SIX_HOURS_SEC;
    return await ctx.db
      .query("redditResultsAi")
      .withIndex("by_user_created", (q) =>
        q.eq("userId", userId).gte("createdUtc", cutoffSec)
      )
      .collect();
  },
});

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
    // Preserve existing matches on settings change — they stay visible until
    // the next globalFetch cycle produces the new batch. No manual trigger.
    if (existing) {
      await ctx.db.patch(existing._id, { intents, subreddits });
    } else {
      await ctx.db.insert("aiModeSettings", { userId, intents, subreddits, matchedPostIds: [] });
    }
  },
});

// Merge new matches with existing, dedupe, cap.
export const appendMatchedPostIds = internalMutation({
  args: { userId: v.id("users"), postIds: v.array(v.string()) },
  handler: async (ctx, { userId, postIds }) => {
    const existing = await ctx.db
      .query("aiModeSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!existing) return;
    const merged = [...new Set([...(existing.matchedPostIds ?? []), ...postIds])];
    const capped = merged.slice(-MAX_MATCHED_IDS);
    await ctx.db.patch(existing._id, { matchedPostIds: capped });
  },
});

// All users with non-empty intents AND non-empty subreddits
export const getAllActiveAiSettings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("aiModeSettings").collect();
    return all.filter((s) => s.intents.filter(Boolean).length > 0 && s.subreddits.length > 0);
  },
});

// Shared helper: given candidate posts + intents, ask Gemini which match.
// Returns matched postIds.
export async function matchPostsToIntents(
  posts: { postId: string; title?: string; body: string }[],
  intents: string[],
  apiKey: string,
  logTag: string = "matchPostsToIntents",
): Promise<{ postIds: string[]; error: boolean }> {
  const cleanIntents = intents.filter(Boolean);
  if (cleanIntents.length === 0 || posts.length === 0) {
    return { postIds: [], error: false };
  }

  const intentsList = cleanIntents
    .map((intent, n) => `${n + 1}. ${intent}`)
    .join("\n");

  const candidates = posts.slice(0, 200);
  const titleLines = candidates
    .map((p) => `${p.postId}\t${p.title ?? p.body.slice(0, 80)}`)
    .join("\n");

  const prompt =
`You are an elite semantic relevance classifier for Reddit post titles. Your job: return ONLY the titles that genuinely satisfy at least one user intent. Precision matters far more than recall.

USER INTENTS:
${intentsList}

================================================================
HOW TO DECIDE, PER TITLE
For each title, silently answer these four questions. Include the postId ONLY if the answer to all four is YES.

Q1. TOPIC — Is the title's core subject the same subject as one of the intents? (not merely adjacent, not merely in the same field/community.)
Q2. SHAPE — Does the title's speech-act match what the intent is looking for?
    - If the intent describes someone SHARING / TELLING / RECOUNTING an experience or result → the title must itself be that sharing (a retrospective, a "here's what worked / happened / I learned" post). A question asking others for the same information is a REVERSED shape — EXCLUDE.
    - If the intent describes someone SEEKING / ASKING / LOOKING FOR something → the title must be a request. A post announcing / offering / selling is REVERSED — EXCLUDE.
    - If the intent describes someone HAVING A PROBLEM → the title must describe that problem from the author's POV, not a tutorial or a solution write-up.
Q3. DIRECTION — Is the stance aligned? (intent "people who love X" excludes "people who hate X"; intent "devs struggling with Y" excludes "devs who solved Y".)
Q4. SPECIFICITY — Can you point to concrete words in the title that prove the match, without inventing context or assuming what the body says?

If any answer is NO, UNSURE, or "maybe" → EXCLUDE.

================================================================
HARD EXCLUSIONS (always exclude, regardless of topic match)
- Promotional / affiliate / "launch your X into our network" spam.
- Cofounder search, hiring, "looking for teammate" posts (unless the intent is literally that).
- Generic frameworks, listicles, or "here's how to do X in N steps" posts that don't recount the author's own experience.
- Feedback requests ("thoughts?", "is this useful?", "feedback?") unless the intent is explicitly about asking for feedback.
- Rants, memes, jokes, shower-thoughts, philosophical musings.
- Posts that merely mention the intent topic in passing while the real subject is something else.

================================================================
WORKED EXAMPLE — so you calibrate correctly
Intent: "dev talking about what worked for them to get users"
- ✅ "Solo dev, 6 months in, here's what actually worked for finding users" — sharing shape, aligned direction.
- ✅ "0$ marketing, 8.9% conv rate, 3100 users after 2 months" — retrospective of what worked.
- ❌ "What's the cheapest way you got users for your SaaS?" — REVERSED SHAPE (asking, not telling).
- ❌ "The hardest thing about microsaas isn't building it, it's finding traction" — commentary, not a first-person account of what worked.
- ❌ "Built a tool that gets keywords google search volume" — product launch; wrong topic.
- ❌ "Validating micro-SaaS: ADHD reminder app - thoughts?" — feedback request, not a win retrospective.

================================================================
INPUT (one per line, TAB-separated "<postId>\\t<title>"):
${titleLines}

================================================================
OUTPUT
Return ONLY a JSON array of matching postIds as strings. No prose, no keys, no markdown, no explanation. Return [] if nothing matches.`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      console.warn(`[${logTag}] OpenRouter HTTP ${res.status}`);
      return { postIds: [], error: true };
    }

    const json = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      console.warn(`[${logTag}] Cannot parse response:`, text.slice(0, 200));
      return { postIds: [], error: true };
    }

    const postIds: string[] = JSON.parse(match[0]);
    return { postIds, error: false };
  } catch (e) {
    console.warn(`[${logTag}] error:`, e);
    return { postIds: [], error: true };
  }
}

export const runAiFilter = action({
  args: {
    intents:    v.array(v.string()),
    subreddits: v.array(v.string()),
  },
  handler: async (ctx, { intents, subreddits }): Promise<{ postIds: string[]; error: boolean }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { postIds: [], error: true };

    const cleanIntents = intents.filter(Boolean);
    if (cleanIntents.length === 0) {
      console.warn("[runAiFilter] no intents provided");
      return { postIds: [], error: false };
    }

    const posts = await ctx.runQuery(
      internal.aiFilter.getRecentPostsForUser,
      { userId, subreddits }
    );
    console.log(`[runAiFilter] intents: ${JSON.stringify(cleanIntents)} | subreddits: ${JSON.stringify(subreddits)} | candidate posts: ${posts.length}`);
    if (posts.length === 0) return { postIds: [], error: false };

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.warn("[runAiFilter] OPENROUTER_API_KEY not set");
      return { postIds: [], error: true };
    }

    return await matchPostsToIntents(
      posts.map((p) => ({ postId: p.postId, title: p.title, body: p.body })),
      cleanIntents,
      apiKey,
      "runAiFilter",
    );
  },
});
