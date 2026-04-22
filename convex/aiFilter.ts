import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
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

// Client query: all posts for AI mode (no keyword filter) for given subreddits
export const getAiCandidatePosts = query({
  args: { subreddits: v.array(v.string()) },
  handler: async (ctx, { subreddits }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    // Empty AI subreddits → empty AI feed (prevents normal-mode posts from leaking in).
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
    // Clear matched posts on every settings change — old matches may not align with new intents.
    if (existing) {
      await ctx.db.patch(existing._id, { intents, subreddits, matchedPostIds: [] });
    } else {
      await ctx.db.insert("aiModeSettings", { userId, intents, subreddits, matchedPostIds: [] });
    }
    // Run an immediate reconcile so the user sees matches without waiting for the next 5-min cron.
    await ctx.scheduler.runAfter(0, internal.aiFilter.reconcileUserAi, { userId });
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

// Overwrite matched set (used by reconcile after re-running against the full 6h pool).
export const replaceMatchedPostIds = internalMutation({
  args: { userId: v.id("users"), postIds: v.array(v.string()) },
  handler: async (ctx, { userId, postIds }) => {
    const existing = await ctx.db
      .query("aiModeSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!existing) return;
    await ctx.db.patch(existing._id, { matchedPostIds: postIds.slice(-MAX_MATCHED_IDS) });
  },
});

// Runs Gemini against the user's full 6h candidate pool. Triggered after settings change.
export const reconcileUserAi = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const settings = await ctx.runQuery(internal.aiFilter.getAiSettingsInternal, { userId });
    if (!settings) return;
    const cleanIntents = settings.intents.filter(Boolean);
    if (cleanIntents.length === 0 || settings.subreddits.length === 0) return;

    const posts = await ctx.runQuery(internal.aiFilter.getRecentPostsForUser, {
      userId, subreddits: settings.subreddits,
    });
    if (posts.length === 0) return;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.warn("[reconcileUserAi] OPENROUTER_API_KEY not set");
      return;
    }

    const { postIds, error } = await matchPostsToIntents(
      posts.map((p) => ({ postId: p.postId, title: p.title, body: p.body })),
      cleanIntents,
      apiKey,
      `reconcile:${userId}`,
    );
    if (error) return;
    console.log(`[reconcileUserAi] user ${userId} → ${postIds.length} matches across ${posts.length} candidates`);
    await ctx.runMutation(internal.aiFilter.replaceMatchedPostIds, { userId, postIds });
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
