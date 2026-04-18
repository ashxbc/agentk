import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

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
    keywordGroups:  v.optional(v.array(v.object({ name: v.string(), keywords: v.array(v.string()) }))),
    activeGroupIdx: v.optional(v.number()),
    minKarma:       v.optional(v.number()),
    alertsPerHour:  v.optional(v.number()),
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

    const wasIncomplete = !existing || existing.keywords.length === 0 || (existing.subreddits ?? []).length === 0;
    const willBeComplete = args.keywords.length > 0 && args.subreddits.length > 0;
    const isFirstSetup   = wasIncomplete && willBeComplete && !existing?.firstSetupAt;
    const firstSetupAt   = isFirstSetup ? { firstSetupAt: Date.now() } : {};

    if (existing) {
      await ctx.db.patch(existing._id, { ...args, ...firstSetupAt });
    } else {
      await ctx.db.insert("userSettings", { userId, ...args, lastFetchAt: 0, ...firstSetupAt });
    }

    // Kick off an immediate global fetch the first time a user has both keywords and subreddits
    if (isFirstSetup) {
      await ctx.scheduler.runAfter(0, internal.reddit.globalFetch, {});
    }
  },
});

export const setTourCompleted = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { tourCompleted: true });
    } else {
      await ctx.db.insert("userSettings", {
        userId, keywords: [], excluded: [], subreddits: [],
        minUpvotes: 0, minComments: 0, lastFetchAt: 0,
        tourCompleted: true,
      });
    }
  },
});

export const setAlertCap = mutation({
  args: { alertsPerHour: v.optional(v.number()) },
  handler: async (ctx, { alertsPerHour }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { alertsPerHour });
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
