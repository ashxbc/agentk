import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db.get(userId);
  },
});

export const getAuthProvider = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .first();
    return account?.provider ?? null;
  },
});

export const updateName = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await ctx.db.patch(userId, { name: name.trim() });
  },
});

export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Delete all user data rows
    for (const row of await ctx.db.query("userSettings").withIndex("by_user", (q) => q.eq("userId", userId)).collect())
      await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("redditResults").withIndex("by_user", (q) => q.eq("userId", userId)).collect())
      await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("userBilling").withIndex("by_user", (q) => q.eq("userId", userId)).collect())
      await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("subscriptions").withIndex("by_user", (q) => q.eq("userId", userId)).collect())
      await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("payments").withIndex("by_user", (q) => q.eq("userId", userId)).collect())
      await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("agentTokens").withIndex("by_user", (q) => q.eq("userId", userId)).collect())
      await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("alertedPosts").withIndex("by_user_post", (q) => q.eq("userId", userId)).collect())
      await ctx.db.delete(row._id);

    // Delete auth sessions and accounts
    for (const row of await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).collect())
      await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", userId)).collect())
      await ctx.db.delete(row._id);

    // Finally delete the user document
    await ctx.db.delete(userId);
  },
});
