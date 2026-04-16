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
    keywords:    v.array(v.string()),
    excluded:    v.array(v.string()),
    subreddits:  v.array(v.string()),
    minUpvotes:  v.number(),
    minComments: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const prevHasBoth = (existing?.keywords.length ?? 0) > 0 && (existing?.subreddits.length ?? 0) > 0;
    const nowHasBoth  = args.keywords.length > 0 && args.subreddits.length > 0;

    let fetchLoopId = existing?.fetchLoopId;

    // Transition → active: both conditions met for the first time — start loop
    if (!prevHasBoth && nowHasBoth) {
      if (fetchLoopId) {
        try { await ctx.scheduler.cancel(fetchLoopId); } catch {}
      }
      fetchLoopId = await ctx.scheduler.runAfter(0, internal.reddit.doFetchLoop, { userId });
    }

    // Transition → inactive: subreddits removed — stop loop immediately
    if (prevHasBoth && !nowHasBoth) {
      if (fetchLoopId) {
        try { await ctx.scheduler.cancel(fetchLoopId); } catch {}
      }
      fetchLoopId = undefined;
    }

    // prevHasBoth && nowHasBoth: loop keeps running, don't touch fetchLoopId
    // !prevHasBoth && !nowHasBoth: no loop exists, nothing to do

    const patch = { ...args, fetchLoopId };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("userSettings", { userId, ...patch, lastFetchAt: 0 });
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
