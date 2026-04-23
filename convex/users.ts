import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// One-shot cleanup: deletes authAccounts entries whose users document no longer
// exists (orphaned by the old deleteAccount-in-verify-flow race condition).
// Also removes dangling authSessions for the same orphaned userIds.
// Run once: npx convex run users:cleanupOrphanedAccounts
export const cleanupOrphanedAccounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db.query("authAccounts").collect();
    const orphanedUserIds = new Set<string>();
    for (const account of accounts) {
      const user = await ctx.db.get(account.userId);
      if (!user) {
        orphanedUserIds.add(account.userId);
        await ctx.db.delete(account._id);
      }
    }
    for (const session of await ctx.db.query("authSessions").collect()) {
      if (orphanedUserIds.has(session.userId)) {
        await ctx.db.delete(session._id);
      }
    }
    return { deletedAccounts: orphanedUserIds.size, orphanedUserIds: [...orphanedUserIds] };
  },
});

// Internal: fetch a user by ID (used by Telegram webhook for /account).
export const getUserById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});

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

// Returns true if the current user was created via Google OAuth within the last 90 seconds.
// Used by the dashboard to detect a brand-new Google account created from the login form.
// `now` must be passed from the client (Date.now() is not deterministic in Convex queries).
export const isNewGoogleUser = query({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const user = await ctx.db.get(userId);
    if (!user) return false;
    if (now - user._creationTime >= 90_000) return false;
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .first();
    return account?.provider === "google";
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

    // Notify Telegram/Discord before deleting the token binding
    const agentToken = await ctx.db
      .query("agentTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (agentToken?.telegramChatId) {
      await ctx.scheduler.runAfter(0, internal.telegram.notifyAccountDeleted, {
        chatId: agentToken.telegramChatId,
      });
    }
    if (agentToken?.discordChannelId) {
      await ctx.scheduler.runAfter(0, internal.discord.notifyDiscordAccountDeleted, {
        discordChannelId: agentToken.discordChannelId,
      });
    }

    // Delete all user data rows
    for (const row of await ctx.db.query("userSettings").withIndex("by_user", (q) => q.eq("userId", userId)).collect())
      await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("redditResults").withIndex("by_user", (q) => q.eq("userId", userId)).collect())
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
