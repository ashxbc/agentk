import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// Generates (or regenerates) the 12-char token for the authenticated user.
// Clears any existing telegramChatId so the old Telegram connection is invalidated.
export const generateToken = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const half = (s: string) => s.padEnd(6, "0").slice(0, 6);
    const token =
      (half(Math.random().toString(36).slice(2)) +
       half(Math.random().toString(36).slice(2))).toUpperCase();

    const existing = await ctx.db
      .query("agentTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { token, telegramChatId: undefined });
    } else {
      await ctx.db.insert("agentTokens", { userId, token });
    }

    return { token };
  },
});

// Returns the current agentTokens row for the authenticated user, or null.
export const getToken = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("agentTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

// Internal: find a token row by token string (used by telegram webhook).
export const getByToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    return await ctx.db
      .query("agentTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
  },
});

// Internal: find a token row by userId (used by sendAlerts to get chatId).
export const getByUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("agentTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

// Internal: bind a Telegram chatId to a token row after successful authentication.
export const bindChatId = internalMutation({
  args: { tokenId: v.id("agentTokens"), telegramChatId: v.string() },
  handler: async (ctx, { tokenId, telegramChatId }) => {
    await ctx.db.patch(tokenId, { telegramChatId });
  },
});

// Internal: returns all rows that have a bound telegramChatId (for the cron).
export const getConnectedUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("agentTokens").collect();
    return all.filter((r) => r.telegramChatId !== undefined);
  },
});
