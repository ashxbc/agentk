import { internalMutation, mutation, query } from "./_generated/server";
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

    // Check if this IP already has 3 or more different LIVE accounts.
    // Filter out stale rows whose users document was deleted (orphaned devices).
    const existing_for_ip = await ctx.db
      .query("userDevices")
      .withIndex("by_ip", (q) => q.eq("ip", ip))
      .collect();

    const liveOthersOnIp: typeof existing_for_ip = [];
    for (const d of existing_for_ip) {
      if (d.userId === userId) continue;
      const userExists = await ctx.db.get(d.userId);
      if (userExists) {
        liveOthersOnIp.push(d);
      } else {
        // Clean up orphaned device row while we're here
        await ctx.db.delete(d._id);
      }
    }
    const conflict = liveOthersOnIp.length >= 3 ? liveOthersOnIp[0] : null;

    if (conflict) {
      // Notify Telegram/Discord if the new account had a bot session
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

// One-shot: remove userDevices rows whose users document no longer exists.
// Run: npx convex run devices:cleanupOrphanedDevices
export const cleanupOrphanedDevices = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("userDevices").collect();
    let deleted = 0;
    for (const row of rows) {
      const user = await ctx.db.get(row.userId);
      if (!user) { await ctx.db.delete(row._id); deleted++; }
    }
    return { deleted };
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
