import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

export const registerDevice = mutation({
  args: {
    ip:        v.string(),
    userAgent: v.string(),
  },
  handler: async (ctx, { ip, userAgent }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Check if this IP is already registered to a different account
    const conflict = await ctx.db
      .query("userDevices")
      .withIndex("by_ip", (q) => q.eq("ip", ip))
      .first();

    if (conflict && conflict.userId !== userId) {
      // Notify Telegram if the new account had a bot session
      const agentToken = await ctx.db
        .query("agentTokens")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      if (agentToken?.telegramChatId) {
        await ctx.scheduler.runAfter(0, internal.telegram.notifyAccountDeleted, {
          chatId: agentToken.telegramChatId,
        });
      }

      // Delete new account's data
      for (const row of await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).collect())
        await ctx.db.delete(row._id);
      for (const row of await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", userId)).collect())
        await ctx.db.delete(row._id);
      for (const row of await ctx.db.query("agentTokens").withIndex("by_user", (q) => q.eq("userId", userId)).collect())
        await ctx.db.delete(row._id);
      await ctx.db.delete(userId);
      throw new Error("DEVICE_CONFLICT");
    }

    // Upsert device record for this user
    const existing = await ctx.db
      .query("userDevices")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ip, userAgent, lastSeenAt: now });
    } else {
      await ctx.db.insert("userDevices", { userId, ip, userAgent, registeredAt: now, lastSeenAt: now });
    }

    return { ok: true };
  },
});

// View your own device info (for settings panel if needed)
export const getMyDevice = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("userDevices")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});
