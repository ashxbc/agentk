import { action, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

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

// Client query: all posts for AI mode (no keyword filter) for given subreddits
export const getAiCandidatePosts = query({
  args: { subreddits: v.array(v.string()) },
  handler: async (ctx, { subreddits }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
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
    if (existing) {
      await ctx.db.patch(existing._id, { intents, subreddits });
    } else {
      await ctx.db.insert("aiModeSettings", { userId, intents, subreddits });
    }
  },
});

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

    const intentsList = cleanIntents
      .map((intent: string, n: number) => `${n + 1}. ${intent}`)
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
