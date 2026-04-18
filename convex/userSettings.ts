import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getUserSettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const upsertUserSettings = mutation({
  args: {
    keywords:      v.array(v.string()),
    excluded:      v.array(v.string()),
    subreddits:    v.array(v.string()),
    minUpvotes:    v.number(),
    minComments:   v.number(),
    keywordGroups: v.optional(v.array(v.object({ name: v.string(), keywords: v.array(v.string()) }))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    if (args.keywords.length > 50) throw new Error("Maximum 50 keywords allowed.");
    if (args.subreddits.length > 5) throw new Error("Maximum 5 subreddits allowed.");

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { ...args });
    } else {
      await ctx.db.insert("userSettings", { userId, ...args, lastFetchAt: 0 });
    }
  },
});

export const getSettingsInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});
