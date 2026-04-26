import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const TWENTY_FOUR_HOURS_SEC = 24 * 3600;
const TWENTY_FOUR_HOURS_MS  = 24 * 3600 * 1000;

export const getFeedPosts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const cutoffSec = Date.now() / 1000 - TWENTY_FOUR_HOURS_SEC;
    const posts = await ctx.db
      .query("feedPosts")
      .withIndex("by_user_fetched", (q) => q.eq("userId", userId))
      .collect();
    return posts
      .filter((p) => p.createdUtc >= cutoffSec)
      .sort((a, b) => b.createdUtc - a.createdUtc)
      .slice(0, 50);
  },
});

const postShape = v.object({
  postId:         v.string(),
  title:          v.string(),
  body:           v.string(),
  author:         v.string(),
  subreddit:      v.string(),
  url:            v.string(),
  ups:            v.number(),
  numComments:    v.number(),
  createdUtc:     v.number(),
  matchedQueries: v.array(v.string()),
});

export const upsertFeedPosts = internalMutation({
  args: {
    userId: v.id("users"),
    posts:  v.array(postShape),
  },
  handler: async (ctx, { userId, posts }) => {
    const insertedIds: string[] = [];
    for (const post of posts) {
      const existing = await ctx.db
        .query("feedPosts")
        .withIndex("by_user_post", (q) => q.eq("userId", userId).eq("postId", post.postId))
        .unique();
      if (existing) {
        const merged = [...new Set([...existing.matchedQueries, ...post.matchedQueries])];
        await ctx.db.patch(existing._id, { matchedQueries: merged, fetchedAt: Date.now() });
      } else {
        await ctx.db.insert("feedPosts", { userId, ...post, fetchedAt: Date.now() });
        insertedIds.push(post.postId);
      }
    }
    return insertedIds;
  },
});

export const deleteExpiredFeedPosts = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const cutoff = Date.now() - TWENTY_FOUR_HOURS_MS;
    const old = await ctx.db
      .query("feedPosts")
      .withIndex("by_user_fetched", (q) => q.eq("userId", userId))
      .filter((q) => q.lt(q.field("fetchedAt"), cutoff))
      .collect();
    await Promise.all(old.map((p) => ctx.db.delete(p._id)));
  },
});
