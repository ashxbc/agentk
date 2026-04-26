import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getMyQueries = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return ctx.db
      .query("userQueries")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const saveQueries = mutation({
  args: {
    subreddits: v.array(v.string()),
    queries:    v.array(v.string()),
  },
  handler: async (ctx, { subreddits, queries }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const existing = await ctx.db
      .query("userQueries")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { subreddits, queries, generatedAt: Date.now() });
    } else {
      await ctx.db.insert("userQueries", { userId, subreddits, queries, generatedAt: Date.now() });
    }
  },
});

// Called from generateSetup action (internal)
export const saveQueriesInternal = internalMutation({
  args: {
    userId:     v.id("users"),
    subreddits: v.array(v.string()),
    queries:    v.array(v.string()),
  },
  handler: async (ctx, { userId, subreddits, queries }) => {
    const existing = await ctx.db
      .query("userQueries")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { subreddits, queries, generatedAt: Date.now() });
    } else {
      await ctx.db.insert("userQueries", { userId, subreddits, queries, generatedAt: Date.now() });
    }
  },
});

// Used by globalFetch to get all users with subreddits + queries
export const getAllActiveQueries = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("userQueries").collect();
    return all.filter((q) => q.subreddits.length > 0 && q.queries.length > 0);
  },
});
