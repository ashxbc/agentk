import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const registerDevice = mutation({
  args: {
    ip:        v.string(),
    userAgent: v.string(),
  },
  handler: async (ctx, { ip, userAgent }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

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
