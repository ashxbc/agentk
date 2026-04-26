import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const getProfileByUserId = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const getAllCompletedProfiles = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("userProfile").collect();
    return all.filter((p) => p.completedAt != null);
  },
});

const profileArgs = {
  role:               v.union(v.literal("freelancer"), v.literal("marketer"), v.literal("builder")),
  whatTheySell:       v.optional(v.string()),
  targetCustomer:     v.optional(v.string()),
  painSignals:        v.optional(v.string()),
  proof:              v.optional(v.string()),
  marketingSpecialty: v.optional(v.string()),
  channels:           v.optional(v.string()),
  companyTypes:       v.optional(v.string()),
  companySize:        v.optional(v.string()),
  revenueRange:       v.optional(v.string()),
  growthProblem:      v.optional(v.string()),
  clientBottleneck:   v.optional(v.string()),
  metricsImproved:    v.optional(v.string()),
  bestResult:         v.optional(v.string()),
  productUrl:         v.optional(v.string()),
  productName:        v.optional(v.string()),
  productTagline:     v.optional(v.string()),
  productDescription: v.optional(v.string()),
  productTags:        v.optional(v.array(v.string())),
  revenueModel:       v.optional(v.union(v.literal("free"), v.literal("freemium"), v.literal("paid"))),
  stage:              v.optional(v.union(v.literal("idea"), v.literal("mvp"), v.literal("growth"))),
  userCount:          v.optional(v.string()),
  revenue:            v.optional(v.string()),
  icpWhoBluefit:      v.optional(v.string()),
  icpRole:            v.optional(v.string()),
  icpPainPoints:      v.optional(v.string()),
  icpSwitchTrigger:   v.optional(v.string()),
};

export const saveProfile = mutation({
  args: profileArgs,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const existing = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("userProfile", { userId, ...args });
    }
  },
});

export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const existing = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { completedAt: Date.now() });
    }
  },
});

export const resetOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const existing = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { completedAt: undefined });
    }
    // Also clear queries so generation re-runs
    const queries = await ctx.db
      .query("userQueries")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (queries) await ctx.db.delete(queries._id);
  },
});

export const patchIcp = internalMutation({
  args: {
    userId:           v.id("users"),
    icpWhoBluefit:    v.optional(v.string()),
    icpRole:          v.optional(v.string()),
    icpPainPoints:    v.optional(v.string()),
    icpSwitchTrigger: v.optional(v.string()),
  },
  handler: async (ctx, { userId, ...icp }) => {
    const existing = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) await ctx.db.patch(existing._id, icp);
  },
});
